# Secret Guard

Stops ECA from silently writing hardcoded secrets, API keys and credentials. Before ECA writes or edits a file, Secret Guard scans the new content, and when something looks like a secret, ECA asks you to approve the change first, or blocks it if you prefer.

## What it provides

- **`eca-plugins/secret-guard`** — An ECA [module](https://eca.dev/config/modules/), for ECA 0.172.0 or later, that checks `eca__write_file` and `eca__edit_file` calls before they run.
- **`secret-guard.scan`** — A `preToolCall` hook that does the same on older ECA versions. While the module is active, it removes this hook from the config, so a write is never scanned twice. If you disable the module, the hook takes over again.

## Detected patterns

- AWS access key IDs (`AKIA...`)
- AWS secret access keys with a value (`aws_secret_access_key = ...`)
- API key assignments (`api_key = "..."`)
- Bearer tokens (`Bearer` followed by 20 or more token characters)
- Private keys (RSA, EC, DSA, OPENSSH)
- Secret API keys starting with `sk-`, like OpenAI's and Anthropic's (`sk-proj-...`, `sk-ant-...`)
- GitHub tokens (`ghp_`, `gho_`, `ghu_`, `ghs_`, `ghr_`)
- Secret key assignments (`secret_key = "..."`)
- Password assignments (`password = "..."`, 8 characters or more)
- Credentials in URLs (`scheme://user:password@host`)

Matching is case-insensitive and line by line.

## How it works

1. ECA is about to run a `write_file` or `edit_file` tool call.
2. Secret Guard scans the new content: the whole file for `write_file`, the replacement text for `edit_file`.
3. If nothing matches, the call goes on as usual.
4. If something matches, ECA asks you to approve the call, even when your config or trust mode allows the tool, and you're told what was found and on which line, e.g. `AWS access key ID (line 2)`. The secret itself is never repeated. For `edit_file`, line numbers count from the start of the replacement text.
   - With the module, you get an editor notification, and the model is told too, so it can offer to read the value from an environment variable instead.
   - With the hook, you get a message in the chat:

     ```
     Hook 'secret-guard::secret-guard.scan': ⚠️ Possible secret in /repo/.env: AWS access key ID (line 2). Review the change before approving it.
     ```
5. Approve the change if it's fine (a test fixture, a placeholder), or reject it.

Secret Guard only ever makes an allowed call ask: a call your config denies stays denied.

## Configuration

The module reads these keys from your ECA config:

```json
{
  "secretGuard": {
    "action": "block",
    "extraPatterns": {
      "Internal token": "itk_[a-z0-9]{32}"
    }
  }
}
```

| Key | Default | Description |
|-----|---------|-------------|
| `secretGuard.action` | `"ask"` | `"ask"` makes ECA ask you before a write with a possible secret. `"block"` rejects the call and tells the model why. |
| `secretGuard.extraPatterns` | none | More secrets to look for: a label for each, and a [Java regex](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/regex/Pattern.html) matched against each line. Unlike the built-in patterns, they're case-sensitive unless they start with `(?i)`. An invalid regex is ignored, and you're told once. |

The hook has no configuration: it always asks.

To use the hook instead of the module, disable the module:

```json
{
  "modules": {
    "eca-plugins/secret-guard": {"enabled": false}
  }
}
```

## Requirements

- **Module:** ECA 0.172.0 or later. Nothing else to install.
- **Hook:** `jq`, to read the hook's input (without it, the hook can't scan and says so on every write), and `grep -E`, available by default on Linux and macOS.

Credits: By the ECA team.
