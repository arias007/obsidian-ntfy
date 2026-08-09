# Ntfy Notifications

This is a lightweight Obsidian plugin for ntfy notifications and optional AI webhooks.

Why ntfy: Obsidian mobile plugins cannot directly create Android system notifications. This plugin sends reminders to an ntfy topic, and the Android ntfy app shows the notification in the system notification shade.

## Requirements

1. Install the Android app `ntfy`.
2. Subscribe to the same topic that you configure in this plugin.
3. Enable Android notifications for the ntfy app.

Use a long random topic if you use the public server `https://ntfy.sh`, for example `obsidian-notify-9c4f0b2d7a1e4b90`.

## Multilingual Interface

The plugin includes an interface language selector in settings. It can follow Obsidian/system language or be set manually.

Current built-in language targets:

- English
- 简体中文
- 日本語
- 한국어
- Español
- Français
- Deutsch
- Русский
- Português
- العربية
- Türkçe
- Italiano

The original Chinese/English UI remains the complete baseline. Other languages cover common settings, manager labels, command names, status labels, and notices first; any missing string falls back to English instead of showing a broken label.

## Fast Manager Tabs

- The four manager tabs keep their rendered content and scroll position in memory.
- Switching tabs shows cached content immediately, then refreshes that tab in the background.
- Unchanged background results do not rebuild the visible list.

## Automatic Nearby Vault Synchronization

Nearby synchronization is enabled by default. Devices that share the same vault identity discover each other automatically through existing private IP interfaces and transfer files directly while the normal notification channels continue running. The plugin only reads existing interfaces; it never enables or changes Windows networking.

- The default bidirectional mode keeps the most recently edited version at the original path and never creates renamed conflict copies.
- Four additional mutually exclusive modes are available: incremental push, incremental pull, deletion push, and deletion pull.
- Discovery covers Ethernet/LAN, Wi-Fi, phone hotspots, Bluetooth PAN/network tethering, and USB/RNDIS tethering. Bluetooth must already expose a private IP network; generic BLE/OBEX is intentionally not claimed as a high-speed Vault transport.
- Private IPv4 peers can be entered manually for hotspots or USB links that block broadcast discovery. Public hosts, hostnames, URLs, and arbitrary ports are rejected before any connection attempt; the endpoint is bound to a real device ID only after the encrypted same-vault ping succeeds.
- The full Vault is scanned and synchronized by default, including safe configuration files. Workspace state, LAN identity, Remotely Save data, caches, `.git`, `node_modules`, and the temporary LAN inbox remain excluded. A coordinator-only full-vault scan runs every 60 seconds by default, while create/modify/delete/rename events trigger an immediate incremental pass. A periodic scan never interrupts an active scan or transfer.
- The scan interval is configurable from 10 seconds to 1 hour, the per-file limit from 1 to 512 MB, and unchanged files reuse a persistent metadata-to-hash cache.
- Bidirectional conflicts use the latest modification time by default; the LAN settings can switch the winner to the larger file. The progress panel has an immediate scan-and-sync button, separate completed/total upload and download counters, and collapsed top-level folder groups for both scan and transfer activity.
- Small files use a bounded 12-worker transfer pool, medium files use 8 workers, and large files remain capped at 6 concurrent transfers to improve LAN throughput without destabilizing mobile memory.
- While a peer is connected, the status bar shows only a link icon (Wi-Fi, hotspot, Bluetooth, or USB) and live `completed/total` progress. It may temporarily use the Remotely Save status slot without changing Remotely Save settings or background execution.
- Clicking the link progress opens live file activity. Existing Markdown notes can be opened directly from that view.
- The previous Cancip LAN identity is copied on first migration when available, allowing devices to be upgraded one at a time. The old file is not deleted.

## Unified Message Center

The manager's message tab uses a contact-and-conversation layout for configured ntfy, Feishu, other receive-capable channels, and authenticated nearby peers.

- Incoming and outgoing messages share a persistent conversation history with unread counts, pinning, mute controls, clear conversation, delete message, delivery status, retry, and file attachment actions.
- The inbox only lists enabled, configured, and currently usable channels or authenticated nearby peers; disabled, unconfigured, failed, and offline connections stay out of the friend list.
- Nearby peers show their private IP and detected link type. LAN messages and Vault files use the same encrypted authenticated channel as synchronization. Device files can be selected from the phone or computer, arrive in `.trash/ntfy-inbox`, and expose a Save to Vault action; temporary inbox files are cleaned after the configured retention period while saved Vault copies are retained.
- ntfy binary uploads and Feishu App file messages can send Vault files directly. Webhook-only channels remain text/URL-only so the UI never reports a local file as uploaded when the provider cannot accept it.
- Each conversation keeps its message area scrollable while the text/file composer remains docked at the bottom for friend-style messaging.

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

