#!/usr/bin/env node
// ctx-compat.mjs — is the installed context-mode still compatible with
// this ECA plugin, and is a newer release available?
//
// Run it by hand, or when ctx-eca-adapter.mjs says the installed version
// has not been validated:
//
//   node plugins/context-mode/hooks/ctx-compat.mjs
//   node plugins/context-mode/hooks/ctx-compat.mjs --validate
//   node plugins/context-mode/hooks/ctx-compat.mjs --validate=2.2.0
//
// It writes nothing outside a temp dir it creates for --validate.
//
// Exit codes: 0 ok, 10 update available, 20 incompatible, 30 unknown.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync,
  statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SELF_CHECK = join(HERE, 'ctx-eca-adapter.test.mjs');
const REGISTRY_URL =
  'https://registry.npmjs.org/-/package/context-mode/dist-tags';
const REPO_URL = 'https://github.com/mksglu/context-mode.git';
const NET_TIMEOUT_MS = 2000;
const DOWNLOAD_TIMEOUT_MS = 180000;
const CHECK_TIMEOUT_MS = 300000;

const EXIT = { ok: 0, update: 10, incompatible: 20, unknown: 30 };

// ── package root and version ────────────────────────────────────────
// Keep these markers in sync with ctx-eca-adapter.mjs (detectVersion).

const V2_MARKERS = ['hook.mjs', 'server.mjs'];
const V1_MARKERS = [join('hooks', 'pretooluse.mjs'), 'start.mjs'];

function isFile(path) {
  try {
    return existsSync(path) && statSync(path).isFile();
  } catch {
    return false;
  }
}

