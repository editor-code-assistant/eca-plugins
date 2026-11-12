#!/usr/bin/env node
// Self-check for ctx-eca-adapter.mjs.
//
// Run it:
//   node plugins/context-mode/hooks/ctx-eca-adapter.test.mjs
//
// It feeds the adapter the ECA payloads a real session produces and
// checks the ECA output it writes back, against both context-mode
// layouts. Exit code 0 = every case passed, 1 = at least one failed, so
// it can be wired into CI later.
//
// Environment:
//   CM_TEST_V1_ROOT   v1 package root
//                     (default: derived from `context-mode` on PATH)
//   CM_TEST_V2_ROOT   v2 package root
//                     (default: <this repo>/../context-mode/plugins/
//                     claude-code, i.e. the release bundle in a sibling
//                     checkout)
//   CM_TEST_SKIP_V1=1  skip the v1 suite (ctx-compat.mjs uses this)
//   CM_TEST_SKIP_V2=1  skip the v2 suite
//   CONTEXT_MODE_ECA_DEBUG=1   adapter diagnostics on stderr
//
// A suite is SKIPPED, not failed, when its package root is absent, so
// this file works with only v1 or only v2 installed. The driver never
// touches real state: it points the adapter at throwaway temp dirs for
// the context-mode data dir and the Claude config dir.
//
// Maintenance: a case is one ECA stdin payload plus an `expect`. Add a
// case whenever the adapter gains behaviour; keep the expectation
// narrow (one field) so a failure names one thing.

