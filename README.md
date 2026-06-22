# Obsidian Ntfy

This is a lightweight Obsidian plugin for ntfy notifications and optional AI webhooks.

Why ntfy: Obsidian mobile plugins cannot directly create Android system notifications. This plugin sends reminders to an ntfy topic, and the Android ntfy app shows the notification in the system notification shade.

## Requirements

1. Install the Android app `ntfy`.
2. Subscribe to the same topic that you configure in this plugin.
3. Enable Android notifications for the ntfy app.

Use a long random topic if you use the public server `https://ntfy.sh`, for example `murat-ob-9c4f0b2d7a1e4b90`.

## Supported Reminder Syntax

The plugin scans unchecked tasks and standalone reminder lines in Markdown files.

```md
- [ ] Call patient family ⏰ 2026-06-21 18:30
- [ ] Submit form 🔔 2026-06-22 09:00
- [ ] Review note @remind(2026-06-23 21:15)
- [ ] Review chart #remind 2026/06/23 21:15
notify:: 2026-06-24 08:30 Take medicine
ntfy:: 2026.06.24 08:30 Take medicine
提醒:: 2026-06-24 08:30 查房前准备
```

It also understands Obsidian Tasks plugin Emoji Format on open task lines. It uses this priority:

1. `⏳ scheduled`
2. `📅 due`
3. `🛫 start`

```md
- [ ] Tasks scheduled example ⏳ 2026-06-24
- [ ] Tasks due example 📅 2026-06-24
- [ ] Tasks start example 🛫 2026-06-24
- [ ] Tasks metadata is cleaned from notification text 🔁 every week ⏳ 2026-06-24 📅 2026-06-25 ➕ 2026-06-20
```

Dates without time use the default time from plugin settings.

```md
- [ ] Weekly review ⏰ 2026-06-28
```

## Internal Notification Manager

The status bar item shows `ntfy: queue/cache`. Click it, or run:

```text
Obsidian Ntfy: Open ntfy notification manager
Obsidian Ntfy: Schedule delayed notification
```

The manager opens inside Obsidian. It does not jump to the ntfy web page.

Inside the manager you can:

- Add a notification with numeric `days / hours / minutes / seconds` inputs.
- Set a repeat interval with numeric `days / hours / minutes / seconds` inputs.
- View the local queue.
- Edit notification text, due time, and repeat interval.
- Send a queued notification now.
- Delete queued notifications.
- Scan notes and pull matching reminders into the queue.

Repeating notifications are handled by Obsidian Ntfy's local queue. ntfy scheduled delivery is one-shot; after a repeating item is sent successfully, the plugin calculates and queues the next due time.

## Delayed Notifications

ntfy supports scheduled delivery. Obsidian Ntfy can send delayed messages using ntfy's scheduled delivery headers.

Standalone delayed reminder lines:

```md
ntfy-in:: 00:30:00 Check again
notify-in:: 30m Check again
remind-in:: 2h Call back
提醒后:: 30分钟 查房前准备
稍后提醒:: 30秒 Quick check
```

Inline task delay:

```md
- [ ] Check lab result ⏲ 00:30:00
- [ ] Call back after:30m
- [ ] Quick check 后:30秒
```

Delay formats:

```text
HH:MM:SS
MM:SS
30s / 30秒
30m / 30分钟
2h / 2小时
1d / 1天
```

There is also a command:

```text
Obsidian Ntfy: Schedule delayed notification
```

This command opens the internal Obsidian notification manager.

## Queue And ntfy Scheduled Delivery Limits

Official ntfy scheduled delivery supports `X-Delay`, `Delay`, `X-At`, `At`, `X-In`, and `In`.

According to the official ntfy publish docs:

- Minimum scheduled delay: `10 seconds`.
- Default maximum scheduled delay: `3 days`.
- Self-hosted servers can change the maximum with `message-delay-limit`.

Obsidian Ntfy uses two windows:

- `Maximum future days`: how far ahead the plugin may hand off messages to ntfy. Keep this at `3` for public `ntfy.sh`.
- `Local queue lookahead days`: how far ahead the plugin keeps future reminders in Obsidian's editable local queue.

For long-term reminders, keep them in the local queue and let later scans hand them off when they enter the ntfy scheduled-delivery window.

## Install Manually

1. Copy this folder to:

```text
<your vault>/.obsidian/plugins/android-ntfy-notifier
```

2. In Obsidian: Settings -> Community plugins -> reload/enable `Obsidian Ntfy`.
3. Open plugin settings and set:
   - ntfy server, usually `https://ntfy.sh`
   - topic, a long random private topic
   - scan interval
   - maximum future days, usually `3` for public `ntfy.sh`
   - local queue lookahead days
4. Run command `Obsidian Ntfy: Send test notification`.

## AI Webhook

The AI webhook is optional and disabled by default. When configured, the plugin sends a JSON event for each reminder:

```json
{
  "source": "obsidian-ntfy",
  "type": "reminder",
  "scheduledWithNtfy": true,
  "reminder": {
    "text": "Review chart",
    "due": "2026-06-23T13:15:00.000Z",
    "dueLocal": "2026-06-23 21:15",
    "file": "Tasks.md",
    "line": 12
  }
}
```

Set `AI webhook token` if the receiving service expects a Bearer token.

## Compatibility and Stability

- Keeps the plugin id `android-ntfy-notifier` for existing installs.
- Supports `YYYY-MM-DD`, `YYYY/MM/DD`, `YYYY.MM.DD`, and Chinese date separators.
- Supports Tasks plugin Emoji Format dates on open task lines.
- Supports delayed notifications such as `ntfy-in:: 00:30:00 message`.
- Status bar item opens the internal Obsidian notification manager.
- Supports editable local queue items with days/hours/minutes/seconds inputs.
- Supports local repeating notifications.
- Keeps future reminders in a local queue before handing them off to ntfy.
- Prevents overlapping scans on mobile.
- Skips unreadable files instead of failing the whole scan.
- Bounds the sent/scheduled cache to avoid unbounded mobile data growth.
- Falls back to `fetch` if Obsidian's `requestUrl` is unavailable.

## Important Limitations

- A pure Obsidian plugin cannot directly post Android local notifications.
- Scheduled notifications are delegated to ntfy using the `At` header when they are inside the configured handoff window. The public `ntfy.sh` service defaults to a 3-day maximum scheduled delay, so the plugin defaults to scheduling only the next 3 days.
- Obsidian must run periodically for local long-term and repeating queue items to be handed off to ntfy.
- Items already handed off to ntfy are outside the local editable queue in this version.
- ntfy scheduled delivery currently requires at least 10 seconds of delay. Shorter delays are raised to 10 seconds before publishing.
- Data sent to ntfy or AI webhooks may pass through the configured server. Use a private topic, token, or self-hosted server for sensitive content.
