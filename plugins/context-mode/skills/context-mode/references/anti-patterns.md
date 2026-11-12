# Anti-Patterns: Common Mistakes with context-mode__ctx_execute

Avoid these pitfalls when using `context-mode__ctx_execute`. Later
mentions in this file use the bare `ctx_execute` for brevity.

---

## 1. Using ctx_execute for Small Outputs (< 20 Lines)

**Problem:** `ctx_execute` runs your code in a sandbox and returns only
what the code prints. For a two-line result, `eca__shell_command` is
simpler and cheaper.

```
BAD - a needless round trip through ctx_execute:
  Tool: context-mode__ctx_execute
  language: shell
  code: "echo $(node --version)"

GOOD - just use eca__shell_command:
  Tool: eca__shell_command
  command: node --version
```

**Rule:** If the output fits comfortably in context (under ~20 lines),
use `eca__shell_command` directly. Reserve `ctx_execute` for output that
would bloat the window, or that you want indexed for
`context-mode__ctx_search`.

More examples of "just use eca__shell_command":
- `git status` - usually 5-10 lines
- `ls -la` - directory listing
- `cat .env.example` - small config file
- `pwd`, `whoami`, `which node`
- `wc -l src/index.ts` - single line output

---

## 2. Forgetting to Print Output

**Problem:** `ctx_execute` captures stdout. If your code prints nothing,
the reply comes back empty.

```javascript
// BAD - no output:
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const deps = Object.keys(data.dependencies);
// Nothing printed! The reply comes back empty.
```

```javascript
// GOOD - explicit output:
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const deps = Object.keys(data.dependencies);
console.log(`Dependencies (${deps.length}):`);
deps.forEach((d) => console.log(`  ${d}: ${data.dependencies[d]}`));
```

```python
# BAD - computes but never prints:
with open('data.json') as f:
    data = json.load(f)
result = [x for x in data if x['status'] == 'error']
# result is lost - never printed

# GOOD - always print results:
with open('data.json') as f:
    data = json.load(f)
result = [x for x in data if x['status'] == 'error']
print(f"Found {len(result)} errors:")
for r in result:
    print(f"  {r['id']}: {r['message']}")
```

**Rule:** Every `ctx_execute` script must print the results you want
back.

---

## 3. Using shell when JS/Python Would Be Cleaner

**Problem:** Complex data processing in shell quickly becomes unreadable
and error-prone.

```shell
# BAD - parsing JSON in shell is fragile:
cat data.json | python3 -c "
import sys, json
data = json.load(sys.stdin)
for item in data:
    if item['status'] == 'error':
        print(item['id'], item['message'])
"
# If you are already using Python inline, use language: python.
```

```javascript
// GOOD - use the right language for the job:
// language: javascript
const data = require('./data.json');
data
  .filter((x) => x.status === 'error')
  .forEach((x) => console.log(`${x.id}: ${x.message}`));
```

**Rule:** If your shell script contains inline Python/Node or complex
`jq`/`awk` chains, switch to `language: python` or
`language: javascript` instead.

Signs you should switch from shell:
- Using `python3 -c` or `node -e` inside the shell script
- More than 3 pipes chained together
- Using `jq` for complex JSON transformations
- Nested loops in shell
- String manipulation beyond simple `cut`/`sed`

---

## 4. Loading Entire Files into Context Then Processing

**Problem:** Reading a 10,000-line file with `eca__read_file`, then
asking about it, wastes your whole context window. Pass the file to
`ctx_execute` with `file:` and read it from `CTX_FILE` inside the code.

`file` accepts one local path; the sandbox receives its absolute path in
the `CTX_FILE` environment variable.

```
BAD workflow:
  1. eca__read_file: read 'server.log' (10,000 lines into context)
  2. "Find all errors in this log"
  -> 10,000 lines consumed for a question needing ~20 lines of output

GOOD workflow:
  1. ctx_execute with file: "server.log"
     language: python
     code: |
       import os
       with open(os.environ["CTX_FILE"]) as f:
           errors = [l for l in f if 'ERROR' in l]
       print(f"Total errors: {len(errors)}")
       for e in errors[-20:]:
           print(e.strip())
     intent: "categorize errors and report frequency"
  -> only the printed summary enters context
```

```
BAD workflow:
  1. eca__read_file: read 'package-lock.json' (20,000 lines)
  2. "What version of lodash is installed?"

GOOD workflow:
  1. ctx_execute with file: "package-lock.json"
     language: javascript
     code: |
       const fs = require('fs');
       const lock =
         JSON.parse(fs.readFileSync(process.env.CTX_FILE, 'utf8'));
       const find = (deps, name) => {
         if (deps[name]) return deps[name].version;
         for (const [, dep] of Object.entries(deps)) {
           if (dep.dependencies) {
             const v = find(dep.dependencies, name);
             if (v) return v;
           }
         }
       };
       const v = find(lock.dependencies, 'lodash');
       console.log(`lodash: ${v || 'not found'}`);
     intent: "report the installed version of lodash"
```

**Rule:** If a file is over 200 lines and you only need specific data
from it, use `ctx_execute(file: ...)` to extract what you need instead
of reading the whole file into context.

---

## 5. Not Using JSON.stringify for Structured Output

**Problem:** Printing objects without serialization gives
`[object Object]` in JavaScript.

