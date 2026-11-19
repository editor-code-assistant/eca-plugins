# JavaScript / TypeScript Patterns for context-mode__ctx_execute

Practical patterns for using `context-mode__ctx_execute` with
`language: javascript`. All examples assume a Node.js runtime with
native fetch (Node 18+).

Where an example reads a single file, pass it with `file:` and read its
absolute path from `process.env.CTX_FILE`. The sandbox runs in the
project worktree, so other paths resolve relative to it.

---

## API Response Processing

### Fetch and summarize a REST API

```javascript
// context-mode__ctx_execute: analyze a health endpoint
const resp = await fetch('https://api.example.com/health');
const data = await resp.json();

console.log('=== Service Health ===');
console.log(`Status: ${data.status}`);
console.log(`Uptime: ${data.uptime}`);
console.log(`Timestamp: ${data.timestamp}`);

if (data.services) {
  console.log('\n=== Service Components ===');
  for (const [name, info] of Object.entries(data.services)) {
    console.log(`  ${name}: ${info.status} (latency: ${info.latency_ms}ms)`);
  }
}

if (data.errors && data.errors.length > 0) {
  console.log('\n=== Recent Errors ===');
  data.errors.slice(0, 10).forEach((e) => {
    console.log(`  [${e.timestamp}] ${e.code}: ${e.message}`);
  });
}
```
> intent: "overall health, degraded services, and recent errors"

### Paginated API collection

```javascript
// context-mode__ctx_execute: fetch all open issues from GitHub
const owner = 'org';
const repo = 'project';
const base = `https://api.github.com/repos/${owner}/${repo}/issues`;
let page = 1;
const allIssues = [];

while (true) {
  const url = `${base}?state=open&per_page=100&page=${page}`;
  const resp = await fetch(url, {
    headers: { Accept: 'application/vnd.github.v3+json' },
  });
  const issues = await resp.json();
  if (issues.length === 0) break;
  allIssues.push(...issues);
  page++;
}

console.log(`Total open issues: ${allIssues.length}\n`);

// Group by labels
const byLabel = {};
allIssues.forEach((issue) => {
  issue.labels.forEach((label) => {
    byLabel[label.name] = (byLabel[label.name] || 0) + 1;
  });
});

console.log('=== Issues by Label ===');
Object.entries(byLabel)
  .sort((a, b) => b[1] - a[1])
  .forEach(([label, count]) => console.log(`  ${label}: ${count}`));

// Oldest issues
console.log('\n=== 10 Oldest Issues ===');
allIssues
  .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
  .slice(0, 10)
  .forEach((i) => {
    const when = i.created_at.slice(0, 10);
    console.log(`  #${i.number} (${when}): ${i.title}`);
  });
```
> intent: "issue distribution by label, stale issues, suggested priorities"
> timeoutMs: 30000

---

## JSON Data Analysis

### Analyze a large JSON config file

```javascript
// file: "tsconfig.json"
const fs = require('fs');
const data = JSON.parse(fs.readFileSync(process.env.CTX_FILE, 'utf8'));

console.log('=== TSConfig Analysis ===');
console.log(`Target: ${data.compilerOptions?.target}`);
console.log(`Module: ${data.compilerOptions?.module}`);
console.log(`Strict: ${data.compilerOptions?.strict}`);
const paths = data.compilerOptions?.paths || {};
console.log(`Paths aliases: ${Object.keys(paths).length}`);

if (Object.keys(paths).length > 0) {
  console.log('\n=== Path Aliases ===');
  for (const [alias, targets] of Object.entries(paths)) {
    console.log(`  ${alias} -> ${targets.join(', ')}`);
  }
}

if (data.include) console.log(`\nInclude: ${data.include.join(', ')}`);
if (data.exclude) console.log(`Exclude: ${data.exclude.join(', ')}`);
if (data.references) {
  console.log(`\nProject References: ${data.references.length}`);
  data.references.forEach((r) => console.log(`  ${r.path}`));
}
```
> intent: "compiler strictness, module system, unusual configuration"

### Diff two JSON files

```javascript
// file: "config.prod.json"
const fs = require('fs');
const a = JSON.parse(fs.readFileSync(process.env.CTX_FILE, 'utf8'));
const b = JSON.parse(fs.readFileSync('config.staging.json', 'utf8'));

function diffObjects(obj1, obj2, path = '') {
  const allKeys = new Set([
    ...Object.keys(obj1 || {}),
    ...Object.keys(obj2 || {}),
  ]);
  for (const key of allKeys) {
    const fullPath = path ? `${path}.${key}` : key;
    if (!(key in (obj1 || {}))) {
      console.log(`+ ${fullPath}: ${JSON.stringify(obj2[key])}`);
    } else if (!(key in (obj2 || {}))) {
      console.log(`- ${fullPath}: ${JSON.stringify(obj1[key])}`);
    } else if (
      typeof obj1[key] === 'object' &&
      typeof obj2[key] === 'object'
    ) {
      diffObjects(obj1[key], obj2[key], fullPath);
    } else if (JSON.stringify(obj1[key]) !== JSON.stringify(obj2[key])) {
      const from = JSON.stringify(obj1[key]);
      const to = JSON.stringify(obj2[key]);
      console.log(`~ ${fullPath}: ${from} -> ${to}`);
    }
  }
}

console.log('=== Config Diff: prod vs staging ===');
diffObjects(a, b);
```
> intent: "configuration differences between prod and staging"

---

## Package.json / Lock File Analysis

### Dependency audit

```javascript
// file: "package.json"
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync(process.env.CTX_FILE, 'utf8'));