Time badges in the manager are editable. Click a pending or queued reminder time to change it; note-backed reminders update the source line, cancel the old ntfy schedule when supported, and submit the replacement schedule immediately.

In the editor, type `ntfy `, `提醒 `, `notify `, `remind `, or `⏲ ` to open minute-level reminder suggestions such as `30m`, `1h`, today 09:00, and tomorrow 09:00.

New dated tasks are added by the automatic scanner. Tasks inside the configured ntfy scheduling window, default `3` days, are handed off to ntfy immediately as scheduled messages. Manual and API reminders also attempt this handoff as soon as they are created or edited. Tasks with an explicit hour/minute are scheduled for that time. Date-only tasks, daily-note tasks without a time, and overdue unsent tasks are scheduled for the daily batch at `08:00` by default. Stable delivery records prevent the same reminder from being submitted repeatedly.

Repeating notifications are handled by Ntfy Notifications' local queue. ntfy scheduled delivery is one-shot; after a repeating item is sent successfully, the plugin calculates and queues the next due time.

Auto scan is enabled by default. While Obsidian is running, the plugin scans notes on the configured interval, keeps future reminders in the editable local queue, and hands queue items to ntfy only when they are close to due time. In daily-note folders such as `日记`, tasks without an explicit time use the date in the daily note filename plus the default time.

The manager can refresh scheduled messages already handed off to ntfy and can cancel those scheduled ntfy messages when the server supports the ntfy delete API. Scheduled messages are published with a stable `X-Message-ID` so they can be matched later. Turning off a reminder with the bell button or editing the same task line cancels the old scheduled ntfy message before the new state is saved.

ntfy remains responsible for delivery while Obsidian is closed. When Obsidian is open, the plugin also keeps a local due-time timer and shows the same reminder through Obsidian's Notice UI once, with persisted local-delivery state to avoid duplicate popups.

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

## Development

The plugin ships as readable JavaScript. The LAN engine is maintained in TypeScript and embedded into `main.js` before checks and release packaging. Run the complete build and source checks with:

```bash
npm install
npm run build
npm run check
npm test
```

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
- Settings include the same two built-in support QR codes used by the mobile PDF exporter plugin.
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

## Notification Hub And Social Connections

Version `1.0.0` keeps the existing ntfy reminder queue, delayed delivery, repeating reminders, scheduled-message cancellation, review flow, inbox, deduplication, and quiet queue. Every built-in provider can have multiple named accounts with independent credentials, send/receive state, configuration, cursors, and a per-account test action.

Channel status now separates required-field completion, credential verification, runtime receive connection, and proactive-send readiness. It records redacted failures plus the latest inbound/outbound activity, refreshes the account summary as soon as edited values are saved, and suppresses repeated identical connection errors. Realtime connections and low-frequency polling stay active while Obsidian remains runnable in the background by default; mobile operating systems can still suspend or stop Obsidian, and returning to the foreground reconnects immediately.

Replies from the inbox use the destination carried by the received message, so a receive-only account can answer its original conversation without duplicating that conversation ID in proactive-send settings. An open manager view also refreshes its inbox count and message list as messages arrive.

Feishu inbox replies use the official reply endpoint for the original message and require a real returned message ID before reporting success. This keeps replies attached to the source message and prevents malformed or incomplete API responses from being treated as successful delivery. When no proactive destination is configured, normal tests, reminders, and API notifications send a new message to the latest received conversation; explicit inbox replies still use reply semantics. If neither target exists, the plugin reports the missing destination instead of claiming that a message was sent.

The hub uses one **default channel**. Cancip, other Obsidian plugins, and external agents only use the default route unless they explicitly pass channel IDs or request a broadcast. Enabling several connections therefore does not unexpectedly send every message to every service.

Telegram, Feishu, WeCom, Discord, Slack, Matrix, QQ Bot, and Email accounts can reuse the destination from their latest real inbound conversation when their credentials are complete but no static proactive target is configured. Channel status marks this route explicitly. Broadcasts report `partial` with `ok: false` if any selected channel fails, while preserving each per-channel result so callers never mistake partial delivery for full success.

