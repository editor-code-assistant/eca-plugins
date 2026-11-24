# Notify Hooks

Desktop sound notifications for ECA events — never miss when ECA finishes or needs your approval.

## What it provides

Two hooks that play system sounds:

- **`notify-hooks.finished`** — Plays a completion sound when ECA finishes responding (`postRequest`).
- **`notify-hooks.approval`** — Plays a notification sound when ECA needs your approval for a tool call, or asks you a question (`preToolCall`).

## Platform support

- **Linux** — Uses `canberra-gtk-play` (install via `libcanberra-gtk3` package)
- **macOS** — Falls back to `afplay` with built-in system sounds

## Requirements

- **Linux:** `sudo apt install libcanberra-gtk3-module` (Debian/Ubuntu) or equivalent
- **macOS:** No additional setup needed
- **`jq`**, for the approval sound only: it reads whether the tool call needs approval. The completion sound works without it.

Credits: Based on the config shared by @ericdallo.
