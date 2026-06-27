# Ntfy Notifications

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

Dates without time use the default time from plugin settings. The default is `08:00`.

```md
- [ ] Weekly review ⏰ 2026-06-28
```

## Internal Notification Manager

The status bar item shows `ntfy: queue/cache`. Click it, or run:

```text
Ntfy Notifications: Open ntfy notification manager
Ntfy Notifications: Schedule delayed notification
```

The manager opens inside Obsidian. It does not jump to the ntfy web page.

The manager opens as an Obsidian main editor tab, similar to a normal plugin work view, not as a floating web page or sidebar. Three icon tabs stay visible:

- `待处理`: timed tasks scanned from notes and Tasks. It shows all timed items by due time, whether they are pending, queued, delivered, or notification-off. Each item has notification on/off controls.
- `已完成`: completed vault tasks, grouped by timed and untimed items.
- `整库待办`: read-only vault task summary: open tasks with time, open tasks without time, completed tasks with time, and completed tasks without time.

The `设定通知` section is collapsed by default and is only for creating a manual queued notification. It uses numeric `days / hours / minutes / seconds` inputs for both delay and repeat interval.

The status bar shows `ntfy local/total`, where `local` is the number of scheduled queue items not yet handed off to ntfy, and `total` is the full managed notification count.

In the editor, type `ntfy `, `提醒 `, `notify `, `remind `, or `⏲ ` to open minute-level reminder suggestions such as `30m`, `1h`, today 09:00, and tomorrow 09:00.

New dated tasks are added by the automatic scanner. Tasks inside the configured ntfy scheduling window, default `3` days, are handed off to ntfy immediately as scheduled messages. Tasks with an explicit hour/minute are scheduled for that time. Date-only tasks, daily-note tasks without a time, and overdue unsent tasks are scheduled for the daily batch at `08:00` by default. Already sent tasks stay in the sent cache and are not pushed again.

Repeating notifications are handled by Ntfy Notifications' local queue. ntfy scheduled delivery is one-shot; after a repeating item is sent successfully, the plugin calculates and queues the next due time.

Auto scan is enabled by default. While Obsidian is running, the plugin scans notes on the configured interval, keeps future reminders in the editable local queue, and hands queue items to ntfy only when they are close to due time. In daily-note folders such as `日记`, tasks without an explicit time use the date in the daily note filename plus the default time.

The manager can refresh scheduled messages already handed off to ntfy and can cancel those scheduled ntfy messages when the server supports the ntfy delete API. Scheduled messages are published with a stable `X-Message-ID` so they can be matched later. Turning off a reminder with the bell button or editing the same task line cancels the old scheduled ntfy message before the new state is saved.

Obsidian/plugin notices are captured by wrapping Obsidian's `Notice` API after this plugin loads. This covers most later notices, but a plugin that cached its own `Notice` reference before Ntfy Notifications loaded may not be captured.

## Delayed Notifications

ntfy supports scheduled delivery. Ntfy Notifications can send delayed messages using ntfy's scheduled delivery headers.

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
Ntfy Notifications: Schedule delayed notification
```

This command opens the internal Obsidian notification manager.

## Queue And ntfy Scheduled Delivery Limits

Official ntfy scheduled delivery supports `X-Delay`, `Delay`, `X-At`, `At`, `X-In`, and `In`.

According to the official ntfy publish docs:

- Minimum scheduled delay: `10 seconds`.
- Default maximum scheduled delay: `3 days`.
- Self-hosted servers can change the maximum with `message-delay-limit`.

Ntfy Notifications uses two windows:

- `Maximum future days`: how far ahead the plugin may hand off messages to ntfy. Keep this at `3` for public `ntfy.sh`.
- `Local queue lookahead days`: how far ahead the plugin keeps future reminders that are outside ntfy's scheduling window in Obsidian's editable local queue.

For long-term reminders, keep them in the local queue and let later scans hand them off when they enter the ntfy scheduled-delivery window.

## Install Manually

1. Copy this folder to:

```text
<your vault>/.obsidian/plugins/android-ntfy-notifier
```

2. In Obsidian: Settings -> Community plugins -> reload/enable `Ntfy Notifications`.
3. Open plugin settings and set:
   - ntfy server, usually `https://ntfy.sh`
   - topic, a long random private topic
   - auto scan, enabled by default
   - scan interval
   - maximum future days, usually `3` for public `ntfy.sh`
   - local queue lookahead days
4. Run command `Ntfy Notifications: Send test notification`.

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
- Daily-note tasks without explicit time use the daily note date and the default `08:00` time.
- Supports delayed notifications such as `ntfy-in:: 00:30:00 message`.
- Status bar item opens the internal Obsidian notification manager.
- Opens the manager as an Obsidian main editor tab with three persistent icon tabs.
- Supports editable local queue items with days/hours/minutes/seconds inputs in the manager.
- Shows explicit day/hour/minute/second labels next to duration inputs.
- Auto scan is enabled by default.
- Date-only and overdue unsent tasks are grouped into the daily batch time, default `08:00`, then handed off to ntfy when inside the scheduling window.
- Sent scheduled ntfy messages can be refreshed and cancelled from the manager when the ntfy server supports scheduled message listing and delete.
- Turning off a reminder or editing the same task line cancels the previous scheduled ntfy message when possible.
- Settings include two optional local support QR image fields; they stay in local plugin settings and are not bundled in the release.
- Supports local repeating notifications.
- Uses clear manager states: pending, queued, plugin notices, and delivered.
- Keeps future reminders in a local queue before handing them off to ntfy.
- Prevents overlapping scans on mobile.
- Skips unreadable files instead of failing the whole scan.
- Bounds the sent/scheduled cache to avoid unbounded mobile data growth.
- Falls back to `fetch` if Obsidian's `requestUrl` is unavailable.

## Important Limitations

- A pure Obsidian plugin cannot directly post Android local notifications.
- Scheduled notifications are delegated to ntfy using the `At` header when local queue items are inside the configured handoff window. The public `ntfy.sh` service defaults to a 3-day maximum scheduled delay, so the plugin defaults to scheduling only the next 3 days.
- Obsidian must run periodically for local long-term and repeating queue items to be handed off to ntfy.
- Items already handed off to ntfy are outside the local editable queue in this version.
- Captured Obsidian/plugin notices depend on plugins using Obsidian's current `Notice` API after Ntfy Notifications has loaded.
- ntfy scheduled delivery currently requires at least 10 seconds of delay. Shorter delays are raised to 10 seconds before publishing.
- Data sent to ntfy or AI webhooks may pass through the configured server. Use a private topic, token, or self-hosted server for sensitive content.