Built-in send channels are:

- ntfy
- Telegram Bot
- Feishu/Lark app or bot webhook
- WeCom app or group bot webhook
- Discord bot or webhook
- Slack bot or webhook
- Matrix Client-Server API
- QQ official Bot API
- Email through a user-provided HTTP gateway
- Generic Webhook for Codex, Claude Code, custom agents, and automation

The plugin does not load OpenClaw, a QQ-to-HTTP bridge, personal WeChat, desktop daemons, or provider-specific npm packages. QQ uses the official Bot access-token API, message API, and Gateway directly. Old official QQ Bot settings saved by `0.6.2` are restored automatically; retired OpenClaw and personal-WeChat settings remain preserved but inactive.

Email is an optional HTTP contract rather than an embedded mail service. It only works when the user already has a compatible HTTPS mail gateway. No mail package or background process is installed by this plugin.

### Receiving Messages

The plugin exposes one normalized inbound message format through `plugin.api.receive(input)`. It stores a bounded inbox, checks the contact/group allowlist and attachment size, deduplicates messages, records redacted connection logs, emits an incoming event, and exposes registered-handler APIs. Model selection, session creation, and reply policy belong to the consuming plugin rather than Ntfy Notifications.

Each account reports its real receive mode:

- `poll`: every configured ntfy, Telegram, and Matrix account is polled independently while Obsidian is running; background polling can be disabled.
- `socket`: Feishu/Lark app persistent connection, Discord Bot Gateway, Slack Socket Mode, and QQ official Bot Gateway connect directly while Obsidian is running; background sockets can be disabled.
- `relay`: Feishu/Lark webhook mode, WeCom, Email, generic Webhook, Discord webhook mode, and Slack webhook mode poll a user-configured HTTPS callback relay.
- `disabled` or `unconfigured`: the plugin does not claim that receiving is active.

Obsidian mobile cannot expose a reliable public callback server. Callback-based providers therefore use this small HTTPS relay contract:

```http
GET <receiveUrl>?channelId=<channel-id>&cursor=<cursor>&limit=50
Authorization: Bearer <receiveToken>
Accept: application/json
```

The relay returns either a message array or:

```json
{
  "messages": [
    {
      "id": "provider-message-id",
      "sender": "sender-id",
      "text": "message",
      "conversationId": "conversation-id",
      "receivedAt": "2026-08-02T00:00:00.000Z",
      "attachments": [],
      "metadata": {}
    }
  ],
  "nextCursor": "next-cursor"
}
```

Public relay URLs must use HTTPS and configure a receive token; plain HTTP without a token is accepted only for `localhost`, `127.0.0.1`, or `::1`. The relay is responsible for validating provider signatures and decrypting provider callbacks before returning normalized messages. Provider metadata may include `channelId`, `threadTs`, `qqTargetType`, `qqTarget`, `feishuReceiveIdType`, `feishuReceiveId`, `wecomTargetType`, `wecomTarget`, or `emailReplyTo` so replies return to the original conversation.

Telegram polling requires the bot not to be owned by another `getUpdates` consumer and not to have an active webhook. Feishu/Lark app receive uses the official persistent connection and requires `im.message.receive_v1`, persistent-connection delivery, granted permissions, and a published app version. Discord Bot receive requires the application's Gateway and Message Content intent permissions. Slack receive requires Socket Mode, an `xapp-` app token, a bot token, and the relevant Events API subscriptions. QQ receive uses the intents allowed for that official Bot account; the default covers direct messages, group/C2C messages, and public guild mentions. QQ error `100016` is returned by the official token endpoint when the AppID and current ClientSecret do not match; regenerate the AppSecret and copy both values from the same bot application.

Polling cursors are persisted per account and the plugin ignores its own `obntfy-*` ntfy messages. Inbox deletion and delivery deduplication are intentionally separate. Removing an item from the visible inbox does not allow a provider retry with the same channel/message ID to run again. Incoming messages start consumer work in the background, so a long Cancip or model task does not block later receive cycles. One malformed or oversized attachment is rejected without stopping the rest of the provider batch. Realtime sockets remain active while Obsidian is runnable unless background receiving is disabled; mobile operating systems can still suspend the app, and the sockets reconnect with bounded backoff after Obsidian resumes.

