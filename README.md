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

Dates without time use the default time from plugin settings.

```md
- [ ] Weekly review ⏰ 2026-06-28
```

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
- Prevents overlapping scans on mobile.
- Skips unreadable files instead of failing the whole scan.
- Bounds the sent/scheduled cache to avoid unbounded mobile data growth.
- Falls back to `fetch` if Obsidian's `requestUrl` is unavailable.

## Important Limitations

- A pure Obsidian plugin cannot directly post Android local notifications.
- Scheduled notifications are delegated to ntfy using the `At` header. The public `ntfy.sh` service defaults to a 3-day maximum scheduled delay, so the plugin defaults to scheduling only the next 3 days. Future reminders will be picked up by later scans.
- Data sent to ntfy or AI webhooks may pass through the configured server. Use a private topic, token, or self-hosted server for sensitive content.
