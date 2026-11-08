#!/usr/bin/env node
// ctx-eca-adapter.mjs — bridge ECA hook events to context-mode.
//
// ECA (editor-code-assistant) and context-mode do not share a hook
// protocol. ECA sends its own snake_case payload and honours its own
// output fields (additionalContext, approval, replacedOutput); every
// context-mode hook entry is Claude-shaped (hook_event_name, tool_name,
// tool_input, tool_response -> hookSpecificOutput). This adapter is the
// translation layer:
//
//   ECA stdin          -> Claude-shaped stdin -> context-mode hook entry
//   context-mode stdout -> ECA output fields
//
// It is version-aware. v2 ships one `hook.mjs --agent claude-code`
// bundle; v1 ships per-event `hooks/<event>.mjs` scripts. Both are
// Claude-shaped, so only the entry path differs.
//
// It never fails the host: any error ends in empty output (allow).
//
// Env:
//   CONTEXT_MODE_ROOT            package root override (testing)
//   CONTEXT_MODE_BIN             context-mode binary path (set by the
//                                wrapper; used to derive the root)
//   CONTEXT_MODE_ECA_READ_POLICY trim | noreplace | off
//   CONTEXT_MODE_ECA_DEBUG=1     debug lines on stderr
//
// Settings file (read by the adapter itself, ECA config schema is
// closed so there is no ECA-native plugin setting):
//   <XDG_CONFIG_HOME|~/.config>/eca/context-mode.json  {"readPolicy": ...}
//   <workspace>/.eca/context-mode.json                 {"readPolicy": ...}

import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEBUG = process.env.CONTEXT_MODE_ECA_DEBUG === '1';
const SPAWN_TIMEOUT_MS = 25000;
const MAX_BUFFER_BYTES = 16 * 1024 * 1024;
const HERE = dirname(fileURLToPath(import.meta.url));
const WARN_THROTTLE_MS = 24 * 60 * 60 * 1000;

function debug(message) {
  if (DEBUG) process.stderr.write(`[context-mode eca] ${message}\n`);
}

// ── context-mode package root and version ───────────────────────────

const V2_MARKERS = ['hook.mjs', 'server.mjs'];
const V1_MARKERS = [join('hooks', 'pretooluse.mjs'), 'start.mjs'];

function isFile(path) {
  try {
    return existsSync(path) && statSync(path).isFile();
  } catch {
    return false;
  }
}

// 2 = v2 (single hook.mjs bundle), 1 = v1 (per-event hooks/*.mjs),
// 0 = not a context-mode package root.
function detectVersion(root) {
  if (typeof root !== 'string' || root === '') return 0;
  if (V2_MARKERS.every((name) => isFile(join(root, name)))) return 2;
  if (V1_MARKERS.every((name) => isFile(join(root, name)))) return 1;
  return 0;
}

// A global npm/mise install puts the package at
// <bin-dir>/../lib/node_modules/context-mode (or ../share/...).
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

function findOnPath(name) {
  const win = process.platform === 'win32';
  const extensions = win ? ['', '.cmd', '.exe'] : [''];
  const pathVar = process.env.PATH ?? '';
  for (const dir of pathVar.split(win ? ';' : ':')) {
    if (dir === '') continue;
    for (const ext of extensions) {
      const candidate = join(dir, name + ext);
      if (isFile(candidate)) return candidate;
    }
  }
  return null;
}

function resolveRoot() {
  const explicit = process.env.CONTEXT_MODE_ROOT;
  const explicitVersion = detectVersion(explicit);
  if (explicitVersion !== 0) {
    return { root: resolve(explicit), version: explicitVersion };
  }
  const bins = [];
  if (process.env.CONTEXT_MODE_BIN) bins.push(process.env.CONTEXT_MODE_BIN);
  const onPath = findOnPath('context-mode');
  if (onPath !== null) bins.push(onPath);
  for (const bin of bins) {
    for (const candidate of candidatesFromBin(bin)) {
      const version = detectVersion(candidate);
      if (version !== 0) return { root: candidate, version };
    }
  }
  return null;
}

