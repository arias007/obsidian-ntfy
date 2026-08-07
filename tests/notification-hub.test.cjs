const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");

const notices = [];
global.window = global.window || {
  setInterval,
  clearInterval,
  setTimeout,
  clearTimeout,
};
class EmptyClass {}
class Plugin {}
class Notice {
  constructor(message) {
    notices.push(String(message));
  }
}

const obsidianStub = {
  EditorSuggest: EmptyClass,
  ItemView: EmptyClass,
  MarkdownRenderer: {},
  MarkdownView: EmptyClass,
  Notice,
  Modal: EmptyClass,
  Plugin,
  PluginSettingTab: EmptyClass,
  Setting: EmptyClass,
  requestUrl: null,
  SuggestModal: EmptyClass,
  setIcon() {},
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "obsidian") return obsidianStub;
  return originalLoad.call(this, request, parent, isMain);
};

const NotificationHubPlugin = require("../main.js");
Module._load = originalLoad;

function createPlugin(settings = {}) {
  const plugin = new NotificationHubPlugin();
  plugin.externalChannelAdapters = new Map();
  plugin.incomingMessageHandlers = new Map();
  plugin.incomingSocketStates = new Map();
  plugin.incomingReconnectAttempts = new Map();
  plugin.isUnloading = false;
  plugin.settings = plugin.normalizeSettings(settings);
  plugin.saveData = async () => {};
  plugin.saveSettings = async () => {};
  plugin.app = {};
  return plugin;
}

class FakeWebSocket {
  static instances = [];

  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.sent = [];
    FakeWebSocket.instances.push(this);
  }

  open() {
    this.readyState = 1;
    if (this.onopen) this.onopen();
  }

  message(payload) {
    if (this.onmessage) this.onmessage({ data: JSON.stringify(payload) });
  }

  messageRaw(payload) {
    if (this.onmessage) this.onmessage({ data: payload });
  }

  send(payload) {
    if (typeof payload === "string") this.sent.push(JSON.parse(payload));
    else this.sent.push(payload instanceof Uint8Array ? payload : new Uint8Array(payload));
  }

  close() {
    this.readyState = 3;
    if (this.onclose) this.onclose({ code: 1000 });
  }
}

