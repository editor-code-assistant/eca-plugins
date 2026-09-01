#!/usr/bin/env node
import { existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ECA_OPTS = {
  configDir: '.config/eca',
  configDirEnv: 'ECA_CONFIG_DIR',
  projectDirEnv: undefined,
  sessionIdEnv: undefined,
};

const REQUIRED_ROOT_FILES = [
  'hooks/core/routing.mjs',
  'hooks/session-helpers.mjs',
  'hooks/session-loaders.mjs',
  'hooks/routing-block.mjs',
];

const EVENT = (process.argv[2] || '').toLowerCase();

function debug(message) {
  if (process.env.CONTEXT_MODE_ECA_DEBUG === '1') {
    process.stderr.write(`[context-mode eca] ${message}\n`);
  }
}

function emitJson(value = {}) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function noOutput() {
  // ECA treats empty stdout on exit 0 as no hook output.
}

function fileExists(path) {
  try {
    return existsSync(path) && statSync(path).isFile();
  } catch {
    return false;
  }
}

function dirExists(path) {
  try {
    return existsSync(path) && statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function isValidRoot(root) {
  return Boolean(root) && REQUIRED_ROOT_FILES.every((file) => fileExists(join(root, file)));
}

function commandOutput(command, args = []) {
  try {
    return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

function which(command) {
  return commandOutput('bash', ['-lc', `command -v ${JSON.stringify(command)}`]);
}

function candidateRootsFromBin(binPath) {
  if (!binPath) return [];
  const binDir = dirname(binPath);
  return [
    resolve(binDir, '..', 'lib', 'node_modules', 'context-mode'),
    resolve(binDir, '..', 'share', 'node_modules', 'context-mode'),
    resolve(binDir, '..'),
    resolve(binDir, '..', '..'),
  ];
}

function resolveContextModeRoot() {
  const envRoot = process.env.CONTEXT_MODE_ROOT;
  if (isValidRoot(envRoot)) return resolve(envRoot);

  const directBin = which('context-mode');
  for (const root of candidateRootsFromBin(directBin)) {
    if (isValidRoot(root)) return root;
  }

  if (which('mise')) {
    const miseBin = commandOutput('mise', ['which', 'context-mode']);
    for (const root of candidateRootsFromBin(miseBin)) {
      if (isValidRoot(root)) return root;
    }
  }

  return null;
}

async function importFromRoot(root, relativePath) {
  return await import(pathToFileURL(join(root, relativePath)).href);
}

async function readHookInput(mods) {
  const raw = await mods.helpers.readStdin();
  return mods.helpers.parseStdin(raw);
}

function ecaSessionId(input) {
  return input?.chat_id || input?.session_id || input?.conversation_id || `pid-${process.ppid}`;
}

function ecaProjectDir(input) {
  if (typeof input?.cwd === 'string' && input.cwd.length > 0) return input.cwd;
  if (Array.isArray(input?.workspaces) && input.workspaces.length > 0) {
    const first = input.workspaces[0];
    if (typeof first === 'string') return first;
    if (typeof first?.path === 'string') return first.path;
    if (typeof first?.uri === 'string') {
      try { return fileURLToPath(first.uri); } catch {}
    }
  }
  return process.cwd();
}

function normalizedInput(input) {
  return {
    ...input,
    session_id: ecaSessionId(input),
    cwd: ecaProjectDir(input),
  };
}

function ecaToolNamer(tool) {
  return `context-mode__${tool}`;
}

const CONTEXT_MODE_SERVER = 'context-mode';
const ECA_CTX_PREFIX = `${CONTEXT_MODE_SERVER}__ctx_`;

function rewriteToolNames(text = '') {
  return String(text)
    .replace(new RegExp(`\\bmcp__${CONTEXT_MODE_SERVER}__ctx_`, 'g'), ECA_CTX_PREFIX)
    .replace(/\bctx_(execute_file|batch_execute|execute|fetch_and_index|search|stats|doctor|upgrade|purge|index)\b/g, `${ECA_CTX_PREFIX}$1`)
    .replace(new RegExp(`\\b${ECA_CTX_PREFIX}${CONTEXT_MODE_SERVER}__`, 'g'), `${CONTEXT_MODE_SERVER}__`);
}

function ecaFullToolName(input) {
  const server = input?.server;
  const tool = input?.tool_name || '';
  if (server && server !== 'eca') return `${server}__${tool}`;
  return tool;
}

function canonicalToolName(input) {
  const full = ecaFullToolName(input);
  if (full.startsWith('context-mode__ctx_')) return full;
  if (input?.server && input.server !== 'eca') return `mcp__${input.server}__${input.tool_name}`;

  const aliases = {
    shell_command: 'Bash',
    read_file: 'Read',
    write_file: 'Write',
    edit_file: 'Edit',
    move_file: 'Edit',
    xml_edit: 'Edit',
    grep: 'Grep',
    directory_tree: 'Glob',
    spawn_agent: 'Agent',
    ask_user: 'AskUserQuestion',
    git: 'Bash',
    task: 'TodoWrite',
  };
  return aliases[full] || full;
}

function normalizeToolInput(toolName, toolInput = {}) {
  if (!toolInput || typeof toolInput !== 'object') return {};
  const out = { ...toolInput };
  if (toolName === 'read_file' && out.path) out.file_path = out.path;
  if (toolName === 'write_file' && out.path) out.file_path = out.path;
  if (toolName === 'edit_file') {
    if (out.path) out.file_path = out.path;
    if (out.original_content !== undefined) out.old_string = out.original_content;
    if (out.new_content !== undefined) out.new_string = out.new_content;
  }
  if (toolName === 'move_file') {
    out.file_path = out.source;
    out.destination_path = out.destination;
  }
  if (toolName === 'spawn_agent') {
    out.prompt = out.task || out.prompt || '';
    out.subagent_type = out.agent || out.subagent_type || 'general-purpose';
  }
  if (toolName === 'git') {
    out.command = `git ${out.operation || ''}`.trim();
  }
  return out;
}

function denormalizeUpdatedInput(originalToolName, updatedInput) {
  if (!updatedInput || typeof updatedInput !== 'object') return updatedInput;
  if (originalToolName === 'edit_file') {
    const out = { ...updatedInput };
    if (out.file_path && !out.path) out.path = out.file_path;
    if (out.old_string !== undefined && out.original_content === undefined) out.original_content = out.old_string;
    if (out.new_string !== undefined && out.new_content === undefined) out.new_content = out.new_string;
    delete out.file_path;
    delete out.old_string;
    delete out.new_string;
    return out;
  }
  if ((originalToolName === 'read_file' || originalToolName === 'write_file') && updatedInput.file_path) {
    const out = { ...updatedInput, path: updatedInput.path || updatedInput.file_path };
    delete out.file_path;
    return out;
  }
  return updatedInput;
}

function stringifyToolResponse(response, error) {
  if (error) return typeof error === 'string' ? error : JSON.stringify(error);
  if (typeof response === 'string') return response;
  if (response == null) return '';
  try { return JSON.stringify(response); } catch { return String(response); }
}

function fallbackNetworkDecision(input) {
  if (canonicalToolName(input) !== 'Bash') return null;
  const command = String(input?.tool_input?.command || '');
  if (!/(^|\s|&&|\|\||;)(curl|wget)\s/i.test(command)) return null;
  if (/\s(-o|--output|-O|--output-document)\s+\S+/.test(command) && /\s(-s|--silent|-q|--quiet)\b/.test(command)) return null;
  return {
    action: 'deny',
    reason: 'context-mode: direct curl/wget output would flood context. Use context-mode__ctx_fetch_and_index(url, source) then context-mode__ctx_search(queries), or context-mode__ctx_execute(language, code) to fetch and print only derived results.',
  };
}

function ecaEventInput(input) {
  const toolName = input?.tool_name || '';
  const normalizedToolInput = normalizeToolInput(toolName, input?.tool_input || {});
  return {
    ...normalizedInput(input),
    tool_name: canonicalToolName(input),
    tool_input: normalizedToolInput,
    tool_response: stringifyToolResponse(input?.tool_response, input?.error),
    tool_output: { isError: Boolean(input?.error) },
  };
}

function customEvents(input) {
  const events = [];
  const tool = input?.tool_name;
  const toolInput = input?.tool_input || {};

  if (tool === 'move_file') {
    events.push({ type: 'file_edit', category: 'file', priority: 2, data: `${toolInput.source || ''} -> ${toolInput.destination || ''}` });
  }
  if (tool === 'git') {
    const op = toolInput.operation || 'git';
    const summary = toolInput.summary ? `: ${toolInput.summary}` : '';
    events.push({ type: op === 'commit' ? 'git_commit' : 'git', category: 'git', priority: 2, data: `${op}${summary}` });
  }
  if (tool === 'task') {
    const op = toolInput.op || 'task';
    const data = JSON.stringify({ operation: op, ids: toolInput.ids, id: toolInput.id, subject: toolInput.task?.subject });
    events.push({ type: op === 'complete' ? 'task_update' : 'task', category: 'task', priority: 2, data });
  }

  return events;
}

async function openSession(mods, input) {
  const projectDir = ecaProjectDir(input);
  const sessionId = ecaSessionId(input);
  const dbPath = mods.helpers.getSessionDBPath(ECA_OPTS, projectDir);
  const { SessionDB } = await mods.loaders.loadSessionDB();
  const db = new SessionDB({ dbPath });
  db.ensureSession(sessionId, projectDir);
  return { db, sessionId, projectDir };
}

async function insertEvents(mods, db, sessionId, events, input, projectDir, hookName) {
  if (!events || events.length === 0) return;
  try {
    const attribution = await mods.loaders.loadProjectAttribution();
    const resolver = attribution.resolveProjectAttributions || attribution.default?.resolveProjectAttributions;
    if (resolver) {
      mods.sessionLoaders.attributeAndInsertEvents(db, sessionId, events, normalizedInput(input), projectDir, hookName, resolver);
      return;
    }
  } catch (err) {
    debug(`attribution failed: ${err?.message || err}`);
  }

  if (typeof db.bulkInsertEvents === 'function') {
    db.bulkInsertEvents(sessionId, events, hookName);
  } else {
    for (const event of events) db.insertEvent(sessionId, event, hookName);
  }
}

async function handleChatStart(mods, input) {
  let additionalContext = mods.routingBlock.createRoutingBlock(ecaToolNamer);
  let db;
  try {
    const session = await openSession(mods, input);
    db = session.db;
    if (input?.resumed) {
      const events = mods.sessionDirective.getSessionEvents(db, session.sessionId);
      if (events.length > 0) {
        const eventsPath = mods.helpers.getSessionEventsPath(ECA_OPTS, session.projectDir);
        const meta = mods.sessionDirective.writeSessionEventsFile(events, eventsPath);
        additionalContext += mods.sessionDirective.buildSessionDirective('continue', meta, ecaToolNamer);
      }
    }
  } catch (err) {
    debug(`chatstart db failed: ${err?.message || err}`);
  } finally {
    try { db?.close?.(); } catch {}
  }
  emitJson({ additionalContext: rewriteToolNames(additionalContext) });
}

async function handlePreRequest(mods, input) {
  let db;
  try {
    const session = await openSession(mods, input);
    db = session.db;
    const extract = await mods.loaders.loadExtract();
    const events = extract.extractUserEvents(input?.prompt || '');
    await insertEvents(mods, db, session.sessionId, events, input, session.projectDir, 'preRequest');
  } catch (err) {
    debug(`prerequest failed: ${err?.message || err}`);
  } finally {
    try { db?.close?.(); } catch {}
  }
  noOutput();
}

async function handlePreToolUse(mods, input, root) {
  try {
    await mods.routing.initSecurity(join(root, 'build'));
  } catch (err) {
    debug(`security init failed: ${err?.message || err}`);
  }

  const normalizedToolInput = normalizeToolInput(input?.tool_name || '', input?.tool_input || {});
  let decision = null;
  try {
    decision = mods.routing.routePreToolUse(canonicalToolName(input), normalizedToolInput, ecaProjectDir(input), 'codex', ecaSessionId(input));
  } catch (err) {
    debug(`routing failed: ${err?.message || err}`);
  }
  decision ??= fallbackNetworkDecision(input);

  if (!decision) return emitJson({});

  if (decision.action === 'deny') {
    return emitJson({ approval: 'deny', additionalContext: rewriteToolNames(decision.reason || '') });
  }
  if (decision.action === 'ask') return emitJson({ approval: 'ask' });
  if (decision.action === 'modify') {
    const updatedInput = denormalizeUpdatedInput(input?.tool_name || '', decision.updatedInput || {});
    const reason = rewriteToolNames(updatedInput?.command || decision.reason || '');
    if (input?.tool_name === 'shell_command' && updatedInput?.command) updatedInput.command = reason;
    return emitJson({ approval: 'deny', additionalContext: reason || 'context-mode routed this call to context-mode tools.' });
  }
  return emitJson({});
}

async function handlePostToolUse(mods, input) {
  let db;
  try {
    const session = await openSession(mods, input);
    db = session.db;
    const extract = await mods.loaders.loadExtract();
    const events = [
      ...extract.extractEvents(ecaEventInput(input)),
      ...customEvents(input),
    ];
    await insertEvents(mods, db, session.sessionId, events, input, session.projectDir, 'postToolCall');
  } catch (err) {
    debug(`posttooluse failed: ${err?.message || err}`);
  } finally {
    try { db?.close?.(); } catch {}
  }
  noOutput();
}

async function handlePreCompact(mods, input) {
  let db;
  try {
    const session = await openSession(mods, input);
    db = session.db;
    const events = mods.sessionDirective.getSessionEvents(db, session.sessionId);
    const snapshotMod = await mods.loaders.loadSnapshot();
    const stats = db.getSessionStats(session.sessionId);
    const snapshot = snapshotMod.buildResumeSnapshot(events, {
      compactCount: (stats?.compact_count || 0) + 1,
      searchTool: 'context-mode__ctx_search',
    });
    db.upsertResume(session.sessionId, rewriteToolNames(snapshot), events.length);
    db.incrementCompactCount(session.sessionId);
  } catch (err) {
    debug(`precompact failed: ${err?.message || err}`);
  } finally {
    try { db?.close?.(); } catch {}
  }
  emitJson({});
}

async function handlePostCompact(mods, input) {
  let db;
  try {
    const session = await openSession(mods, input);
    db = session.db;
    const resume = db.getResume(session.sessionId);
    if (resume && !resume.consumed) {
      db.markResumeConsumed(session.sessionId);
      return emitJson({ additionalContext: rewriteToolNames(resume.snapshot || '') });
    }
  } catch (err) {
    debug(`postcompact failed: ${err?.message || err}`);
  } finally {
    try { db?.close?.(); } catch {}
  }
  emitJson({});
}

async function loadModules(root) {
  const helpers = await importFromRoot(root, 'hooks/session-helpers.mjs');
  const sessionLoaders = await importFromRoot(root, 'hooks/session-loaders.mjs');
  return {
    helpers,
    sessionLoaders,
    loaders: sessionLoaders.createSessionLoaders(join(root, 'hooks')),
    routing: await importFromRoot(root, 'hooks/core/routing.mjs'),
    routingBlock: await importFromRoot(root, 'hooks/routing-block.mjs'),
    sessionDirective: await importFromRoot(root, 'hooks/session-directive.mjs'),
  };
}

async function main() {
  const root = resolveContextModeRoot();
  if (!root) {
    debug('context-mode package root not found; no-op');
    return;
  }

  let mods;
  try {
    mods = await loadModules(root);
  } catch (err) {
    debug(`module load failed: ${err?.message || err}`);
    return;
  }

  let input;
  try {
    input = await readHookInput(mods);
  } catch (err) {
    debug(`stdin parse failed: ${err?.message || err}`);
    return;
  }

  switch (EVENT) {
    case 'chatstart': return await handleChatStart(mods, normalizedInput(input));
    case 'prerequest': return await handlePreRequest(mods, normalizedInput(input));
    case 'pretooluse': return await handlePreToolUse(mods, normalizedInput(input), root);
    case 'posttooluse': return await handlePostToolUse(mods, normalizedInput(input));
    case 'precompact': return await handlePreCompact(mods, normalizedInput(input));
    case 'postcompact': return await handlePostCompact(mods, normalizedInput(input));
    default:
      debug(`unknown event: ${EVENT}`);
      return;
  }
}

main().catch((err) => {
  debug(`unhandled failure: ${err?.stack || err}`);
});