// ── ECA payload accessors ───────────────────────────────────────────

function workspaceDir(input) {
  const workspaces = input?.workspaces;
  if (Array.isArray(workspaces) && workspaces.length > 0) {
    const first = workspaces[0];
    if (typeof first === 'string' && first !== '') return first;
    if (first !== null && typeof first === 'object') {
      if (typeof first.path === 'string' && first.path !== '') {
        return first.path;
      }
      if (typeof first.uri === 'string' && first.uri !== '') {
        try {
          return fileURLToPath(first.uri);
        } catch {
          // not a file: URI — fall through to the next source
        }
      }
    }
  }
  return undefined;
}

function projectDir(input) {
  if (typeof input?.cwd === 'string' && input.cwd !== '') return input.cwd;
  return workspaceDir(input) ?? process.cwd();
}

function sessionId(input) {
  const id = input?.chat_id ?? input?.session_id;
  if (typeof id === 'string' && id !== '') return id;
  return `eca-pid-${process.ppid}`;
}

// ── ECA tool names and inputs -> Claude shapes ──────────────────────

const CM_PREFIX = 'mcp__plugin_context-mode_context-mode__';

const CM_OWN_TOOLS = new Set([
  'ctx_execute',
  'ctx_batch',
  'ctx_index',
  'ctx_search',
  'ctx_resume',
  'ctx_stats',
  'ctx_doctor',
  'ctx_upgrade',
  'ctx_purge',
  // v1 names, kept so a stale payload still maps to this server
  'ctx_execute_file',
  'ctx_batch_execute',
  'ctx_fetch_and_index',
]);

const ECA_TO_CLAUDE = Object.freeze({
  shell_command: 'Bash',
  read_file: 'Read',
  grep: 'Grep',
  directory_tree: 'Glob',
  write_file: 'Write',
  edit_file: 'Edit',
  move_file: 'Edit',
  preview_file_change: 'Edit',
  git: 'Bash',
  spawn_agent: 'Agent',
  ask_user: 'AskUserQuestion',
  task: 'TodoWrite',
});

function claudeToolName(input) {
  const tool = String(input?.tool_name ?? '');
  if (CM_OWN_TOOLS.has(tool)) return CM_PREFIX + tool;
  const server = input?.server;
  if (typeof server === 'string' && server !== '' && server !== 'eca') {
    return `mcp__${server}__${tool}`;
  }
  return ECA_TO_CLAUDE[tool] ?? tool;
}

// Keep every original key; add the Claude-shaped aliases the policy
// reads (file_path, offset, command, questions).
function claudeToolInput(input) {
  const raw = input?.tool_input;
  const source = raw !== null && typeof raw === 'object'
    && !Array.isArray(raw) ? raw : {};
  const out = { ...source };
  const tool = String(input?.tool_name ?? '');
  if (tool === 'read_file' && out.offset === undefined
      && out.line_offset !== undefined) {
    out.offset = out.line_offset;
  }
  if (tool === 'move_file' && out.file_path === undefined
      && typeof out.source === 'string') {
    out.file_path = out.source;
  }
  if (tool === 'git' && typeof out.command !== 'string'
      && typeof out.operation === 'string') {
    out.command = `git ${out.operation}`.trim();
  }
  if (tool === 'ask_user' && out.questions === undefined) {
    out.questions = [{
      question: typeof out.question === 'string' ? out.question : '',
      options: Array.isArray(out.options) ? out.options : [],
    }];
  }
  return out;
}

function jsonSafe(value) {
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return String(value);
  }
}

// v2 reads a Bash-shaped object (stdout/stderr/is_error) and still
// returns a plain string for non-Bash tools, so the replace text stays
// usable as an ECA replacedOutput. v1 wants the string it journals.
function claudeToolResponse(input, version) {
  const raw = input?.tool_response;
  const text = typeof raw === 'string' ? raw
    : raw === undefined || raw === null ? '' : jsonSafe(raw);
  if (version === 2) {
    return { stdout: text, stderr: '', is_error: Boolean(input?.error) };
  }
  return text;
}