```javascript
// BAD - prints [object Object]:
const pkg = require('./package.json');
console.log(pkg.dependencies);
// Output: [object Object]
```

```javascript
// GOOD - serialize properly:
const pkg = require('./package.json');
console.log(JSON.stringify(pkg.dependencies, null, 2));
// Output: { "react": "^18.2.0", "next": "^14.0.0", ... }
```

```javascript
// BAD - loses structure in arrays:
const items = [{ name: 'a', value: 1 }, { name: 'b', value: 2 }];
console.log(items);
// May print unhelpfully
```

```javascript
// GOOD - format as a table:
const items = [{ name: 'a', value: 1 }, { name: 'b', value: 2 }];
console.log('Name  | Value');
console.log('------|------');
items.forEach((i) => console.log(`${i.name.padEnd(5)} | ${i.value}`));
// Or use JSON.stringify:
console.log(JSON.stringify(items, null, 2));
```

**Rule:** Always use `JSON.stringify(data, null, 2)` for objects/arrays
in JavaScript, or format a readable table. In Python, use
`json.dumps(data, indent=2)` or `pprint.pprint(data)`.

---

## 6. Timeout Too Short for Network Operations

**Problem:** `timeoutMs` defaults to, and caps at, 600000 ms (10
minutes). A short value kills the whole process tree mid-flight.

```
BAD - will time out on a slow API call:
  Tool: context-mode__ctx_execute
  language: javascript
  code: |
    const resp = await fetch('https://api.slow-service.com/data');
    console.log(await resp.json());
  timeoutMs: 5000  <- API may take 10+ seconds

GOOD - generous timeout for network:
  Tool: context-mode__ctx_execute
  language: javascript
  code: |
    const resp = await fetch('https://api.slow-service.com/data');
    console.log(JSON.stringify(await resp.json(), null, 2));
  timeoutMs: 30000  <- 30 seconds for network calls
```

**Recommended timeouts:**
| Operation | timeoutMs |
|-----------|-----------|
| File reading/parsing | 5000 - 10000 |
| Local computation | 10000 |
| Single API request | 15000 - 30000 |
| Paginated API calls | 30000 - 60000 |
| npm install / build | 120000 |
| Full test suite | 120000 - 300000 |

**Rule:** Match `timeoutMs` to the work. Network calls and builds need
far more time than file operations, and nothing may exceed 600000.

---

## 7. Not Using `intent` Effectively

**Problem:** When output is large, `ctx_execute` returns the sections
that match `intent` and indexes the full output for `ctx_search`. A
vague `intent` surfaces the wrong sections.

```
BAD - vague or missing intent:
  intent: "summarize this"
  -> the matching sections may miss what you need

GOOD - specific and actionable:
  intent: "report the count of failing tests, list each failure with its
  file path and error message, and identify patterns in the failures"
```

**Tips for an effective `intent`:**
- Name the exact data points you need
- Ask for counts and metrics, not just descriptions
- Request actionable insights ("suggest fixes", "identify patterns")
- State the shape you want ("list as bullet points", "group by category")

**Rule:** Set `intent` whenever the output may be large; leave it off
only when the whole output is small enough to read.

The reply caps at 16384 bytes. Output that does not fit comes back as a
4096-byte preview plus a `ctx_search` handle for the indexed full text.

---

## 8. ctx_execute Captures, ctx_search Filters - Don't Merge Layers

`ctx_execute` and `ctx_search` are two layers, not one. `ctx_execute`
**captures** output into the index; `ctx_search` **filters** what was
captured. When you narrow the output *inside* `ctx_execute` - in shell
pipes, in script logic, anywhere upstream of capture - the dropped lines
never reach the index, and `ctx_search` cannot recover them. Large
stdout is already indexed, not returned inline, so trimming buys no
context-window savings: it only destroys data you would want to query
later.

The mental model:

```
+--------------------+        +--------------------+
|   ctx_execute      | -----> |   ctx_search       |
|   (capture layer)  |        |   (filter layer)   |
|                    |        |                    |
|   produces full    |        |   queries the      |
|   output into index|        |   captured index   |
+--------------------+        +--------------------+
        ^                              ^
        |                              |
   Job: capture                   Job: narrow
   Do NOT narrow here.            Do all narrowing here.
```

**Rule:** Treat `ctx_execute` output as write-once to the index. Run the
command in full and let it index. Do every narrowing step downstream,
via `ctx_search`. If you catch yourself trimming inside `ctx_execute`,
you are doing the filter layer's job in the capture layer - stop and
move the narrowing into a `ctx_search` call.

**Why the separation matters:** the index is what survives across calls
and sessions. Anything discarded before the index is gone from this
session's queryable surface; anything kept is queryable, repeatedly, at
zero re-execution cost.

---

## Summary Checklist

Before using `ctx_execute`, verify:

- [ ] Output will be > 20 lines (otherwise use eca__shell_command)
- [ ] Script prints all results to stdout
- [ ] Objects are serialized with JSON.stringify / json.dumps
- [ ] Timeout matches the operation type
- [ ] Language matches the task (JS for JSON/API, Python for data,
      Shell for pipes)
- [ ] `intent` is specific and actionable
- [ ] Not loading a file into context that could be read from CTX_FILE