import { spawnSync } from 'node:child_process';
import {
  existsSync, mkdtempSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ADAPTER = join(HERE, 'ctx-eca-adapter.mjs');
const REPO = resolve(HERE, '..', '..', '..');
const PROJ = REPO;

const TMP = mkdtempSync(join(tmpdir(), 'eca-cm-test-'));
const BIG = join(TMP, 'big.txt');
const JUNK = 'x'.repeat(6000);
writeFileSync(BIG, Array.from({ length: 900 }, (_, i) =>
  `line ${i} padding padding padding`).join('\n') + '\n');

// ── package roots ───────────────────────────────────────────────────

function isFile(path) {
  try {
    return existsSync(path) && statSync(path).isFile();
  } catch {
    return false;
  }
}

function findOnPath(name) {
  const win = process.platform === 'win32';
  const exts = win ? ['', '.cmd', '.exe'] : [''];
  for (const dir of (process.env.PATH ?? '').split(win ? ';' : ':')) {
    if (dir === '') continue;
    for (const ext of exts) {
      const p = join(dir, name + ext);
      if (isFile(p)) return p;
    }
  }
  return null;
}

function v1Root() {
  if (process.env.CM_TEST_SKIP_V1 === '1') return null;
  const fromEnv = process.env.CM_TEST_V1_ROOT;
  if (fromEnv && isFile(join(fromEnv, 'start.mjs'))) return fromEnv;
  const bin = findOnPath('context-mode');
  if (bin === null) return null;
  const binDir = dirname(bin);
  for (const c of [
    resolve(binDir, '..', 'lib', 'node_modules', 'context-mode'),
    resolve(binDir, '..', 'share', 'node_modules', 'context-mode'),
  ]) {
    if (isFile(join(c, 'start.mjs'))) return c;
  }
  return null;
}

function v2Root() {
  if (process.env.CM_TEST_SKIP_V2 === '1') return null;
  const fromEnv = process.env.CM_TEST_V2_ROOT;
  if (fromEnv && isFile(join(fromEnv, 'hook.mjs'))) return fromEnv;
  const sibling = resolve(REPO, '..', 'context-mode', 'plugins', 'claude-code');
  return isFile(join(sibling, 'hook.mjs')) ? sibling : null;
}

// ── payload helpers ─────────────────────────────────────────────────

function base(extra) {
  return {
    cwd: PROJ,
    chat_id: 'test-chat',
    session_id: 'test-session',
    workspaces: [{ uri: `file://${PROJ}` }],
    ...extra,
  };
}

const shell = (command) => ({
  tool_name: 'shell_command', server: 'eca', tool_input: { command },
});

// ── expectations ────────────────────────────────────────────────────
// deny: approval === 'deny'      empty: {} output
// replaced: non-empty replacedOutput
// text: additionalContext matches a regex

function check(expect, out) {
  if (expect.empty === true) {
    return Object.keys(out).length === 0
      ? null : `expected {} but got ${JSON.stringify(out).slice(0, 120)}`;
  }
  if (expect.deny === true && out.approval !== 'deny') {
    return `expected approval "deny" but got ${JSON.stringify(out.approval)}`;
  }
  if (expect.ask === true && out.approval !== 'ask') {
    return `expected approval "ask" but got ${JSON.stringify(out.approval)}`;
  }
  if (expect.replaced === true) {
    const r = out.replacedOutput;
    if (typeof r !== 'string' || r === '') {
      return 'expected a non-empty replacedOutput';
    }
  }
  if (expect.noReplaced === true && out.replacedOutput !== undefined) {
    return 'expected no replacedOutput';
  }
  if (expect.text !== undefined) {
    const ac = out.additionalContext;
    if (typeof ac !== 'string' || !expect.text.test(ac)) {
      return `additionalContext does not match ${expect.text}`;
    }
  }
  if (expect.notText !== undefined) {
    const ac = out.additionalContext;
    if (typeof ac === 'string' && expect.notText.test(ac)) {
      return `additionalContext must not match ${expect.notText}`;
    }
  }
  return null;
}

// ── the cases ───────────────────────────────────────────────────────

const V1_CASES = [
  ['preToolCall curl is denied',
    base({ hook_type: 'preToolCall', ...shell('curl http://x') }),
    { deny: true }],
  ['preToolCall git is allowed',
    base({ hook_type: 'preToolCall', ...shell('git status') }),
    { empty: true }],
  ['chatStart injects context',
    base({ hook_type: 'chatStart', resumed: false }),
    { text: /context-mode/ }],
  ['postToolCall does not replace on v1',
    base({ hook_type: 'postToolCall', ...shell('cat big'),
      tool_response: JUNK }),
    { empty: true }],
  ['preCompact is a no-op',
    base({ hook_type: 'preCompact', triggered: 'auto' }),
    { empty: true }],
  ['postCompact injects context',
    base({ hook_type: 'postCompact', triggered: 'auto' }),
    { text: /context-mode/ }],
  ['preRequest is a no-op',
    base({ hook_type: 'preRequest', prompt: 'hi' }),
    { empty: true }],
];

const V2_CASES = [
  ['preToolCall curl is denied (adapter guard)',
    base({ hook_type: 'preToolCall', ...shell('curl http://x') }),
    { deny: true }],
  ['preToolCall curl to a quiet file is allowed',
    base({ hook_type: 'preToolCall',
      ...shell('curl -s -o out.json http://x') }),
    { empty: true }],
  ['preToolCall inline HTTP is denied',
    base({ hook_type: 'preToolCall',
      ...shell('node -e "fetch(\'http://x\')"') }),
    { deny: true }],
  ['a command merely mentioning curl is allowed',
    base({ hook_type: 'preToolCall',
      ...shell('echo "use curl to fetch"') }),
    { empty: true }],
  ['a build command is allowed',
    base({ hook_type: 'preToolCall', ...shell('mvn -q package') }),
    { empty: true }],
  ['preToolCall git is allowed',
    base({ hook_type: 'preToolCall', ...shell('git status') }),
    { empty: true }],
  ['an unbounded large read is denied',
    base({ hook_type: 'preToolCall', tool_name: 'read_file',
      server: 'eca', tool_input: { path: BIG } }),
    { deny: true }],
  ['a ranged large read is allowed',
    base({ hook_type: 'preToolCall', tool_name: 'read_file',
      server: 'eca', tool_input: { path: BIG, line_offset: 0, limit: 5 } }),
    { empty: true }],
  ['preToolCall grep is allowed',
    base({ hook_type: 'preToolCall', tool_name: 'grep', server: 'eca',
      tool_input: { path: PROJ, pattern: 'context-mode' } }),
    { empty: true }],
  ['chatStart injects the resume hint',
    base({ hook_type: 'chatStart', resumed: false }),
    { text: /ctx_search|context-mode/ }],
  ['the resume hint is rewritten on pre-0.171.1 ECA',
    base({ hook_type: 'chatStart', resumed: false, chat_id: 'hint-chat' }),
    { notText: /ctx_resume/ }],
  ['the resume hint keeps ctx_resume on ECA 0.171.1',
    base({ hook_type: 'chatStart', resumed: false, chat_id: 'new-chat',
      eca_version: '0.171.1' }),
    { text: /ctx_resume/ }],
  ['the resume hint is rewritten on ECA 0.170.6',
    base({ hook_type: 'chatStart', resumed: false, chat_id: 'old-chat',
      eca_version: '0.170.6' }),
    { notText: /ctx_resume/ }],
  ['the resume hint keeps ctx_resume on a later ECA',
    base({ hook_type: 'chatStart', resumed: false, chat_id: 'later-chat',
      eca_version: '0.200.0' }),
    { text: /ctx_resume/ }],
  ['the session-id override forces the new hint',
    base({ hook_type: 'chatStart', resumed: false, chat_id: 'ovr-on' }),
    { text: /ctx_resume/ },
    { CONTEXT_MODE_ECA_SESSION_ID: 'on' }],
  ['the session-id override forces the old hint',
    base({ hook_type: 'chatStart', resumed: false, chat_id: 'ovr-off',
      eca_version: '0.171.1' }),
    { notText: /ctx_resume/ },
    { CONTEXT_MODE_ECA_SESSION_ID: 'off' }],
  ['preRequest is a no-op',
    base({ hook_type: 'preRequest', prompt: 'hi' }),
    { empty: true }],
  ['a tool call id is accepted on preToolCall',
    base({ hook_type: 'preToolCall', ...shell('git status'),
      tool_call_id: 'call-1' }),
    { empty: true }],
  ['a tool call id does not disturb trimming',
    base({ hook_type: 'postToolCall', ...shell('cat big'),
      tool_call_id: 'call-2', tool_response: JUNK }),
    { replaced: true }],
  ['a big shell result is trimmed',
    base({ hook_type: 'postToolCall', ...shell('cat big'),
      tool_response: JUNK }),
    { replaced: true }],
  ['a big read result is not trimmed by default',
    base({ hook_type: 'postToolCall', tool_name: 'read_file',
      server: 'eca', tool_input: { path: BIG }, tool_response: JUNK }),
    { noReplaced: true }],
  ['a big read result is trimmed under policy trim',
    base({ hook_type: 'postToolCall', tool_name: 'read_file',
      server: 'eca', tool_input: { path: BIG }, tool_response: JUNK }),
    { replaced: true },
    { CONTEXT_MODE_ECA_READ_POLICY: 'trim' }],
  ['read_file is untouched under policy off',
    base({ hook_type: 'postToolCall', tool_name: 'read_file',
      server: 'eca', tool_input: { path: BIG }, tool_response: JUNK }),
    { empty: true },
    { CONTEXT_MODE_ECA_READ_POLICY: 'off' }],
  ['a big git result is trimmed',
    base({ hook_type: 'postToolCall', tool_name: 'git', server: 'eca',
      tool_input: { command: 'git log --oneline', operation: 'log' },
      tool_response: JUNK }),
    { replaced: true }],
  ['a small edit result is not trimmed',
    base({ hook_type: 'postToolCall', tool_name: 'edit_file',
      server: 'eca', tool_input: { path: join(PROJ, 'AGENTS.md'),
        original_content: 'a', new_content: 'b' },
      tool_response: 'ok' }),
    { empty: true }],
  ['a failed tool call is accepted',
    base({ hook_type: 'postToolCall', ...shell('false'),
      tool_response: '', error: 'exit 1' }),
    { empty: true }],
  ['postCompact injects the state block',
    base({ hook_type: 'postCompact', triggered: 'auto' }),
    { text: /context_mode_state|ctx_search/ }],
  ['preCompact is a no-op on v2',
    base({ hook_type: 'preCompact', triggered: 'auto' }),
    { empty: true }],
  ['a context-mode own tool call is allowed',
    base({ hook_type: 'preToolCall', tool_name: 'ctx_search',
      server: 'context-mode', tool_input: { queries: ['x'] } }),
    { empty: true }],
];

const ROBUST_CASES = [
  ['empty stdin emits nothing', '', null, { empty: true }],
  ['non-JSON stdin emits nothing', 'not json', null, { empty: true }],
  ['an unknown event emits nothing',
    base({ hook_type: 'chatStatusChanged' }), null, { empty: true }],
  ['a missing package emits nothing',
    base({ hook_type: 'preToolCall', ...shell('ls') }), '/nonexistent',
    { empty: true }],
];

// ── runner ──────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
let skipped = 0;

function fail(name, ...lines) {
  failed++;
  console.log([`FAIL  ${name}`, ...lines.map((l) => `      ${l}`)].join('\n'));
}

function run(name, root, payload, expect, env = {}) {
  const res = spawnSync(process.execPath, [ADAPTER], {
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    encoding: 'utf8',
    env: {
      ...process.env,
      CONTEXT_MODE_DATA_DIR: join(TMP, 'data'),
      CLAUDE_CONFIG_DIR: join(TMP, 'claude'),
      ...(root === null ? {} : { CONTEXT_MODE_ROOT: root }),
      ...env,
    },
    timeout: 30000,
    maxBuffer: 16 * 1024 * 1024,
  });
  const out = (res.stdout ?? '').trim();
  let parsed = null;
  try {
    parsed = out === '' ? {} : JSON.parse(out);
  } catch {
    fail(name, 'output is not JSON:', out.slice(0, 120));
    return;
  }
  const problem = check(expect, parsed);
  if (problem === null) {
    passed++;
    console.log(`ok    ${name}`);
  } else {
    fail(name, problem, `got: ${out.slice(0, 200)}`);
  }
}

function suite(label, root, cases) {
  console.log(`\n--- ${label}`);
  if (root === null) {
    skipped += cases.length;
    console.log(`SKIP  package root not found (${cases.length} cases)`);
    return;
  }
  for (const [name, payload, expect, env] of cases) {
    run(name, root, payload, expect, env ?? {});
  }
}

const v1 = v1Root();
const v2 = v2Root();
console.log(`adapter : ${ADAPTER}`);
console.log(`v1 root : ${v1 ?? '(not found)'}`);
console.log(`v2 root : ${v2 ?? '(not found)'}`);

suite('context-mode v1', v1, V1_CASES);
suite('context-mode v2', v2, V2_CASES);

console.log('\n--- robustness (no package needed)');
for (const [name, payload, root, expect] of ROBUST_CASES) {
  run(name, root, payload, expect);
}

// A settings file under <workspace>/.eca/context-mode.json wins over the
// default, so trim applies without the env var.
const cfgProj = join(TMP, 'cfgproj');
spawnSync('mkdir', ['-p', join(cfgProj, '.eca')]);
writeFileSync(join(cfgProj, '.eca', 'context-mode.json'),
  JSON.stringify({ readPolicy: 'trim' }));
console.log('\n--- settings file');
if (v2 === null) {
  skipped++;
  console.log('SKIP  package root not found (1 case)');
} else {
  run('project settings file selects trim', v2, {
    ...base({ hook_type: 'postToolCall', tool_name: 'read_file',
      server: 'eca', tool_input: { path: BIG }, tool_response: JUNK }),
    cwd: cfgProj,
  }, { replaced: true });
}

rmSync(TMP, { recursive: true, force: true });

console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped`);
process.exit(failed === 0 ? 0 : 1);