async function run() {
  const source = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");
  const styles = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
  const managerHeaderStart = source.indexOf("  renderHeader(containerEl) {");
  const managerHeaderEnd = source.indexOf("  renderIncomingMessages(containerEl)", managerHeaderStart);
  assert.ok(managerHeaderStart >= 0 && managerHeaderEnd > managerHeaderStart, "manager header should remain discoverable");
  const managerHeader = source.slice(managerHeaderStart, managerHeaderEnd);
  assert.equal((managerHeader.match(/this\.renderNavItem\(/g) || []).length, 4);
  assert.doesNotMatch(managerHeader, /["']connections["']/);
  assert.match(styles, /grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(source, /refreshChannelAccountSummary\(channelId\)/);
  assert.match(source, /text\.inputEl\.addEventListener\("blur"/);
  assert.match(source, /connectFeishuGateway\(account\)/);
  assert.match(source, /callback\/ws\/endpoint/);
  assert.match(source, /notification-hub:incoming/);
  assert.match(source, /refreshIncomingView\(\)/);
  assert.match(source, /this\.tabPanels = new Map\(\)/);
  assert.match(source, /this\.ensureTabPanel\(this\.activeTab\)/);
  assert.match(source, /refreshTabInBackground\(tabId\)/);
  assert.match(source, /if \(!dataChanged\) return false/);
  assert.match(source, /return this\.syncTabPanels\(affectedTabs\)/);
  assert.match(source, /tab\.addEventListener\("click", \(\) => this\.activateTab\(id\)\)/);
  assert.doesNotMatch(source, /tab\.addEventListener\("click", async \(\) => \{\s*this\.activeTab = id;\s*await this\.render\(\)/);
  assert.match(styles, /\.obsidian-ntfy-tab-panel\.is-active\s*\{\s*display:\s*block/);
  assert.match(styles, /\.obsidian-ntfy-chat\s*\{[\s\S]*?grid-template-columns:/);
  assert.match(styles, /\.obsidian-ntfy-chat\.is-conversation-open \.obsidian-ntfy-chat-conversation/);
  assert.match(source, /notification-hub:conversations-changed/);
  assert.match(source, /class NtfyVaultFileSuggestModal extends SuggestModal/);
  assert.match(source, /channelAction: "ntfy-vault-files"/);
  assert.match(source, /msg_type: "file"/);
  assert.match(styles, /\.obsidian-ntfy-task-time\.is-editable/);
  assert.match(source, /selectSuggestion\(suggestion\)[\s\S]*?replaceRange\([\s\S]*?setCursor\(/);
  assert.match(source, /onChooseSuggestion\(suggestion\)[\s\S]*?replaceRange\([\s\S]*?setCursor\(/);
  assert.match(source, /dateNeedsTimeTrigger = line\.match\(\/\[📅⏰\][\s\S]*?\(\\s\*\)\$\/u\)/);
  assert.match(source, /cursor\.ch - dateNeedsTimeTrigger\[1\]\.length/);
  assert.match(source, /insertText: ` \$\{plugin\.formatLocalDateTime\(due\)\.slice\(11\)\}`/);
  assert.match(source, /openDateTimePicker\(dueValue, onSave\)/);
  assert.match(source, /typeof input\.showPicker === "function"/);
  assert.match(source, /openSourceTimePicker\(reminder\)/);
  assert.match(source, /openQueueTimePicker\(item\)/);
  assert.doesNotMatch(source, /openSourceTimeModal\(/);

  const plugin = createPlugin({
    topic: "test-topic",
    authToken: "secret-ntfy-token",
    defaultChannelId: "ntfy",
  });

  const status = plugin.getNotificationHubStatus();
  assert.equal(status.ready, true);
  assert.equal(status.defaultChannelId, "ntfy");
  assert.deepEqual(plugin.settings.addedChannelIds, ["ntfy"]);
  assert.equal(plugin.settings.backgroundReceiveEnabled, true);
  assert.equal(plugin.settings.showObsidianReminderNotices, true);
  assert.deepEqual(plugin.settings.channelHealth, {});

  const migratedInternalNoticePlugin = createPlugin({
    sent: {
      legacy: { due: new Date(Date.now() - 60_000).toISOString(), at: new Date(Date.now() - 120_000).toISOString(), text: "Legacy reminder" },
    },
  });
  assert.ok(migratedInternalNoticePlugin.settings.internalReminderNoticeSince);
  assert.equal(migratedInternalNoticePlugin.shouldShowObsidianReminderNotice(migratedInternalNoticePlugin.settings.sent.legacy), false, "legacy history should not produce an upgrade notice burst");

  const internalNoticePlugin = createPlugin({ topic: "internal-notice" });
  internalNoticePlugin.settings.internalReminderNoticeSince = new Date(Date.now() - 60_000).toISOString();
  const internalNoticeCount = notices.length;
  internalNoticePlugin.settings.sent = {
    "internal-reminder": {
      due: new Date(Date.now() - 1_000).toISOString(),
      obsidianDue: new Date(Date.now() - 1_000).toISOString(),
      text: "Internal due reminder",
      file: "Tasks.md",
    },
  };
  await internalNoticePlugin.showDueObsidianReminderNotices();
  assert.equal(notices.length, internalNoticeCount + 1);
  assert.match(notices.at(-1), /Internal due reminder/);
  await internalNoticePlugin.showDueObsidianReminderNotices();
  assert.equal(notices.length, internalNoticeCount + 1, "internal reminder should only appear once");

  const failedScanPlugin = createPlugin({ topic: "offline-reminder", scheduleFutureWithNtfy: true });
  failedScanPlugin.updateStatus = () => {};
  failedScanPlugin.updateStatusCount = () => {};
  failedScanPlugin.queueStatusCountRefresh = () => {};
  const failedScanDue = new Date(Date.now() + 60_000);
  failedScanPlugin.settings.internalReminderNoticeSince = new Date(Date.now() - 1_000).toISOString();
  failedScanPlugin.collectReminders = async () => [{
    key: "offline-note-reminder",
    due: failedScanDue,
    text: "Offline note reminder",
    filePath: "Tasks.md",
    lineNumber: 4,
    source: "obsidian-ntfy",
    hasExplicitTime: true,
  }];
  failedScanPlugin.httpRequest = async () => { throw new Error("temporary network failure"); };
  await failedScanPlugin.scanAndSchedule({ showNotice: false });
  const failedScanEntry = failedScanPlugin.settings.sent["offline-note-reminder"];
  assert.equal(failedScanEntry.channels.ntfy.status, "failed");
  assert.equal(failedScanEntry.ntfyScheduled, false);
  assert.equal(failedScanEntry.obsidianDue, failedScanDue.toISOString());
  assert.equal(failedScanPlugin.hasPendingNotificationDelivery(failedScanEntry), true, "failed ntfy delivery should remain retryable");
  const failedScanNoticeCount = notices.length;
  await failedScanPlugin.showDueObsidianReminderNotices(failedScanDue.getTime() + 2_000);
  assert.equal(notices.length, failedScanNoticeCount + 1, "failed ntfy delivery should still notify inside Obsidian");
  await failedScanPlugin.showDueObsidianReminderNotices(failedScanDue.getTime() + 3_000);
  assert.equal(notices.length, failedScanNoticeCount + 1, "failed delivery fallback should only notify once");

  const failedQueuePlugin = createPlugin({ topic: "offline-queue", scheduleFutureWithNtfy: true });
  const failedQueueDue = new Date(Date.now() + 90_000);
  failedQueuePlugin.settings.queue = [{
    id: "offline-queue-reminder",
    text: "Offline queue reminder",
    due: failedQueueDue.toISOString(),
    file: "queue",
    line: 0,
    source: "ntfy:queue",
  }];
  failedQueuePlugin.httpRequest = async () => { throw new Error("temporary queue failure"); };
  const failedQueueResult = await failedQueuePlugin.flushDueQueue(Date.now(), 3 * 24 * 60 * 60 * 1000);
  assert.equal(failedQueueResult.failed, 1);
  assert.equal(failedQueuePlugin.settings.queue.length, 1, "failed queue reminder should remain queued for retry");
  assert.equal(failedQueuePlugin.settings.sent["offline-queue-reminder"].channels.ntfy.status, "failed");
  assert.equal(failedQueuePlugin.hasPendingNotificationDelivery(failedQueuePlugin.settings.sent["offline-queue-reminder"]), true);

  const spanishPlugin = createPlugin({ uiLanguage: "es" });
  assert.equal(spanishPlugin.currentUiLanguage(), "es");
  assert.equal(spanishPlugin.uiText("通知中枢总开关", "Notification hub"), "Centro de notificaciones");
  const arabicPlugin = createPlugin({ uiLanguage: "ar" });
  assert.equal(arabicPlugin.isRtlUi(), true);
  const fallbackLanguagePlugin = createPlugin({ uiLanguage: "missing-locale" });
  assert.equal(fallbackLanguagePlugin.settings.uiLanguage, "auto");

  const healthMigrationPlugin = createPlugin({
    topic: "health-migration",
    connectionLogs: [
      { at: "2026-08-02T01:02:03.000Z", level: "info", channelId: "ntfy", message: "Outgoing notification sent", details: {} },
      { at: "2026-08-02T01:01:03.000Z", level: "info", channelId: "ntfy", message: "Incoming message received", details: {} },
    ],
  });
  assert.equal(healthMigrationPlugin.getChannelHealth("ntfy").lastOutboundAt, "2026-08-02T01:02:03.000Z");
  assert.equal(healthMigrationPlugin.getChannelHealth("ntfy").lastInboundAt, "2026-08-02T01:01:03.000Z");

  const migratedPlugin = createPlugin({
    topic: "legacy-topic",
    telegramChannelEnabled: true,
    telegramBotToken: "123456:legacy-token",
    telegramChatId: "legacy-chat",
  });
  assert.deepEqual(migratedPlugin.settings.addedChannelIds, ["ntfy", "telegram"]);

  const retiredChannelPlugin = createPlugin({
    channelAccounts: [{ id: "wechat", type: "wechat", accountId: "default", name: "旧微信连接", config: { bridgeUrl: "https://legacy.example/send", token: "legacy-token", target: "peer" } }],
    addedChannelIds: ["wechat"],
    defaultChannelId: "wechat",
  });
  assert.equal(retiredChannelPlugin.getChannelAccount("wechat"), null);
  assert.equal(retiredChannelPlugin.settings.addedChannelIds.includes("wechat"), false);
  assert.equal(retiredChannelPlugin.settings.defaultChannelId, "ntfy");
  assert.equal(retiredChannelPlugin.settings.retiredChannelAccounts[0].config.token, "legacy-token");
  assert.equal(await retiredChannelPlugin.addChannelToSettings("wechat"), false);
  const reloadedRetiredPlugin = createPlugin(retiredChannelPlugin.settings);
  assert.equal(reloadedRetiredPlugin.settings.retiredChannelAccounts[0].config.bridgeUrl, "https://legacy.example/send");

  const restoredQqPlugin = createPlugin({
    retiredChannelAccounts: [{ id: "qqbot", type: "qqbot", accountId: "default", name: "QQ Bot", config: { appId: "qq-app", clientSecret: "qq-secret", targetType: "c2c", target: "qq-openid" } }],
    addedChannelIds: ["qqbot"],
    defaultChannelId: "qqbot",
  });
  assert.equal(restoredQqPlugin.getChannelAccount("qqbot").config.appId, "qq-app");
  assert.equal(restoredQqPlugin.settings.retiredChannelAccounts.some((account) => account.type === "qqbot"), false);
  const restoredQqChannel = restoredQqPlugin.listNotificationChannels().find((channel) => channel.id === "qqbot");
  assert.equal(restoredQqChannel.receiveMode, "socket");
  assert.equal(restoredQqChannel.configured, true);
  assert.equal(restoredQqChannel.sendConfigured, true);

  const receiveOnlyQqPlugin = createPlugin({ topic: "qq-receive-only" });
  await receiveOnlyQqPlugin.addChannelToSettings("qqbot", { accountId: "receive", name: "QQ Receive" });
  await receiveOnlyQqPlugin.updateChannelAccount("qqbot:receive", { config: { appId: "qq-app", clientSecret: "qq-secret", target: "" } });
  const receiveOnlyQqChannel = receiveOnlyQqPlugin.listNotificationChannels().find((channel) => channel.id === "qqbot:receive");
  assert.equal(receiveOnlyQqChannel.configured, true);
  assert.equal(receiveOnlyQqChannel.sendConfigured, false);
  assert.equal(receiveOnlyQqChannel.receiveMode, "socket");

  const legacyModeQqPlugin = createPlugin({
    channelAccounts: [{ id: "qqbot", type: "qqbot", accountId: "default", name: "QQ Bot", enabled: true, config: { mode: "openclaw", appId: "qq-app", clientSecret: "qq-secret" } }],
    addedChannelIds: ["qqbot"],
  });
  assert.equal(legacyModeQqPlugin.getChannelAccount("qqbot").config.mode, "official");

  const originalDocument = global.document;
  global.document = { hidden: true };
  assert.equal(receiveOnlyQqPlugin.shouldRunIncomingSocket("qqbot:receive"), true);
  receiveOnlyQqPlugin.settings.backgroundReceiveEnabled = false;
  assert.equal(receiveOnlyQqPlugin.shouldRunIncomingSocket("qqbot:receive"), false);
  assert.equal(receiveOnlyQqPlugin.listNotificationChannels().find((channel) => channel.id === "qqbot:receive").connectionStatus, "paused-background");
  if (originalDocument === undefined) delete global.document;
  else global.document = originalDocument;

  receiveOnlyQqPlugin.updateChannelHealth("qqbot:receive", { verificationState: "verified", checkedAt: "2026-08-02T00:00:00.000Z" });
  await receiveOnlyQqPlugin.updateChannelAccount("qqbot:receive", { config: { appId: "qq-app-updated" } });
  assert.equal(receiveOnlyQqPlugin.getChannelHealth("qqbot:receive").verificationState, "unchecked");

  const dedupLogPlugin = createPlugin({ topic: "dedup-log" });
  dedupLogPlugin.recordConnectionLog("error", "qqbot", "Realtime receive connection failed", { error: "same error" });
  dedupLogPlugin.recordConnectionLog("error", "qqbot", "Realtime receive connection failed", { error: "same error" });
  assert.equal(dedupLogPlugin.settings.connectionLogs.length, 1);
  assert.equal(dedupLogPlugin.settings.connectionLogs[0].details.repeatCount, 2);

  const baseOnlyChannelCases = [
    ["telegram", { botToken: "123456:base-token", chatId: "" }, "poll"],
    ["feishu", { mode: "app", appId: "cli_base", appSecret: "base-secret", receiveId: "" }, "socket"],
    ["wecom", { mode: "app", corpId: "ww_base", agentId: "1000002", secret: "base-secret", target: "" }, "unconfigured"],
    ["discord", { mode: "bot", botToken: "discord-base", channelId: "" }, "socket"],
    ["slack", { mode: "bot", botToken: "xoxb-base", appToken: "", channelId: "" }, "unconfigured"],
    ["matrix", { serverUrl: "https://matrix.example", accessToken: "matrix-base", roomId: "" }, "poll"],
    ["email", { gatewayUrl: "https://mail.example/send", to: "" }, "unconfigured"],
  ];
  for (const [type, config, receiveMode] of baseOnlyChannelCases) {
    const basePlugin = createPlugin({ topic: `${type}-base-only` });
    const id = `${type}:base`;
    await basePlugin.addChannelToSettings(type, { accountId: "base", name: `${type} base` });
    await basePlugin.updateChannelAccount(id, { config });
    const descriptor = basePlugin.listNotificationChannels().find((channel) => channel.id === id);
    assert.equal(descriptor.configured, true, `${type} basic setup`);
    assert.equal(descriptor.sendConfigured, false, `${type} optional send target`);
    assert.equal(descriptor.receiveMode, receiveMode, `${type} receive mode`);
  }

  const replyOnlyFeishuPlugin = createPlugin({ topic: "feishu-reply-only" });
  await replyOnlyFeishuPlugin.addChannelToSettings("feishu", { accountId: "reply", name: "Feishu Reply" });
  await replyOnlyFeishuPlugin.updateChannelAccount("feishu:reply", { config: { mode: "app", appId: "cli_reply", appSecret: "reply-secret", receiveId: "" } });
  const replyRequests = [];
  replyOnlyFeishuPlugin.httpRequest = async (request) => {
    replyRequests.push(request);
    if (request.url.includes("tenant_access_token")) return { json: { code: 0, tenant_access_token: "tenant-token" } };
    return { json: { code: 0, data: { message_id: "om_reply" } } };
  };
  const replyResult = await replyOnlyFeishuPlugin.replyToIncomingMessage({
    id: "feishu-inbound",
    channelId: "feishu:reply",
    sender: "ou_sender",
    conversationId: "oc_runtime",
    text: "Inbound",
    metadata: { feishuReceiveIdType: "chat_id", feishuReceiveId: "oc_runtime", messageId: "om_inbound" },
  }, "Reply from Ntfy");
  assert.equal(replyResult.ok, true);
  assert.equal(replyRequests.length, 2);
  assert.equal(replyRequests[1].url.endsWith("/open-apis/im/v1/messages/om_inbound/reply"), true);
  const replyRequestBody = JSON.parse(replyRequests[1].body);
  assert.equal(Object.prototype.hasOwnProperty.call(replyRequestBody, "receive_id"), false);
  assert.equal(JSON.parse(replyRequestBody.content).text, "Reply from Ntfy");
  assert.equal(replyOnlyFeishuPlugin.listNotificationChannels().find((channel) => channel.id === "feishu:reply").sendConfigured, false);

  replyOnlyFeishuPlugin.httpRequest = async (request) => request.url.includes("tenant_access_token")
    ? { json: { code: 0, tenant_access_token: "tenant-token" } }
    : { json: { code: 0, data: {} } };
  await assert.rejects(
    replyOnlyFeishuPlugin.replyToIncomingMessage({
      id: "feishu-no-receipt",
      channelId: "feishu:reply",
      sender: "ou_sender",
      conversationId: "oc_runtime",
      text: "Inbound",
      metadata: { messageId: "om_no_receipt" },
    }, "Reply without receipt"),
    /returned no message ID/
  );

  replyOnlyFeishuPlugin.settings.incomingMessages = [{
    id: "feishu-latest-inbound",
    channelId: "feishu:reply",
    sender: "ou_sender",
    conversationId: "oc_runtime",
    text: "Inbound",
    receivedAt: new Date().toISOString(),
    metadata: { feishuReceiveIdType: "chat_id", feishuReceiveId: "oc_runtime", messageId: "om_latest_inbound" },
  }];
  replyOnlyFeishuPlugin.testChannelConnection = async () => true;
  const testRequests = [];
  replyOnlyFeishuPlugin.httpRequest = async (request) => {
    testRequests.push(request);
    if (request.url.includes("tenant_access_token")) return { json: { code: 0, tenant_access_token: "tenant-token" } };
    return { json: { code: 0, data: { message_id: "om_test_reply" } } };
  };
  const feishuTestResult = await replyOnlyFeishuPlugin.sendTestNotification({ channelId: "feishu:reply", simulatedEvent: true });
  assert.equal(feishuTestResult.ok, true);
  assert.equal(new URL(testRequests[1].url).searchParams.get("receive_id_type"), "chat_id");
  const testRequestBody = JSON.parse(testRequests[1].body);
  assert.equal(testRequestBody.receive_id, "oc_runtime");
  assert.match(JSON.parse(testRequestBody.content).text, /来自 Obsidian 的真实测试消息/);
  assert.ok(notices.some((message) => message.includes("test sent through feishu:reply")));
  const replyRoute = replyOnlyFeishuPlugin.listNotificationChannels().find((channel) => channel.id === "feishu:reply");
  assert.equal(replyRoute.runtimeTargetAvailable, true);
  assert.equal(replyRoute.deliveryReady, true);
  await replyOnlyFeishuPlugin.setDefaultNotificationChannel("feishu:reply");
  assert.equal(replyOnlyFeishuPlugin.getNotificationHubStatus().ready, true);

  const reminderRequests = [];
  replyOnlyFeishuPlugin.httpRequest = async (request) => {
    reminderRequests.push(request);
    if (request.url.includes("tenant_access_token")) return { json: { code: 0, tenant_access_token: "tenant-token" } };
    return { json: { code: 0, data: { message_id: "om_reminder" } } };
  };
  const reminderResults = await replyOnlyFeishuPlugin.publishReminder({
    key: "feishu-reminder",
    due: new Date(),
    text: "Reminder through Feishu",
    filePath: "Tasks.md",
    lineNumber: 3,
    source: "test",
  }, false);
  assert.equal(reminderResults[0].status, "sent");
  assert.equal(JSON.parse(reminderRequests[1].body).receive_id, "oc_runtime");

  const scheduledAt = new Date(Date.now() + 60_000).toISOString();
  const scheduledResult = await replyOnlyFeishuPlugin.scheduleNotification({
    id: "scheduled-feishu",
    title: "Scheduled",
    message: "Later",
    scheduledAt,
    channelIds: ["feishu:reply"],
  });
  assert.equal(scheduledResult.results[0].status, "deferred");
  assert.equal(replyOnlyFeishuPlugin.listScheduledNotifications().length, 1);
  replyOnlyFeishuPlugin.settings.outboundQueue[0].notification.scheduledAt = new Date(Date.now() - 2_000).toISOString();
  await replyOnlyFeishuPlugin.flushOutboundQueue();
  assert.equal(replyOnlyFeishuPlugin.listScheduledNotifications().length, 0);
  const hubApi = replyOnlyFeishuPlugin.createNotificationHubApi();
  assert.equal(typeof hubApi.test, "function");
  assert.equal(typeof hubApi.reply, "function");
  assert.equal(typeof hubApi.schedule, "function");
  assert.equal(typeof hubApi.addReminder, "function");
  replyOnlyFeishuPlugin.updateStatusCount = () => {};
  const apiReminder = await hubApi.addReminder({ text: "API reminder", due: new Date(Date.now() + 120_000).toISOString() });
  assert.equal(apiReminder.status, "queued");
  assert.equal(hubApi.listReminders().some((item) => item.id === apiReminder.id), true);
  const apiReminderSent = await hubApi.sendReminderNow(apiReminder.id);
  assert.equal(apiReminderSent.ok, true);
  assert.equal(apiReminderSent.results[0].messageId, "om_reminder");
  assert.equal(hubApi.listReminders().some((item) => item.id === apiReminder.id), false);

  const queuedDeliveryPlugin = createPlugin({ topic: "queued-delivery" });
  queuedDeliveryPlugin.registerNotificationChannel({ id: "queue-pass", send: async () => ({ id: "pass-receipt" }) });
  queuedDeliveryPlugin.registerNotificationChannel({ id: "queue-fail", send: async () => { throw new Error("temporary failure"); } });
  const queuedNotification = queuedDeliveryPlugin.normalizeHubNotification({
    id: "queued-broadcast",
    title: "Queued broadcast",
    message: "Deliver once",
    scheduledAt: new Date(Date.now() - 2_000).toISOString(),
  });
  queuedDeliveryPlugin.queueOutboundDelivery(queuedNotification, ["queue-pass", "queue-fail"]);
  queuedDeliveryPlugin.queueOutboundDelivery(queuedNotification, ["queue-pass"]);
  assert.equal(queuedDeliveryPlugin.listScheduledNotifications().length, 1);
  assert.deepEqual(queuedDeliveryPlugin.listScheduledNotifications()[0].channelIds, ["queue-fail", "queue-pass"]);
  await queuedDeliveryPlugin.flushOutboundQueue();
  assert.deepEqual(queuedDeliveryPlugin.listScheduledNotifications()[0].channelIds, ["queue-fail"]);

  queuedDeliveryPlugin.settings.outboundQueue = [];
  queuedDeliveryPlugin.queueOutboundDelivery(queuedNotification, ["queue-pass", "queue-fail"]);
  const cancelOneChannel = await queuedDeliveryPlugin.cancelScheduledNotification("queued-broadcast", "queue-pass");
  assert.equal(cancelOneChannel.removed, 1);
  assert.deepEqual(queuedDeliveryPlugin.listScheduledNotifications()[0].channelIds, ["queue-fail"]);

  const partialBroadcast = await queuedDeliveryPlugin.dispatchNotification(queuedNotification, {
    channelIds: ["queue-pass", "queue-fail"],
    simulate: false,
  });
  assert.equal(partialBroadcast.ok, false);
  assert.equal(partialBroadcast.status, "partial");
  assert.equal(partialBroadcast.results.filter((item) => item.ok).length, 1);

  const targetlessFeishuPlugin = createPlugin({ topic: "feishu-targetless" });
  await targetlessFeishuPlugin.addChannelToSettings("feishu", { accountId: "targetless", name: "Feishu Targetless" });
  await targetlessFeishuPlugin.updateChannelAccount("feishu:targetless", { config: { mode: "app", appId: "cli_targetless", appSecret: "targetless-secret", receiveId: "" } });
  targetlessFeishuPlugin.testChannelConnection = async () => true;
  const targetlessResult = await targetlessFeishuPlugin.sendTestNotification({ channelId: "feishu:targetless", simulatedEvent: true });
  assert.equal(targetlessResult.status, "missing-target");
  assert.ok(notices.some((message) => message.includes("no proactive target or received conversation")));

  const rejectedQqPlugin = createPlugin({ topic: "qq-auth-error" });
  rejectedQqPlugin.httpRequest = async () => ({ json: { message: "invalid appid or secret" } });
  await assert.rejects(
    rejectedQqPlugin.getQqBotAccessToken({ appId: "bad-app", clientSecret: "bad-secret" }),
    /AppID and ClientSecret do not match/
  );

  const channelSettingsPlugin = createPlugin({
    topic: "settings-topic",
    addedChannelIds: ["ntfy"],
    telegramBotToken: "123456:settings-token",
    telegramChatId: "settings-chat",
  });
  assert.equal(await channelSettingsPlugin.addChannelToSettings("telegram"), true);
  assert.equal(channelSettingsPlugin.isChannelAdded("telegram"), true);
  assert.equal(channelSettingsPlugin.isChannelSettingEnabled("telegram"), true);
  assert.equal(await channelSettingsPlugin.setDefaultNotificationChannel("telegram"), true);
  assert.equal(channelSettingsPlugin.settings.defaultChannelId, "telegram");
  await channelSettingsPlugin.setChannelSettingEnabled("telegram", false);
  assert.equal(channelSettingsPlugin.settings.defaultChannelId, "ntfy");
  await channelSettingsPlugin.setChannelSettingEnabled("telegram", true);
  await channelSettingsPlugin.removeChannelFromSettings("telegram");
  assert.equal(channelSettingsPlugin.isChannelAdded("telegram"), false);
  assert.equal(channelSettingsPlugin.isChannelSettingEnabled("telegram"), false);
  assert.equal(channelSettingsPlugin.settings.telegramBotToken, "123456:settings-token");
  assert.equal(channelSettingsPlugin.settings.telegramChatId, "settings-chat");

  const multiAccountPlugin = createPlugin({ topic: "multi-topic", addedChannelIds: ["ntfy"] });
  assert.equal(await multiAccountPlugin.addChannelToSettings("feishu", { accountId: "work", name: "工作飞书" }), true);
  assert.equal(await multiAccountPlugin.updateChannelAccount("feishu:work", {
    config: { mode: "webhook", webhookUrl: "https://open.feishu.cn/open-apis/bot/v2/hook/work-secret" },
  }), true);
  assert.equal(await multiAccountPlugin.addChannelToSettings("feishu", { accountId: "personal", name: "私人飞书" }), true);
  assert.equal(await multiAccountPlugin.updateChannelAccount("feishu:personal", {
    config: { mode: "webhook", webhookUrl: "https://open.feishu.cn/open-apis/bot/v2/hook/personal-secret" },
  }), true);
  assert.equal(multiAccountPlugin.listNotificationChannels().filter((channel) => channel.type === "feishu").length, 3);
  assert.equal(await multiAccountPlugin.setDefaultNotificationChannel("feishu:work"), true);
  assert.equal(multiAccountPlugin.settings.defaultChannelId, "feishu:work");
  const workFeishuPreview = await multiAccountPlugin.simulateNotification({
    title: "Work",
    message: "Only work",
    channelIds: ["feishu:work"],
  });
  assert.equal(workFeishuPreview.results[0].channelId, "feishu:work");
  assert.equal(JSON.stringify(workFeishuPreview).includes("work-secret"), false);
  assert.equal(JSON.stringify(workFeishuPreview).includes("personal-secret"), false);
  await multiAccountPlugin.removeChannelFromSettings("feishu:work");
  assert.equal(multiAccountPlugin.isChannelAdded("feishu:work"), false);
  assert.equal(multiAccountPlugin.getChannelAccount("feishu:work").config.webhookUrl.includes("work-secret"), true);
  await multiAccountPlugin.addChannelToSettings("feishu:work");
  assert.equal(multiAccountPlugin.isChannelAdded("feishu:work"), true);
  assert.equal(multiAccountPlugin.getChannelAccount("feishu:work").config.webhookUrl.includes("work-secret"), true);

  await multiAccountPlugin.addChannelToSettings("email", { accountId: "personal", name: "私人邮箱" });
  await multiAccountPlugin.updateChannelAccount("email:personal", {
    config: { gatewayUrl: "https://mail.example/send", gatewayToken: "mail-secret", from: "a@example.com", to: "b@example.com" },
  });
  const emailPreview = await multiAccountPlugin.simulateNotification({ title: "Mail", message: "Body", channelIds: ["email:personal"] });
  assert.deepEqual(JSON.parse(emailPreview.results[0].request.body).to, ["b@example.com"]);
  assert.equal(JSON.stringify(emailPreview).includes("mail-secret"), false);

  const appChannelPlugin = createPlugin({ addedChannelIds: ["ntfy"] });
  await appChannelPlugin.addChannelToSettings("feishu", { accountId: "app", name: "飞书应用" });
  await appChannelPlugin.updateChannelAccount("feishu:app", {
    config: { mode: "app", domain: "feishu", appId: "cli_test", appSecret: "feishu-secret", receiveIdType: "chat_id", receiveId: "oc_test" },
  });
  const feishuRequests = [];
  appChannelPlugin.httpRequest = async (request) => {
    feishuRequests.push(request);
    if (request.url.includes("tenant_access_token")) return { json: { code: 0, tenant_access_token: "tenant-token" } };
    return { json: { code: 0, data: { message_id: "om_test" } } };
  };
  const feishuResult = await appChannelPlugin.sendNotification({ title: "App", message: "Feishu", channelIds: ["feishu:app"] });
  assert.equal(feishuResult.results[0].status, "sent");
  assert.equal(feishuRequests.length, 2);
  assert.equal(feishuRequests[1].url.includes("receive_id_type=chat_id"), true);

  await appChannelPlugin.addChannelToSettings("wecom", { accountId: "app", name: "企业微信应用" });
  await appChannelPlugin.updateChannelAccount("wecom:app", {
    config: { mode: "app", corpId: "ww_test", agentId: "1000002", secret: "wecom-secret", targetType: "touser", target: "example-user" },
  });
  const wecomRequests = [];
  appChannelPlugin.httpRequest = async (request) => {
    wecomRequests.push(request);
    if (request.url.includes("gettoken")) return { json: { errcode: 0, access_token: "wecom-token" } };
    return { json: { errcode: 0, msgid: "wecom-message" } };
  };
  const wecomAppResult = await appChannelPlugin.sendNotification({ title: "App", message: "WeCom", channelIds: ["wecom:app"] });
  assert.equal(wecomAppResult.results[0].status, "sent");
  assert.equal(JSON.parse(wecomRequests[1].body).touser, "example-user");
  appChannelPlugin.httpRequest = async (request) => request.url.includes("gettoken")
    ? { json: { errcode: 0, access_token: "wecom-token" } }
    : { json: { errcode: 0 } };
  await assert.rejects(
    appChannelPlugin.sendNotification({ title: "App", message: "WeCom missing receipt", channelIds: ["wecom:app"] }),
    /WeCom message send returned no message ID/
  );

  await appChannelPlugin.addChannelToSettings("discord", { accountId: "bot", name: "Discord Bot" });
  await appChannelPlugin.updateChannelAccount("discord:bot", { config: { mode: "bot", botToken: "discord-secret", channelId: "12345" } });
  const discordBotPreview = await appChannelPlugin.simulateNotification({ title: "Bot", message: "Discord", channelIds: ["discord:bot"] });
  assert.equal(discordBotPreview.results[0].request.url.endsWith("/channels/12345/messages"), true);
  assert.equal(JSON.stringify(discordBotPreview).includes("discord-secret"), false);

  await appChannelPlugin.addChannelToSettings("telegram", { accountId: "work", name: "工作 Telegram" });
  await appChannelPlugin.updateChannelAccount("telegram:work", { config: { botToken: "123456:telegram-secret", chatId: "-100123" } });
  const telegramPreview = await appChannelPlugin.simulateNotification({ title: "Bot", message: "Telegram", channelIds: ["telegram:work"] });
  assert.equal(telegramPreview.results[0].request.url.endsWith("/bot***/sendMessage"), true);
  assert.equal(JSON.parse(telegramPreview.results[0].request.body).chat_id, "-100123");
  assert.equal(appChannelPlugin.listNotificationChannels().find((channel) => channel.id === "telegram:work").receiveMode, "poll");
  assert.equal(JSON.stringify(telegramPreview).includes("telegram-secret"), false);
  appChannelPlugin.httpRequest = async () => ({ json: { ok: true, result: { message_id: 321 } } });
  const telegramResult = await appChannelPlugin.sendNotification({ title: "Bot", message: "Telegram", channelIds: ["telegram:work"] });
  assert.equal(telegramResult.results[0].messageId, "321");
  appChannelPlugin.httpRequest = async () => ({ json: { ok: true, result: {} } });
  await assert.rejects(
    appChannelPlugin.sendNotification({ title: "Bot", message: "Telegram missing receipt", channelIds: ["telegram:work"] }),
    /Telegram message send returned no message ID/
  );

  appChannelPlugin.httpRequest = async () => ({ json: { id: "discord-message" } });
  const discordResult = await appChannelPlugin.sendNotification({ title: "Bot", message: "Discord", channelIds: ["discord:bot"] });
  assert.equal(discordResult.results[0].messageId, "discord-message");
  appChannelPlugin.httpRequest = async () => ({ json: {} });
  await assert.rejects(
    appChannelPlugin.sendNotification({ title: "Bot", message: "Discord missing receipt", channelIds: ["discord:bot"] }),
    /Discord message send returned no message ID/
  );

  await appChannelPlugin.addChannelToSettings("slack", { accountId: "bot", name: "Slack Bot" });
  await appChannelPlugin.updateChannelAccount("slack:bot", { config: { mode: "bot", botToken: "xoxb-slack-secret", channelId: "C123" } });
  const slackPreview = await appChannelPlugin.simulateNotification({ title: "Bot", message: "Slack", channelIds: ["slack:bot"] });
  assert.equal(slackPreview.results[0].request.url.endsWith("/chat.postMessage"), true);
  assert.equal(JSON.parse(slackPreview.results[0].request.body).channel, "C123");
  assert.equal(JSON.stringify(slackPreview).includes("slack-secret"), false);
  const slackReplyPreview = await appChannelPlugin.simulateNotification({ title: "Reply", message: "Slack", channelIds: ["slack:bot"], metadata: { channelId: "C-INCOMING", threadTs: "171.25" } });
  assert.deepEqual(JSON.parse(slackReplyPreview.results[0].request.body), { channel: "C-INCOMING", text: "Reply\nSlack", thread_ts: "171.25" });
  appChannelPlugin.httpRequest = async () => ({ json: { ok: true, ts: "171.99" } });
  const slackResult = await appChannelPlugin.sendNotification({ title: "Bot", message: "Slack", channelIds: ["slack:bot"] });
  assert.equal(slackResult.results[0].messageId, "171.99");
  appChannelPlugin.httpRequest = async () => ({ json: { ok: true } });
  await assert.rejects(
    appChannelPlugin.sendNotification({ title: "Bot", message: "Slack missing receipt", channelIds: ["slack:bot"] }),
    /Slack message send returned no timestamp/
  );

  const discordReplyPreview = await appChannelPlugin.simulateNotification({ title: "Reply", message: "Discord", channelIds: ["discord:bot"], metadata: { channelId: "98765" } });
  assert.equal(discordReplyPreview.results[0].request.url.endsWith("/channels/98765/messages"), true);

  await appChannelPlugin.addChannelToSettings("matrix", { accountId: "work", name: "工作 Matrix" });
  await appChannelPlugin.updateChannelAccount("matrix:work", { config: { serverUrl: "https://matrix.example", accessToken: "matrix-secret", roomId: "!room:matrix.example" } });
  const matrixPreview = await appChannelPlugin.simulateNotification({ title: "Bot", message: "Matrix", channelIds: ["matrix:work"] });
  assert.equal(matrixPreview.results[0].request.method, "PUT");
  assert.equal(matrixPreview.results[0].request.url.includes("/_matrix/client/v3/rooms/"), true);
  assert.equal(JSON.stringify(matrixPreview).includes("matrix-secret"), false);
  appChannelPlugin.httpRequest = async () => ({ json: { event_id: "$matrix-event" } });
  const matrixResult = await appChannelPlugin.sendNotification({ title: "Bot", message: "Matrix", channelIds: ["matrix:work"] });
  assert.equal(matrixResult.results[0].messageId, "$matrix-event");
  appChannelPlugin.httpRequest = async () => ({ json: {} });
  await assert.rejects(
    appChannelPlugin.sendNotification({ title: "Bot", message: "Matrix missing receipt", channelIds: ["matrix:work"] }),
    /Matrix message send returned no event ID/
  );

  await appChannelPlugin.addChannelToSettings("qqbot", { accountId: "official", name: "QQ Official" });
  await appChannelPlugin.updateChannelAccount("qqbot:official", { config: { appId: "qq-app", clientSecret: "qq-secret", targetType: "c2c", target: "default-openid" } });
  const qqRequests = [];
  appChannelPlugin.httpRequest = async (request) => {
    qqRequests.push(request);
    if (request.url.includes("getAppAccessToken")) return { json: { access_token: "qq-access", expires_in: "7200" } };
    return { json: { id: "qq-message" } };
  };
  const qqResult = await appChannelPlugin.sendNotification({ title: "Reply", message: "QQ", channelIds: ["qqbot:official"], metadata: { qqTargetType: "group", qqTarget: "group-openid", messageId: "incoming-message" } });
  assert.equal(qqResult.results[0].status, "sent");
  assert.equal(qqRequests[1].url.endsWith("/v2/groups/group-openid/messages"), true);
  assert.deepEqual(JSON.parse(qqRequests[1].body), { content: "Reply\nQQ", msg_type: 0, msg_id: "incoming-message" });
  await appChannelPlugin.sendNotification({ title: "Reply", message: "QQ DM", channelIds: ["qqbot:official"], metadata: { qqTargetType: "dms", qqTarget: "guild-id", messageId: "dm-message" } });
  assert.equal(qqRequests[2].url.endsWith("/dms/guild-id/messages"), true);
  assert.deepEqual(JSON.parse(qqRequests[2].body), { content: "Reply\nQQ DM", msg_id: "dm-message" });
  appChannelPlugin.httpRequest = async () => ({ json: {} });
  await assert.rejects(
    appChannelPlugin.sendNotification({ title: "Reply", message: "QQ missing receipt", channelIds: ["qqbot:official"] }),
    /QQ Bot message send returned no message ID/
  );

  await appChannelPlugin.addChannelToSettings("webhook", { accountId: "agent", name: "Agent Webhook" });
  await appChannelPlugin.updateChannelAccount("webhook:agent", { config: { url: "https://agent.example/receive", token: "webhook-secret", customHeaders: '{"X-API-Key":"header-secret"}', receiveUrl: "https://relay.example/inbox", receiveToken: "relay-secret" } });
  const webhookPreview = await appChannelPlugin.simulateNotification({ title: "Bot", message: "Webhook", channelIds: ["webhook:agent"] });
  assert.equal(webhookPreview.results[0].request.url, "***");
  assert.equal(webhookPreview.results[0].request.headers.Authorization, "***");
  assert.equal(webhookPreview.results[0].request.headers["X-API-Key"], "***");
  assert.equal(appChannelPlugin.listNotificationChannels().find((channel) => channel.id === "webhook:agent").receiveMode, "relay");
  assert.equal(appChannelPlugin.redactSensitiveText("https://relay.example/inbox", true).includes("relay.example"), false);

  const preview = await plugin.simulateNotification({
    title: "Preview",
    message: "No network request",
  });
  assert.equal(preview.simulated, true);
  assert.equal(preview.results.length, 1);
  assert.equal(preview.results[0].channelId, "ntfy");
  assert.equal(preview.results[0].status, "simulated");
  assert.equal(JSON.stringify(preview).includes("secret-ntfy-token"), false);

  plugin.settings.wecomChannelEnabled = true;
  plugin.settings.wecomWebhookUrl = "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=secret-key";
  const wecomPreview = await plugin.simulateNotification({
    title: "WeCom",
    message: "Message",
    channelIds: ["wecom"],
  });
  assert.equal(wecomPreview.results[0].request.method, "POST");
  assert.equal(wecomPreview.results[0].request.url.includes("secret-key"), false);
  assert.equal(JSON.parse(wecomPreview.results[0].request.body).msgtype, "text");

  const channelIds = plugin.listNotificationChannels().map((channel) => channel.id);
  assert.deepEqual(channelIds, ["ntfy", "telegram", "feishu", "wecom", "discord", "slack", "matrix", "qqbot", "email", "webhook"]);
  const channelModes = Object.fromEntries(plugin.listNotificationChannels().map((channel) => [channel.id, channel.receiveMode]));
  assert.deepEqual(channelModes, {
    ntfy: "poll",
    telegram: "unconfigured",
    feishu: "unconfigured",
    wecom: "unconfigured",
    discord: "unconfigured",
    slack: "unconfigured",
    matrix: "unconfigured",
    qqbot: "unconfigured",
    email: "unconfigured",
    webhook: "unconfigured",
  });
  for (const channelId of channelIds) {
    const channelPreview = await plugin.simulateNotification({
      title: "Channel preview",
      message: channelId,
      channelIds: [channelId],
    });
    assert.equal(channelPreview.results[0].status, "simulated", channelId);
  }

  let consumed = null;
  plugin.settings.incomingAction = "consumer";
  plugin.settings.incomingConsumerId = "cancip";
  plugin.registerIncomingMessageHandler("cancip", async (message) => {
    consumed = message;
    return { accepted: true };
  });
  const received = await plugin.ingestIncomingMessage({
    id: "incoming-1",
    channelId: "ntfy",
    sender: "agent",
    text: "Continue the task",
  });
  assert.equal(received.status, "received");
  assert.equal(consumed.text, "Continue the task");
  assert.equal(plugin.settings.conversationMessages.length, 1);
  const ntfyConversation = plugin.conversationContacts().find((contact) => contact.channelId === "ntfy" && contact.conversationId === "default");
  assert.ok(ntfyConversation);
  assert.equal(ntfyConversation.unread, 1);
  await plugin.markConversationRead(ntfyConversation.id);
  assert.equal(plugin.conversationContacts().find((contact) => contact.id === ntfyConversation.id).unread, 0);
  let conversationSend = null;
  const originalConversationSendNotification = plugin.sendNotification.bind(plugin);
  plugin.sendNotification = async (input) => {
    conversationSend = input;
    return { ok: true, status: "completed", results: [{ channelId: "ntfy", ok: true, status: "sent" }] };
  };
  const sentConversationMessage = await plugin.sendConversationMessage(ntfyConversation.id, "Reply from Obsidian");
  assert.equal(sentConversationMessage.status, "sent");
  assert.equal(conversationSend.channelIds[0], "ntfy");
  assert.equal(plugin.settings.conversationMessages.filter((message) => message.conversationKey === ntfyConversation.id).length, 2);
  plugin.sendNotification = originalConversationSendNotification;
  const duplicate = await plugin.ingestIncomingMessage({
    id: "incoming-1",
    channelId: "ntfy",
    sender: "agent",
    text: "Continue the task",
  });
  assert.equal(duplicate.status, "duplicate");

  const removed = await plugin.removeIncomingMessage("incoming-1", "ntfy");
  assert.equal(removed.status, "removed");
  assert.equal(plugin.settings.incomingMessages.length, 0);
  const duplicateAfterDelete = await plugin.ingestIncomingMessage({
    id: "incoming-1",
    channelId: "ntfy",
    sender: "agent",
    text: "Webhook retry after inbox deletion",
  });
  assert.equal(duplicateAfterDelete.status, "duplicate");

  const legacyInboxPlugin = createPlugin({
    incomingMessages: [{ id: "legacy-chat", channelId: "feishu", sender: "Legacy", conversationId: "chat-1", text: "Migrated", receivedAt: "2026-08-01T00:00:00.000Z" }],
  });
  assert.equal(legacyInboxPlugin.settings.conversationMessages.length, 1);
  assert.equal(legacyInboxPlugin.settings.conversationMessages[0].conversationKey, "feishu::chat-1");

  const attachmentPlugin = createPlugin({ attachmentLimitMb: 1 });
  const blockedAttachment = await attachmentPlugin.ingestIncomingMessage({
    id: "large-attachment",
    channelId: "webhook",
    sender: "agent",
    text: "Attachment",
    attachments: [{ name: "large.bin", size: 2 * 1024 * 1024 }],
  });
  assert.equal(blockedAttachment.status, "attachment-blocked");
  assert.equal(attachmentPlugin.settings.incomingMessages.length, 0);
  assert.equal((await attachmentPlugin.ingestIncomingMessage({
    id: "large-attachment",
    channelId: "webhook",
    sender: "agent",
    text: "Attachment retry",
  })).status, "duplicate");

  const backgroundPlugin = createPlugin();
  let finishBackground;
  let backgroundCompleted = false;
  backgroundPlugin.settings.incomingAction = "consumer";
  backgroundPlugin.registerIncomingMessageHandler("cancip", async () => {
    await new Promise((resolve) => { finishBackground = resolve; });
    backgroundCompleted = true;
  });
  const backgroundResult = await backgroundPlugin.ingestIncomingMessage({
    id: "background-1",
    channelId: "ntfy",
    text: "Long model task",
  }, { awaitHandler: false });
  assert.equal(backgroundResult.processing, "background");
  assert.equal(backgroundCompleted, false);
  await new Promise((resolve) => setImmediate(resolve));
  finishBackground();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(backgroundCompleted, true);

  const isolatedPollPlugin = createPlugin({
    topic: "poll-topic",
    telegramChannelEnabled: true,
    telegramReceiveEnabled: true,
    telegramBotToken: "123456:valid-token",
  });
  isolatedPollPlugin.flushOutboundQueue = async () => false;
  isolatedPollPlugin.pollNtfyIncoming = async () => { throw new Error("ntfy unavailable"); };
  isolatedPollPlugin.pollTelegramIncoming = async () => true;
  const isolatedPoll = await isolatedPollPlugin.runIncomingPoll();
  assert.equal(isolatedPoll.status, "partial");
  assert.equal(isolatedPoll.changed, true);
  assert.deepEqual(isolatedPoll.pollers.map((item) => [item.id, item.ok]), [["ntfy", false], ["telegram", true]]);

  const incomingStatus = backgroundPlugin.api || backgroundPlugin.createNotificationHubApi();
  assert.equal(typeof incomingStatus.getIncomingStatus, "function");
  assert.equal(typeof incomingStatus.pollIncoming, "function");
  assert.equal(typeof incomingStatus.retryIncoming, "function");

  const receivePlugin = createPlugin({ topic: "receive-topic", ntfyReceiveSince: "10m" });
  let receivedCount = 0;
  receivePlugin.settings.incomingAction = "consumer";
  receivePlugin.registerIncomingMessageHandler("cancip", async () => {
    receivedCount += 1;
  });
  receivePlugin.httpRequest = async () => ({
    text: [
      JSON.stringify({ event: "message", id: "external-1", topic: "receive-topic", title: "Agent", message: "Incoming" }),
      JSON.stringify({ event: "message", id: "obntfy-own-message", topic: "receive-topic", message: "Own" }),
    ].join("\n"),
  });
  assert.equal(await receivePlugin.pollNtfyIncoming(), true);
  assert.equal(receivedCount, 1);
  assert.equal(receivePlugin.settings.incomingMessages.length, 1);
  assert.equal(receivePlugin.settings.ntfyReceiveSince, "obntfy-own-message");

  const additionalTelegramPlugin = createPlugin({ topic: "multi-receive" });
  await additionalTelegramPlugin.addChannelToSettings("telegram", { accountId: "work", name: "Work Telegram" });
  await additionalTelegramPlugin.updateChannelAccount("telegram:work", { config: { botToken: "123456:work-token", chatId: "configured-chat" } });
  additionalTelegramPlugin.httpRequest = async () => ({
    json: {
      ok: true,
      result: [{ update_id: 41, message: { message_id: 7, date: 1700000000, text: "from work", chat: { id: -10077 }, from: { id: 5, username: "worker" } } }],
    },
  });
  assert.equal(await additionalTelegramPlugin.pollTelegramIncoming(additionalTelegramPlugin.getChannelAccount("telegram:work")), true);
  assert.equal(additionalTelegramPlugin.settings.incomingMessages[0].channelId, "telegram:work");
  assert.equal(additionalTelegramPlugin.getChannelAccount("telegram:work").config.receiveOffset, 42);

  const relayPlugin = createPlugin({ topic: "relay-topic" });
  await relayPlugin.addChannelToSettings("feishu", { accountId: "relay", name: "Feishu Relay" });
  await relayPlugin.updateChannelAccount("feishu:relay", { config: { mode: "webhook", webhookUrl: "https://open.feishu.cn/open-apis/bot/v2/hook/send", receiveUrl: "https://relay.example/inbox", receiveToken: "receive-secret", receiveCursor: "cursor-1" } });
  let relayRequest = null;
  relayPlugin.httpRequest = async (request) => {
    relayRequest = request;
    return { json: { messages: [{ id: "relay-message", sender: "ou_test", conversationId: "oc_test", text: "relay inbound", metadata: { feishuReceiveIdType: "chat_id", feishuReceiveId: "oc_test" } }], nextCursor: "cursor-2" } };
  };
  assert.equal(await relayPlugin.pollRelayIncoming(relayPlugin.getChannelAccount("feishu:relay")), true);
  assert.equal(new URL(relayRequest.url).searchParams.get("cursor"), "cursor-1");
  assert.equal(relayRequest.headers.Authorization, "Bearer receive-secret");
  assert.equal(relayPlugin.getChannelAccount("feishu:relay").config.receiveCursor, "cursor-2");
  assert.equal(relayPlugin.settings.incomingMessages[0].channelId, "feishu:relay");
  assert.throws(() => relayPlugin.requireReceiveRelayUrl("http://relay.example/inbox", "relay"), /must use HTTPS/);
  assert.throws(() => relayPlugin.requireReceiveRelayConfig({ receiveUrl: "https://relay.example/inbox" }, "relay"), /requires a receive token/);
  assert.equal(relayPlugin.requireReceiveRelayUrl("http://127.0.0.1:8787/inbox", "relay").startsWith("http://127.0.0.1:8787/"), true);

  const originalWebSocket = global.WebSocket;
  global.WebSocket = FakeWebSocket;
  FakeWebSocket.instances = [];

  const feishuGatewayPlugin = createPlugin({ topic: "feishu-gateway" });
  await feishuGatewayPlugin.addChannelToSettings("feishu", { accountId: "app", name: "Feishu Gateway" });
  await feishuGatewayPlugin.updateChannelAccount("feishu:app", { config: { mode: "app", appId: "cli_app", appSecret: "feishu-secret" } });
  feishuGatewayPlugin.httpRequest = async (request) => {
    assert.equal(request.url.endsWith("/callback/ws/endpoint"), true);
    assert.deepEqual(JSON.parse(request.body), { AppID: "cli_app", AppSecret: "feishu-secret" });
    return { json: { code: 0, data: { URL: "wss://feishu.test/ws?service_id=42&device_id=device", ClientConfig: { PingInterval: 90 } } } };
  };
  await feishuGatewayPlugin.connectFeishuGateway(feishuGatewayPlugin.getChannelAccount("feishu:app"));
  const feishuSocket = FakeWebSocket.instances.at(-1);
  feishuSocket.open();
  assert.equal(feishuGatewayPlugin.incomingSocketStates.get("feishu:app").status, "connected");
  const feishuPing = feishuGatewayPlugin.decodeFeishuFrame(feishuSocket.sent[0]);
  assert.equal(feishuPing.service, 42);
  assert.equal(feishuPing.headers.find((header) => header.key === "type").value, "ping");
  const feishuEnvelope = {
    schema: "2.0",
    header: { event_type: "im.message.receive_v1", create_time: "1785632523000" },
    event: {
      sender: { sender_id: { open_id: "ou_sender" }, sender_type: "user" },
      message: { message_id: "om_in", chat_id: "oc_chat", chat_type: "p2p", message_type: "text", content: JSON.stringify({ text: "Feishu inbound" }), create_time: "1785632523000" },
    },
  };
  feishuSocket.messageRaw(feishuGatewayPlugin.encodeFeishuFrame({
    SeqID: 1,
    LogID: 2,
    service: 42,
    method: 1,
    headers: [
      { key: "type", value: "event" },
      { key: "message_id", value: "frame-message" },
      { key: "sum", value: "1" },
      { key: "seq", value: "0" },
      { key: "trace_id", value: "trace" },
    ],
    payload: new TextEncoder().encode(JSON.stringify(feishuEnvelope)),
  }));
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(feishuGatewayPlugin.settings.incomingMessages[0].text, "Feishu inbound");
  assert.equal(feishuGatewayPlugin.settings.incomingMessages[0].metadata.feishuReceiveId, "oc_chat");
  const feishuAck = feishuGatewayPlugin.decodeFeishuFrame(feishuSocket.sent.at(-1));
  assert.equal(JSON.parse(new TextDecoder().decode(feishuAck.payload)).code, 200);
  assert.equal(feishuAck.headers.some((header) => header.key === "biz_rt"), true);
  feishuGatewayPlugin.closeIncomingSockets();

  const terminalQqPlugin = createPlugin({ topic: "qq-terminal-auth" });
  await terminalQqPlugin.addChannelToSettings("qqbot", { accountId: "terminal", name: "QQ Terminal" });
  await terminalQqPlugin.updateChannelAccount("qqbot:terminal", { config: { appId: "bad-app", clientSecret: "bad-secret" } });
  terminalQqPlugin.httpRequest = async () => ({ json: { message: "invalid appid or secret" } });
  await terminalQqPlugin.ensureRealtimeIncomingConnections();
  assert.equal(terminalQqPlugin.incomingSocketStates.get("qqbot:terminal").status, "failed");
  assert.equal(terminalQqPlugin.incomingSocketStates.get("qqbot:terminal").reconnectTimer, null);
  assert.equal(terminalQqPlugin.getChannelHealth("qqbot:terminal").verificationState, "failed");

  const discordGatewayPlugin = createPlugin({ topic: "discord-gateway" });
  await discordGatewayPlugin.addChannelToSettings("discord", { accountId: "bot", name: "Discord Gateway" });
  await discordGatewayPlugin.updateChannelAccount("discord:bot", { config: { mode: "bot", botToken: "discord-token", channelId: "default-channel" } });
  discordGatewayPlugin.httpRequest = async () => ({ json: { url: "wss://gateway.discord.test" } });
  await discordGatewayPlugin.connectDiscordGateway(discordGatewayPlugin.getChannelAccount("discord:bot"));
  const discordSocket = FakeWebSocket.instances.at(-1);
  discordSocket.open();
  discordSocket.message({ op: 10, d: { heartbeat_interval: 60000 } });
  assert.equal(discordSocket.sent.some((item) => item.op === 2 && item.d.intents === 37377), true);
  discordSocket.message({ op: 0, t: "READY", s: 1, d: { session_id: "discord-session" } });
  assert.equal(discordGatewayPlugin.incomingSocketStates.get("discord:bot").status, "connected");
  discordSocket.message({ op: 0, t: "MESSAGE_CREATE", s: 1, d: { id: "discord-in", channel_id: "discord-room", content: "Discord inbound", timestamp: "2026-08-02T00:00:00.000Z", author: { id: "user", username: "Example User", bot: false }, attachments: [] } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(discordGatewayPlugin.settings.incomingMessages[0].metadata.channelId, "discord-room");
  discordGatewayPlugin.closeIncomingSockets();

  const slackGatewayPlugin = createPlugin({ topic: "slack-gateway" });
  await slackGatewayPlugin.addChannelToSettings("slack", { accountId: "bot", name: "Slack Socket" });
  await slackGatewayPlugin.updateChannelAccount("slack:bot", { config: { mode: "bot", botToken: "xoxb-token", appToken: "xapp-token", channelId: "CDEFAULT" } });
  slackGatewayPlugin.httpRequest = async (request) => {
    assert.equal(request.url.endsWith("/apps.connections.open"), true);
    assert.equal(request.headers.Authorization, "Bearer xapp-token");
    return { json: { ok: true, url: "wss://slack.test/socket" } };
  };
  await slackGatewayPlugin.connectSlackSocketMode(slackGatewayPlugin.getChannelAccount("slack:bot"));
  const slackSocket = FakeWebSocket.instances.at(-1);
  slackSocket.open();
  slackSocket.message({ envelope_id: "envelope-1", payload: { event: { type: "message", client_msg_id: "slack-in", ts: "1700000000.5", channel: "C-IN", user: "U-IN", text: "Slack inbound" } } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(slackSocket.sent[0], { envelope_id: "envelope-1" });
  assert.equal(slackGatewayPlugin.settings.incomingMessages[0].conversationId, "C-IN");
  slackGatewayPlugin.closeIncomingSockets();

  const qqGatewayPlugin = createPlugin({ topic: "qq-gateway" });
  await qqGatewayPlugin.addChannelToSettings("qqbot", { accountId: "bot", name: "QQ Gateway" });
  await qqGatewayPlugin.updateChannelAccount("qqbot:bot", { config: { appId: "qq-app", clientSecret: "qq-secret", targetType: "c2c", target: "default-openid" } });
  const qqGatewayRequests = [];
  qqGatewayPlugin.httpRequest = async (request) => {
    qqGatewayRequests.push(request);
    if (request.url.includes("getAppAccessToken")) return { json: { access_token: "qq-access", expires_in: "7200" } };
    return { json: { url: "wss://qq.test/websocket", shards: 1 } };
  };
  await qqGatewayPlugin.connectQqBotGateway(qqGatewayPlugin.getChannelAccount("qqbot:bot"));
  assert.equal(qqGatewayRequests[1].url.endsWith("/gateway/bot"), true);
  const qqSocket = FakeWebSocket.instances.at(-1);
  qqSocket.open();
  qqSocket.message({ op: 10, d: { heartbeat_interval: 60000 } });
  const qqIdentify = qqSocket.sent.find((item) => item.op === 2);
  assert.equal(qqIdentify.d.intents, 1107300352);
  assert.equal(qqIdentify.d.properties.$os, "obsidian");
  qqSocket.message({ op: 0, t: "READY", s: 1, d: { session_id: "qq-session" } });
  assert.equal(qqGatewayPlugin.incomingSocketStates.get("qqbot:bot").status, "connected");
  assert.equal(qqGatewayPlugin.getChannelHealth("qqbot:bot").verificationState, "verified");
  qqSocket.message({ op: 0, t: "GROUP_AT_MESSAGE_CREATE", s: 2, d: { id: "qq-in", group_openid: "group-in", content: "QQ inbound", timestamp: "2026-08-02T00:00:00.000Z", author: { member_openid: "member-in" }, attachments: [] } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(qqGatewayPlugin.settings.incomingMessages[0].metadata.qqTarget, "group-in");
  qqGatewayPlugin.closeIncomingSockets();
  global.WebSocket = originalWebSocket;

  const handoffPlugin = createPlugin({ topic: "handoff-topic", scheduleFutureWithNtfy: true, maxFutureDays: 3 });
  handoffPlugin.updateStatusCount = () => {};
  const handoffRequests = [];
  handoffPlugin.httpRequest = async (request) => {
    handoffRequests.push(request);
    return { json: { id: "remote-scheduled-id" } };
  };
  const handoffDue = new Date(Date.now() + 90_000);
  const handoffId = await handoffPlugin.addQueueItem("Handoff early", handoffDue, { id: "handoff-reminder" });
  assert.equal(handoffId, "handoff-reminder");
  assert.equal(handoffPlugin.settings.queue.some((item) => item.id === handoffId), false);
  assert.equal(handoffPlugin.settings.sent[handoffId].ntfyScheduled, true);
  assert.equal(handoffRequests[0].headers.At, Math.floor(handoffPlugin.normalizeScheduledAt(handoffDue).getTime() / 1000).toString());
  await handoffPlugin.handoffQueuedReminders();
  assert.equal(handoffRequests.length, 1, "persisted handoff should not be submitted twice");
  const cancelled = await handoffPlugin.cancelSentEntry(handoffId);
  assert.equal(cancelled, true);
  assert.equal(handoffRequests[1].method, "DELETE");
  assert.equal(handoffPlugin.settings.sent[handoffId].ntfyDeleted, true);

  const sourceTimePlugin = createPlugin({ topic: "source-time" });
  let sourceText = "- [ ] Review chart 📅 2026-08-10 09:00";
  const sourceFile = { path: "Tasks.md", extension: "md" };
  sourceTimePlugin.app = {
    vault: {
      getAbstractFileByPath: (value) => value === sourceFile.path ? sourceFile : null,
      read: async () => sourceText,
      modify: async (_file, value) => { sourceText = value; },
    },
  };
  sourceTimePlugin.cancelMatchingSentEntries = async () => 0;
  sourceTimePlugin.scanAndSchedule = async () => {};
  const sourceReminder = sourceTimePlugin.parseReminderLine(sourceText, sourceFile.path, 1);
  const changedDue = new Date(2026, 7, 11, 15, 45, 0, 0);
  const changedReminder = await sourceTimePlugin.updateSourceReminderDue(sourceReminder, changedDue);
  assert.match(sourceText, /📅 2026-08-11 15:45/);
  assert.equal(changedReminder.due.getTime(), changedDue.getTime());

  let sentRequest = null;
  plugin.httpRequest = async (request) => {
    sentRequest = request;
    return { json: { id: "ntfy-server-id" } };
  };
  await plugin.sendTestNotification({ simulatedEvent: true });
  assert.ok(sentRequest);
  assert.equal(sentRequest.method, "POST");
  assert.equal(sentRequest.url, "https://ntfy.sh/test-topic");
  assert.equal(plugin.getChannelAccount("ntfy").config.receivedIds.includes("ntfy-server-id"), true);
  assert.ok(notices.some((message) => message.includes("test sent through ntfy")));
  plugin.httpRequest = async () => ({ json: {} });
  await assert.rejects(
    plugin.sendNotification({ title: "Missing", message: "ntfy receipt", channelIds: ["ntfy"] }),
    /ntfy message send returned no message ID/
  );

  process.stdout.write("notification-hub tests passed\n");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