function detectLayout(root) {
  if (V2_MARKERS.every((n) => isFile(join(root, n)))) return 'v2';
  if (V1_MARKERS.every((n) => isFile(join(root, n)))) return 'v1';
  return null;
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

function candidatesFromBin(bin) {
  const binDir = dirname(bin);
  return [
    resolve(binDir, '..', 'lib', 'node_modules', 'context-mode'),
    resolve(binDir, '..', 'share', 'node_modules', 'context-mode'),
    resolve(binDir, '..', '..', 'lib', 'node_modules', 'context-mode'),
    resolve(binDir, '..', '..'),
    resolve(binDir, '..'),
  ];
}

function resolveRoot() {
  const explicit = process.env.CONTEXT_MODE_ROOT;
  if (explicit && detectLayout(explicit) !== null) {
    return resolve(explicit);
  }
  const bins = [];
  if (process.env.CONTEXT_MODE_BIN) bins.push(process.env.CONTEXT_MODE_BIN);
  const onPath = findOnPath('context-mode');
  if (onPath !== null) bins.push(onPath);
  for (const bin of bins) {
    for (const candidate of candidatesFromBin(bin)) {
      if (detectLayout(candidate) !== null) return candidate;
    }
  }
  return null;
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function packageVersion(root) {
  const pkg = readJson(join(root, 'package.json'));
  return pkg !== null && typeof pkg.version === 'string'
    ? pkg.version
    : null;
}

function minorOf(version) {
  const m = /^(\d+)\.(\d+)/.exec(String(version ?? ''));
  return m === null ? null : `${m[1]}.${m[2]}`;
}

function validatedMinors() {
  const data = readJson(join(HERE, 'validated-versions.json'));
  const list = data === null ? undefined : data.validated;
  return Array.isArray(list)
    ? list.filter((v) => typeof v === 'string')
    : [];
}

function compareVersions(a, b) {
  const pa = String(a).split('.').map((n) => Number.parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) {
      return (pa[i] ?? 0) - (pb[i] ?? 0);
    }
  }
  return 0;
}

// ── latest release (best effort) ────────────────────────────────────

async function latestVersion() {
  try {
    const res = await fetch(REGISTRY_URL, {
      signal: AbortSignal.timeout(NET_TIMEOUT_MS),
      headers: { accept: 'application/json' },
    });
    if (!res.ok) return { version: null, note: `HTTP ${res.status}` };
    const data = await res.json();
    const version = typeof data.latest === 'string' ? data.latest : null;
    return { version, note: version === null ? 'no latest tag' : null };
  } catch (err) {
    return { version: null, note: err?.name ?? String(err) };
  }
}

// ── validation ──────────────────────────────────────────────────────

function download(version, dir) {
  const packed = spawnSync('npm', ['pack', `context-mode@${version}`], {
    cwd: dir,
    encoding: 'utf8',
    timeout: DOWNLOAD_TIMEOUT_MS,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (packed.status === 0) {
    const tarball = (packed.stdout ?? '').trim().split('\n').pop() ?? '';
    if (tarball !== '' && isFile(join(dir, tarball))) {
      const unpacked = join(dir, 'unpacked');
      mkdirSync(unpacked, { recursive: true });
      const untar = spawnSync('tar', ['-xzf', join(dir, tarball),
        '-C', unpacked], { encoding: 'utf8', timeout: 60000 });
      const root = join(unpacked, 'package');
      if (untar.status === 0 && detectLayout(root) !== null) {
        return { root, via: 'npm pack' };
      }
    }
  }
  const cloneDir = join(dir, 'clone');
  const clone = spawnSync('git', ['clone', '--depth', '1', '--branch',
    `v${version}`, REPO_URL, cloneDir], {
    encoding: 'utf8',
    timeout: DOWNLOAD_TIMEOUT_MS,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (clone.status === 0) {
    const bundle = join(cloneDir, 'plugins', 'claude-code');
    if (detectLayout(bundle) !== null) {
      return { root: bundle, via: `git clone v${version}` };
    }
  }
  return {
    root: null,
    via: null,
    hint: `npm pack context-mode@${version}   # or: git clone --depth 1 `
      + `--branch v${version} ${REPO_URL}`,
  };
}

function runSelfCheck(root, layout) {
  const env = { ...process.env };
  if (layout === 'v2') {
    env.CM_TEST_V2_ROOT = root;
    env.CM_TEST_SKIP_V1 = '1';
  } else {
    env.CM_TEST_V1_ROOT = root;
    env.CM_TEST_SKIP_V2 = '1';
  }
  const res = spawnSync(process.execPath, [SELF_CHECK], {
    encoding: 'utf8',
    env,
    timeout: CHECK_TIMEOUT_MS,
    maxBuffer: 16 * 1024 * 1024,
  });
  const out = res.stdout ?? '';
  const summary = /(\d+) passed, (\d+) failed, (\d+) skipped/.exec(out);
  return {
    ok: summary !== null && summary[2] === '0',
    summary: summary === null ? null : summary[0],
    failures: out.split('\n').filter((l) => l.startsWith('FAIL')),
    raw: out,
  };
}

// ── report ──────────────────────────────────────────────────────────

function field(label, value) {
  return `  ${label.padEnd(14)}${value}`;
}

function printReport(state) {
  const { root, layout, version, latest, known, verdict } = state;
  console.log('context-mode ECA compatibility check\n');
  console.log(field('plugin', HERE));
  console.log(field('context-mode', root === null
    ? 'not found on PATH'
    : `${root} (${layout})`));
  console.log(field('version', version ?? 'unknown'));
  console.log(field('node', process.version));
  console.log(field('validated', known.length === 0
    ? '(none listed)'
    : known.join(', ')));
  const latestText = latest.version
    ?? `unavailable (${latest.note})`;
  console.log(field('latest', latestText));
  console.log(field('verdict', verdict.label));
  if (verdict.detail !== null) console.log(`\n  ${verdict.detail}`);
}

function maintainerReport(state) {
  console.log('\n── what to inspect ────────────────────────────────');
  console.log('  The self-check above fails when the plugin no longer');
  console.log('  matches context-mode\'s hook contract. In the');
  console.log('  context-mode source, these are the files that decide');
  console.log('  it, in the order worth reading:');
  console.log('');
  console.log('    src/adapters/claude-code.ts   decode/encode shape');
  console.log('    src/adapters/table.ts         the claude-code row');
  console.log('    src/core/hooks/dispatch.ts    policy and decisions');
  console.log('    src/prompt/tools/*.md         tool contracts');
  console.log('    build/build.mjs               shipped entry names');
  console.log('');
  console.log('  Then adjust hooks/ctx-eca-adapter.mjs and add the');
  console.log('  release to hooks/validated-versions.json.');
}

// ── main ────────────────────────────────────────────────────────────

function verdictFor(version, latest, known, state) {
  if (state.root === null) {
    return { label: 'NOT INSTALLED', exit: EXIT.unknown, detail: null };
  }
  if (state.layout === null) {
    return {
      label: 'UNKNOWN LAYOUT',
      exit: EXIT.incompatible,
      detail: 'context-mode is installed but its package layout is not '
        + 'one this plugin knows, so the plugin is inactive.',
    };
  }
  const minor = minorOf(version);
  const validated = minor !== null && known.includes(minor);
  if (latest.version !== null && version !== null
      && compareVersions(latest.version, version) > 0) {
    return {
      label: validated
        ? 'UPDATE AVAILABLE (installed version validated)'
        : 'UPDATE AVAILABLE (installed version NOT validated)',
      exit: validated ? EXIT.update : EXIT.incompatible,
      detail: 'Update with `npm i -g context-mode`, then re-run '
        + '`node ' + SELF_CHECK + '`.',
    };
  }
  if (!validated) {
    return {
      label: 'INSTALLED VERSION NOT VALIDATED',
      exit: EXIT.incompatible,
      detail: 'Run `node ' + SELF_CHECK + '` to check it, or '
        + '`node ' + join(HERE, 'ctx-compat.mjs') + ' --validate`.',
    };
  }
  return { label: 'OK', exit: EXIT.ok, detail: null };
}

function parseArgs(argv) {
  const opts = { validate: false, version: null, json: false, help: false };
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg === '--json') opts.json = true;
    else if (arg === '--validate') opts.validate = true;
    else if (arg.startsWith('--validate=')) {
      opts.validate = true;
      opts.version = arg.slice('--validate='.length);
    }
  }
  return opts;
}

function usage() {
  console.log('usage: node ctx-compat.mjs [--validate[=VERSION]] [--json]');
  console.log('');
  console.log('  (default)   report the installed version, the layout, the');
  console.log('              validated list, and the latest release');
  console.log('  --validate  also fetch the target version into a temp dir');
  console.log('              and run the adapter self-check against it');
  console.log('  --json      machine-readable report');
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    usage();
    return EXIT.ok;
  }

  const root = resolveRoot();
  const layout = root === null ? null : detectLayout(root);
  const version = root === null ? null : packageVersion(root);
  const known = validatedMinors();
  const latest = await latestVersion();

  const state = { root, layout, version, latest, known };
  const verdict = verdictFor(version, latest, known, state);
  state.verdict = verdict;

  let validation = null;
  if (opts.validate) {
    const target = opts.version ?? latest.version ?? version;
    if (target === null) {
      console.log('cannot validate: no version to target');
      return EXIT.unknown;
    }
    const tmp = mkdtempSync(join(tmpdir(), 'ctx-compat-'));
    try {
      let targetRoot;
      let via;
      let hint = null;
      if (target === version && root !== null) {
        targetRoot = root;
        via = 'already installed';
      } else {
        const got = download(target, tmp);
        targetRoot = got.root;
        via = got.via;
        hint = got.hint ?? null;
      }
      if (targetRoot === null) {
        console.log(`\n  could not download context-mode@${target}.`);
        console.log(`  Run it yourself, then re-run the self-check:`);
        console.log(`    ${hint}`);
        validation = { target, ok: false, summary: null, failures: [] };
      } else {
        const result = runSelfCheck(targetRoot, detectLayout(targetRoot));
        validation = { target, via, ...result };
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }

  if (opts.json) {
    console.log(JSON.stringify({
      root, layout, version, known, latest, verdict,
      validation: validation === null ? null : {
        target: validation.target,
        ok: validation.ok,
        summary: validation.summary,
        failures: validation.failures,
      },
    }, null, 2));
    if (validation !== null && !validation.ok) return EXIT.incompatible;
    return verdict.exit;
  }

  printReport(state);

  if (validation !== null) {
    console.log('\n── validation ─────────────────────────────────────');
    console.log(field('target', validation.target));
    if (validation.via !== undefined) {
      console.log(field('fetched', validation.via));
    }
    console.log(field('self-check', validation.summary ?? 'did not run'));
    for (const line of validation.failures ?? []) {
      console.log(`\n  ${line}`);
    }
    if (validation.ok) {
      console.log('\n  The new version passes every probe. Safe to update.');
    } else {
      console.log('\n  The new version does NOT match the contract this');
      console.log('  plugin expects. Do not update yet — the adapter needs');
      console.log('  a change first.');
      maintainerReport(state);
    }
  }

  return validation !== null && !validation.ok
    ? EXIT.incompatible
    : verdict.exit;
}

main().then((code) => {
  process.exitCode = code;
}).catch((err) => {
  console.error(`ctx-compat: ${err?.message ?? err}`);
  process.exitCode = EXIT.unknown;
});