// ECA gives a stable id per tool call. Passing it as tool_use_id keeps
// v2's replace source labels distinct when the same command runs twice in
// one session — the hook event's turn is always 0 for us, so without this
// the label would end in "#0" every time.
function callId(input) {
  const id = input?.tool_call_id;
  return typeof id === 'string' && id !== '' ? { tool_use_id: id } : {};
}

// ── ECA event -> Claude hook payload ────────────────────────────────

function claudePayload(input, event, version, dir) {
  const base = { session_id: sessionId(input), cwd: dir };
  switch (event) {
    case 'chatstart':
      return {
        ...base,
        hook_event_name: 'SessionStart',
        source: input?.resumed === true ? 'resume' : 'startup',
      };
    case 'prerequest':
      return {
        ...base,
        hook_event_name: 'UserPromptSubmit',
        prompt: typeof input?.prompt === 'string' ? input.prompt : '',
      };
    case 'pretoolcall':
      return {
        ...base,
        hook_event_name: 'PreToolUse',
        tool_name: claudeToolName(input),
        tool_input: claudeToolInput(input),
        ...callId(input),
      };
    case 'posttoolcall':
      return {
        ...base,
        hook_event_name: 'PostToolUse',
        tool_name: claudeToolName(input),
        tool_input: claudeToolInput(input),
        tool_response: claudeToolResponse(input, version),
        tool_output: { isError: Boolean(input?.error) },
        ...callId(input),
      };
    case 'precompact':
      return { ...base, hook_event_name: 'PreCompact' };
    case 'postcompact':
      return { ...base, hook_event_name: 'SessionStart', source: 'compact' };
    default:
      return null;
  }
}

// ── running the context-mode hook entry ─────────────────────────────

const V1_ENTRY = Object.freeze({
  chatstart: 'sessionstart.mjs',
  prerequest: 'userpromptsubmit.mjs',
  pretoolcall: 'pretooluse.mjs',
  posttoolcall: 'posttooluse.mjs',
  precompact: 'precompact.mjs',
  postcompact: 'sessionstart.mjs',
});

function hookArgs(root, version, event) {
  if (version === 2) {
    return [join(root, 'hook.mjs'), '--agent', 'claude-code'];
  }
  const entry = V1_ENTRY[event];
  return entry === undefined ? null : [join(root, 'hooks', entry)];
}

