# Pomodoro

A lightweight Pomodoro Technique integration for ECA that reminds you to take breaks while coding.

## What it provides

- **pomodoro.check** (`postRequest` hook) — After each answer from ECA, checks how long you've been working and, once 25 minutes have passed, shows a reminder to take a 5-minute break:

  ```
  Hook 'pomodoro::pomodoro.check': 🍅 You've been coding for 26 minutes! Consider a 5-minute break to recharge.
  ```

## How it works

- The work timer starts at your first answer from ECA, and keeps running across chats: opening or resuming a chat doesn't reset it.
- After every answer, the plugin checks the time since the timer started. At 25 minutes or more it shows the reminder and starts the timer again.
- A gap of 15 minutes or more between answers counts as a break: the timer starts again, without a reminder. So coming back after lunch, or the next morning, doesn't greet you with a stale count.
- The hook is silent otherwise: nothing shows in the chat until a break is due.

The timer is per user and shared by all your ECA sessions, since you're the one who needs the break. It lives in `$XDG_STATE_HOME/eca/pomodoro` (by default `~/.local/state/eca/pomodoro`).

## Customization

Fork this plugin and adjust `WORK_MINUTES` (25) and `IDLE_MINUTES` (15) at the top of `hooks/pomodoro-check.sh` to match your preferred work/break cadence.

---

By the ECA team.