const deps = Object.entries(pkg.dependencies || {});
const devDeps = Object.entries(pkg.devDependencies || {});

console.log(`Package: ${pkg.name}@${pkg.version}`);
console.log(`Dependencies: ${deps.length}`);
console.log(`DevDependencies: ${devDeps.length}`);

// Find non-pinned versions
console.log('\n=== Non-Pinned Dependencies ===');
[...deps, ...devDeps].forEach(([name, version]) => {
  const loose =
    version.startsWith('^') || version.startsWith('~') || version === '*';
  if (loose) console.log(`  ${name}: ${version}`);
});

// List scripts
console.log('\n=== Scripts ===');
Object.entries(pkg.scripts || {}).forEach(([name, cmd]) => {
  console.log(`  ${name}: ${cmd}`);
});

// Workspace detection
if (pkg.workspaces) {
  console.log('\n=== Monorepo Workspaces ===');
  const ws = Array.isArray(pkg.workspaces)
    ? pkg.workspaces
    : pkg.workspaces.packages || [];
  ws.forEach((w) => console.log(`  ${w}`));
}
```
> intent: "dependency health, unpinned versions, and security concerns"

### Lock file drift detection

```javascript
// file: "package.json"
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync(process.env.CTX_FILE, 'utf8'));

const lockExists = { npm: false, yarn: false, pnpm: false };
try { fs.accessSync('package-lock.json'); lockExists.npm = true; } catch {}
try { fs.accessSync('yarn.lock'); lockExists.yarn = true; } catch {}
try { fs.accessSync('pnpm-lock.yaml'); lockExists.pnpm = true; } catch {}

console.log('=== Lock File Status ===');
Object.entries(lockExists).forEach(([mgr, exists]) => {
  console.log(`  ${mgr}: ${exists ? 'PRESENT' : 'missing'}`);
});

const activeLocks = Object.entries(lockExists).filter(([, v]) => v);
if (activeLocks.length > 1) {
  console.log('\nWARNING: Multiple lock files detected!');
  console.log('Inconsistent installs can result.');
}
if (activeLocks.length === 0) {
  console.log('\nWARNING: No lock file found!');
  console.log('Dependencies are not reproducible.');
}

// Check engines
if (pkg.engines) {
  console.log('\n=== Required Engines ===');
  Object.entries(pkg.engines).forEach(([e, v]) => {
    console.log(`  ${e}: ${v}`);
  });
}
```
> intent: "lock file health and package-management warnings"

---

## File Content Parsing

### Parse and summarize a large markdown file

```javascript
// file: "CHANGELOG.md"
const fs = require('fs');
const content = fs.readFileSync(process.env.CTX_FILE, 'utf8');
const lines = content.split('\n');

const sections = [];
let currentSection = null;

for (const line of lines) {
  if (line.startsWith('## ')) {
    if (currentSection) sections.push(currentSection);
    currentSection = {
      title: line.replace('## ', ''), items: 0, breaking: 0,
    };
  } else if (currentSection && line.startsWith('- ')) {
    currentSection.items++;
    const lower = line.toLowerCase();
    if (lower.includes('breaking')) currentSection.breaking++;
  }
}
if (currentSection) sections.push(currentSection);

console.log(`Total versions: ${sections.length}\n`);
console.log('=== Recent Versions ===');
sections.slice(0, 10).forEach((s) => {
  const warn = s.breaking > 0 ? ` [${s.breaking} BREAKING]` : '';
  console.log(`  ${s.title}: ${s.items} changes${warn}`);
});

const totalBreaking = sections.reduce((sum, s) => sum + s.breaking, 0);
if (totalBreaking > 0) {
  console.log(`Total breaking changes: ${totalBreaking}`);
}
```
> intent: "recent releases, breaking changes, and release cadence"

---

## Test Output Parsing

### Run tests and extract failures

```javascript
const { execSync } = require('child_process');

let output;
try {
  output = execSync('npx jest --json 2>/dev/null', {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
  });
} catch (e) {
  output = e.stdout || '';
}

try {
  const r = JSON.parse(output);
  console.log('=== Test Results ===');
  console.log(`Suites: ${r.numPassedTestSuites} passed, ` +
    `${r.numFailedTestSuites} failed`);
  console.log(`Tests:  ${r.numPassedTests} passed, ` +
    `${r.numFailedTests} failed`);
  const total = (r.testResults || [])
    .reduce((s, t) => s + (t.endTime - t.startTime), 0);
  console.log(`Time:   ${total}ms`);

  const failures = (r.testResults || [])
    .filter((t) => t.status === 'failed');
  if (failures.length > 0) {
    console.log('\n=== Failed Tests ===');
    failures.forEach((suite) => {
      console.log(`\nSuite: ${suite.name}`);
      (suite.assertionResults || [])
        .filter((a) => a.status === 'failed')
        .forEach((a) => {
          const name = a.ancestorTitles.join(' > ') + ' > ' + a.title;
          console.log(`  FAIL: ${name}`);
          const msg = (a.failureMessages || []).join('\n    ');
          console.log(`    ${msg.slice(0, 200)}`);
        });
    });
  }
} catch {
  console.log('Could not parse JSON output. Raw output:');
  console.log(output.slice(0, 5000));
}
```
> intent: "test pass/fail counts and each failing test with its error"
> timeoutMs: 60000