// Returns stdout on a clean exit, or null when the entry failed.
function runHook(args, payload, dir) {
  const result = spawnSync(process.execPath, args, {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
    timeout: SPAWN_TIMEOUT_MS,
    maxBuffer: MAX_BUFFER_BYTES,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (result.error) {
    debug(`spawn failed: ${result.error.message}`);
    return null;
  }
  if (result.status !== 0) {
    debug(`entry exited ${result.status}: ${(result.stderr ?? '').trim()}`);
    return null;
  }
  return result.stdout ?? '';
}

// ── Claude-shape output -> ECA output fields ────────────────────────

const CM_NAME_RE =
  /mcp__(?:plugin_context-mode_context-mode|context-mode|context_mode)__/g;
const CM_NAME_RE_UNDERSCORE = /mcp_(?:context-mode|context_mode)_/g;
const BARE_CTX_RE = new RegExp(
  '(?<![\\w-])ctx_'
  + '(execute_file|batch_execute|fetch_and_index|execute|batch|index'
  + '|search|resume|stats|doctor|upgrade|purge)\\b',
  'g',
);

// v2's SessionStart hint points at ctx_resume, which cannot see this
// plugin's rows until ECA sends _meta.sessionId (see the README). Point
// at the query that does work. Matches after the prefix rewrite above.
const RESUME_HINT_RE =
  /Call context-mode__ctx_resume for a summary of what happened\./g;
const RESUME_HINT_FIX =
  'Run context-mode__ctx_search(sort: "timeline") to see what happened '
  + 'earlier.';

function rewriteToolNames(text) {
  return String(text)
    .replace(CM_NAME_RE, 'context-mode__')
    .replace(CM_NAME_RE_UNDERSCORE, 'context-mode__')
    .replace(BARE_CTX_RE, 'context-mode__ctx_$1')
    .replace(RESUME_HINT_RE, RESUME_HINT_FIX);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

// The replace text is a string for most tools, the host's shell object
// ({stdout, stderr, interrupted}) for Bash, and a text-block array for
// MCP results. ECA wants one string.
function asText(value) {
  if (typeof value === 'string') return value;
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) {
    const parts = value
      .map((block) => block !== null && typeof block === 'object'
        && typeof block.text === 'string' ? block.text : '')
      .filter((text) => text !== '');
    return parts.join('\n');
  }
  if (typeof value === 'object') {
    if (typeof value.stdout === 'string') return value.stdout;
    const file = value.file;
    if (file !== null && typeof file === 'object'
        && typeof file.content === 'string') {
      return file.content;
    }
    if (typeof value.content === 'string') return value.content;
    if (typeof value.result === 'string') return value.result;
    if (Array.isArray(value.filenames)) return value.filenames.join('\n');
  }
  return jsonSafe(value);
}

function translateOutput(stdout) {
  const text = String(stdout ?? '').trim();
  if (text === '') return {};
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return {};
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return {};
  }

  const scope = data.hookSpecificOutput !== null
    && typeof data.hookSpecificOutput === 'object'
    && !Array.isArray(data.hookSpecificOutput)
    ? data.hookSpecificOutput
    : {};

  const additional =
    nonEmptyString(scope.additionalContext)
    ?? nonEmptyString(data.additionalContext);
  const decision =
    nonEmptyString(scope.permissionDecision)
    ?? nonEmptyString(data.permissionDecision);
  const reason =
    nonEmptyString(scope.permissionDecisionReason)
    ?? nonEmptyString(data.permissionDecisionReason);
  const legacyDecision = nonEmptyString(data.decision);
  const legacyReason = nonEmptyString(data.reason);
  const replaced = scope.updatedToolOutput !== undefined
    ? scope.updatedToolOutput
    : data.updatedToolOutput !== undefined
      ? data.updatedToolOutput
      : data.replacedOutput;

  const out = {};
  const replacedText = replaced === undefined ? null : asText(replaced);
  if (replacedText !== null) {
    out.replacedOutput = rewriteToolNames(replacedText);
  }

  const denied = decision === 'deny'
    || legacyDecision === 'deny'
    || legacyDecision === 'block';
  if (denied) {
    out.approval = 'deny';
    const why = reason ?? legacyReason ?? additional;
    if (why !== undefined) out.additionalContext = rewriteToolNames(why);
  } else {
    if (decision === 'ask') out.approval = 'ask';
    if (additional !== undefined) {
      out.additionalContext = rewriteToolNames(additional);
    }
  }

  if (data.continue === false) out.continue = false;
  const stopReason = nonEmptyString(data.stopReason);
  if (stopReason !== undefined) out.stopReason = stopReason;
  const systemMessage = nonEmptyString(data.systemMessage);
  if (systemMessage !== undefined) {
    out.systemMessage = rewriteToolNames(systemMessage);
  }
  if (data.suppressOutput === true) out.suppressOutput = true;
  return out;
}

// ── ECA-specific network guard ──────────────────────────────────────
//
// v2 applies its curl/wget/inline-HTTP deny only to rows that have no
// post-run replace (ADR-0016): a replace-capable host runs the command
// and PostToolUse trims a large result. ECA does have a replace
// channel, so on its own it would allow every direct fetch. The
// plugin's rules promise a hard block for direct fetches, so the
// adapter adds that block back, narrowly: only curl/wget and inline
// HTTP in a shell command. Builds and shell dumps stay on the replace
// path, where a large result is trimmed and indexed instead of refused.

const SHELL_NETWORK_RE = /(?:^|[;&|(`\n])\s*(?:curl|wget)\b/;
const CURL_TO_FILE_RE =
  /\s(?:-o|--output|-O|--output-document)(?:\s|=)\S/;
const CURL_QUIET_RE =
  /(?:^|\s)(?:-[A-Za-z]*[sq][A-Za-z]*|--silent|--quiet)(?=\s|$)/;
const INLINE_HTTP_RE = new RegExp(
  '(?:fetch\\s*\\(\\s*[\'"`]https?:'
  + '|requests\\.(?:get|post|put)\\s*\\('
  + '|http\\.(?:get|request)\\s*\\()',
);

// 'curl' | 'inline-http' | null
function networkFlood(command) {
  const cmd = String(command ?? '');
  if (cmd === '') return null;
  if (INLINE_HTTP_RE.test(cmd)) return 'inline-http';
  if (!SHELL_NETWORK_RE.test(cmd)) return null;
  // Body straight to a file with a silent flag: nothing reaches stdout.
  if (CURL_TO_FILE_RE.test(cmd) && CURL_QUIET_RE.test(cmd)) return null;
  return 'curl';
}

function networkDenyReason(kind, command) {
  const call = JSON.stringify({
    language: 'shell',
    code: String(command),
    intent: 'state what you need',
  });
  const lead = kind === 'inline-http'
    ? 'this inline HTTP call sends its body into the conversation.'
    : 'this curl/wget call sends its body into the conversation.';
  return [
    `context-mode: ${lead}`,
    'Run it in the sandbox instead; the full output is indexed and only',
    'the part that matches your intent comes back.',
    'Tool: context-mode__ctx_execute',
    call,
  ].join('\n');
}

// ── read_file policy setting ────────────────────────────────────────

const READ_POLICIES = new Set(['trim', 'noreplace', 'off']);
const DEFAULT_READ_POLICY = 'noreplace';

function ecaConfigDir() {
  const xdg = process.env.XDG_CONFIG_HOME;
  if (typeof xdg === 'string' && xdg !== '') return join(xdg, 'eca');
  return join(homedir(), '.config', 'eca');
}

function readJsonFile(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function policyFrom(data) {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return undefined;
  }
  const value = data.readPolicy;
  return typeof value === 'string' && READ_POLICIES.has(value)
    ? value
    : undefined;
}

// Env var, then the project file, then the global file, then default.
function readPolicySetting(dir) {
  const env = process.env.CONTEXT_MODE_ECA_READ_POLICY;
  if (typeof env === 'string' && READ_POLICIES.has(env.trim())) {
    return env.trim();
  }
  const project = policyFrom(
    readJsonFile(join(dir, '.eca', 'context-mode.json')),
  );
  if (project !== undefined) return project;
  const global = policyFrom(
    readJsonFile(join(ecaConfigDir(), 'context-mode.json')),
  );
  return global ?? DEFAULT_READ_POLICY;
}

// ── entry point ─────────────────────────────────────────────────────

function normalizeEvent(raw) {
  return String(raw ?? '').replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function emit(out) {
  process.stdout.write(`${JSON.stringify(out)}\n`);
}

// ── compatibility probe (chatStart only) ────────────────────────────
//
// The adapter depends on context-mode's hook protocol, which moves
// between releases. This runs on the chatStart hook that already spawns
// context-mode, reads local files only, and stays silent unless the
// installed version is outside validated-versions.json.

function validatedMinors() {
  const data = readJsonFile(join(HERE, 'validated-versions.json'));
  const list = data === null ? undefined : data.validated;
  return Array.isArray(list)
    ? list.filter((v) => typeof v === 'string')
    : [];
}

function minorOf(version) {
  const m = /^(\d+)\.(\d+)/.exec(String(version ?? ''));
  return m === null ? null : `${m[1]}.${m[2]}`;
}

function installedVersion(root) {
  const pkg = readJsonFile(join(root, 'package.json'));
  return pkg !== null && typeof pkg.version === 'string'
    ? pkg.version
    : null;
}

// Once per day per key: the warning is a nudge, not a per-chat alarm.
function recentlyWarned(key) {
  const stamp = join(tmpdir(), `context-mode-eca-${key}.stamp`);
  try {
    if (Date.now() - statSync(stamp).mtimeMs < WARN_THROTTLE_MS) {
      return true;
    }
  } catch {
    // no stamp yet
  }
  try {
    writeFileSync(stamp, String(Date.now()));
  } catch {
    // a read-only tmp dir only costs us the throttle
  }
  return false;
}

function appendContext(out, text) {
  const existing = typeof out.additionalContext === 'string'
    ? out.additionalContext
    : '';
  out.additionalContext = existing === '' ? text : `${existing}\n\n${text}`;
}

function compatWarning(resolved) {
  const compat = join(HERE, 'ctx-compat.mjs');
  if (resolved === null) {
    if (findOnPath('context-mode') === null) return null;
    if (recentlyWarned('layout')) return null;
    return 'context-mode is installed but its package layout is not '
      + 'recognised, so this plugin is inactive. Run `node '
      + compat + '` to check.';
  }
  const version = installedVersion(resolved.root);
  const minor = minorOf(version);
  if (minor === null) return null;
  const known = validatedMinors();
  if (known.length === 0 || known.includes(minor)) return null;
  if (recentlyWarned(`version-${version}`)) return null;
  return `context-mode ${version} has not been validated against this `
    + `plugin (validated: ${known.join(', ')}). Run \`node ${compat}\` `
    + 'before trusting the routing.';
}

// ── event handling ──────────────────────────────────────────────────

function decide(input, event, dir, policy, resolved) {
  if (policy === 'off' && String(input.tool_name ?? '') === 'read_file') {
    return {};
  }
  if (resolved === null) {
    debug('context-mode package root not found');
    return {};
  }
  const { root, version } = resolved;

  // v2's claude-code adapter has no PreCompact event; the post-compact
  // SessionStart(source=compact) delivers the state block instead.
  if (version === 2 && event === 'precompact') return {};

  const payload = claudePayload(input, event, version, dir);
  if (payload === null) {
    debug(`unsupported event: ${event}`);
    return {};
  }
  const args = hookArgs(root, version, event);
  if (args === null) return {};

  const stdout = runHook(args, payload, dir);
  if (stdout === null) return {};

  const out = translateOutput(stdout);
  const isRead = String(input.tool_name ?? '') === 'read_file';
  if (policy !== 'trim' && isRead && event === 'posttoolcall') {
    delete out.replacedOutput;
  }
  // The narrow ECA network guard, only when context-mode allowed the
  // call itself (a user deny rule or a v1 deny wins).
  if (event === 'pretoolcall' && out.approval !== 'deny') {
    const command = input.tool_input?.command;
    const kind = networkFlood(command);
    if (kind !== null) {
      out.approval = 'deny';
      out.additionalContext = networkDenyReason(kind, command);
    }
  }
  return out;
}

function main() {
  const raw = readStdin();
  if (raw.trim() === '') {
    debug('empty stdin');
    return;
  }
  let input;
  try {
    input = JSON.parse(raw);
  } catch (err) {
    debug(`stdin is not JSON: ${err.message}`);
    return;
  }
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return;
  }

  // argv override lets a shell invoke one event by hand for testing.
  const event = normalizeEvent(process.argv[2] || input.hook_type);
  const dir = projectDir(input);
  const policy = readPolicySetting(dir);
  const resolved = resolveRoot();

  const out = decide(input, event, dir, policy, resolved);
  if (event === 'chatstart') {
    const warning = compatWarning(resolved);
    if (warning !== null) appendContext(out, warning);
  }
  emit(out);
}

try {
  main();
} catch (err) {
  debug(`unhandled: ${err?.stack ?? err}`);
}