Cancip can register its own handler without Ntfy Notifications importing Cancip:

```js
const hub = app.plugins.plugins["android-ntfy-notifier"]?.api;
const unregister = hub?.registerIncomingHandler("cancip", async (message, context) => {
  // Cancip decides whether to create a session, select a model, or reply.
  return { accepted: true };
});
```

If Cancip loads before Ntfy Notifications, it can listen for the workspace event `notification-hub:ready` and register when the API becomes available. Every accepted message also emits `notification-hub:incoming` for lightweight observers; the configured incoming consumer remains the authoritative model/session handler.

The public API keeps the original flat methods and adds stable namespaces: `conversations`, `messages`, `channels`, `notifications`, `reminders`, `lan`, `events`, and `manager`. Other plugins can use either `app.plugins.plugins["android-ntfy-notifier"].api` or `app.plugins.getPlugin?.("android-ntfy-notifier")?.getApi?.()`. Public results are defensive copies, and public Channel descriptors omit credential-bearing configuration. The TypeScript contract is documented in [`api.d.ts`](api.d.ts).

Chat history import accepts an array, one group-chat object, or `{ conversations: [...] }`. A Channel is optional: common fields such as `chatName`/`groupName`, `members`/`participants`, `author`/`sender`, `content`/`text`, and `time`/`timestamp` are normalized automatically. Top-level group information is applied to every message. Imports merge by source, conversation, message ID, and direction and never overwrite an existing message. Use `dryRun` to validate first. Messages without an ID receive a deterministic content-derived ID so repeated imports remain idempotent.

```js
const hub = app.plugins.getPlugin?.("android-ntfy-notifier")?.getApi?.();

const importRequest = {
  source: "cancip",
  mode: "merge",
  chatName: "Project group",
  members: ["Alice", "Bob", "Murat"],
  messages: [
    {
      id: "session-message-1",
      author: "Alice",
      content: "Imported group message",
      time: "2026-08-08T01:02:03.000Z"
    }
  ]
};

const preview = await hub.conversations.import({ ...importRequest, dryRun: true });

if (preview.rejected === 0) {
  await hub.conversations.import(importRequest);
}
```

The import result reports `inserted`, `duplicates`, `conflicts`, `rejected`, `errors`, and affected conversation keys. The manager's Messages sidebar also has an import button for a JSON file or pasted JSON. Imported history remains visible without a provider; when its optional provider Channel is active, the same conversation can continue sending through it.

Subscribe without using Obsidian's global workspace event bus when direct plugin integration is preferred:

```js
const stop = hub.events.on("messages-imported", (result) => {
  console.log(result.inserted);
});

// Call stop() when the consumer plugin unloads.
```

External desktop agents can use the local `obsidian://notification-hub` URI templates shown by **Copy setup** in the settings. The URI supports `send`, `schedule`, `simulate`, `test`, `receive`, `reply`, and `reminder`; it is protected by a local token and a small request rate limit. Large chat imports intentionally stay on the in-process plugin API or the manager's local JSON importer instead of being placed in a URI. The in-plugin API does not need that token.

### Delivery Controls

Future notifications for providers without a remote scheduling API are retained in the bounded local outbound queue and delivered when due. Overlapping queue entries for the same notification are merged, cancelling one Channel leaves the other destinations intact, and a partial queued broadcast retains only the channels that did not confirm delivery.

Provider-backed sends require their normal receipt before success is reported: ntfy returns an ID; Telegram returns `message_id`; Feishu/Lark returns `data.message_id`; WeCom app returns `msgid`; Discord bot returns an ID; Slack bot returns `ts`; Matrix returns `event_id`; and QQ Bot returns a message ID. Generic webhooks, provider webhook modes, and Email gateways use successful HTTP completion because they do not share one portable receipt schema.

The settings show every active account as its own collapsible configuration block. **Available channels** stays collapsed by default and contains a real add flow for provider, stable account ID, and display name. The same provider can be added repeatedly, for example `feishu:work`, `feishu:personal`, `email:work`, and `email:personal`. In **In use**, enable/disable, make default, remove, and test are compact icon actions beside the account name. Removing an account keeps its credentials for later reuse. Each test icon sends through that exact account; `simulate()` remains available for a no-network, redacted request preview.

Email deliberately uses an HTTP gateway rather than embedding SMTP. This keeps the plugin small and compatible with Obsidian mobile; the gateway can be a provider API or a user's own relay.
