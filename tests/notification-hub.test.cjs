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
  assert.deepEqual(plugin.settings.channelHealth, {});

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
    config: { mode: "app", corpId: "ww_test", agentId: "1000002", secret: "wecom-secret", targetType: "touser", target: "murat" },
  });
  const wecomRequests = [];
  appChannelPlugin.httpRequest = async (request) => {
    wecomRequests.push(request);
    if (request.url.includes("gettoken")) return { json: { errcode: 0, access_token: "wecom-token" } };
    return { json: { errcode: 0, msgid: "wecom-message" } };
  };
  const wecomAppResult = await appChannelPlugin.sendNotification({ title: "App", message: "WeCom", channelIds: ["wecom:app"] });
  assert.equal(wecomAppResult.results[0].status, "sent");
  assert.equal(JSON.parse(wecomRequests[1].body).touser, "murat");

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

  await appChannelPlugin.addChannelToSettings("slack", { accountId: "bot", name: "Slack Bot" });
  await appChannelPlugin.updateChannelAccount("slack:bot", { config: { mode: "bot", botToken: "xoxb-slack-secret", channelId: "C123" } });
  const slackPreview = await appChannelPlugin.simulateNotification({ title: "Bot", message: "Slack", channelIds: ["slack:bot"] });
  assert.equal(slackPreview.results[0].request.url.endsWith("/chat.postMessage"), true);
  assert.equal(JSON.parse(slackPreview.results[0].request.body).channel, "C123");
  assert.equal(JSON.stringify(slackPreview).includes("slack-secret"), false);
  const slackReplyPreview = await appChannelPlugin.simulateNotification({ title: "Reply", message: "Slack", channelIds: ["slack:bot"], metadata: { channelId: "C-INCOMING", threadTs: "171.25" } });
  assert.deepEqual(JSON.parse(slackReplyPreview.results[0].request.body), { channel: "C-INCOMING", text: "Reply\nSlack", thread_ts: "171.25" });

  const discordReplyPreview = await appChannelPlugin.simulateNotification({ title: "Reply", message: "Discord", channelIds: ["discord:bot"], metadata: { channelId: "98765" } });
  assert.equal(discordReplyPreview.results[0].request.url.endsWith("/channels/98765/messages"), true);

  await appChannelPlugin.addChannelToSettings("matrix", { accountId: "work", name: "工作 Matrix" });
  await appChannelPlugin.updateChannelAccount("matrix:work", { config: { serverUrl: "https://matrix.example", accessToken: "matrix-secret", roomId: "!room:matrix.example" } });
  const matrixPreview = await appChannelPlugin.simulateNotification({ title: "Bot", message: "Matrix", channelIds: ["matrix:work"] });
  assert.equal(matrixPreview.results[0].request.method, "PUT");
  assert.equal(matrixPreview.results[0].request.url.includes("/_matrix/client/v3/rooms/"), true);
  assert.equal(JSON.stringify(matrixPreview).includes("matrix-secret"), false);

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
  discordSocket.message({ op: 0, t: "MESSAGE_CREATE", s: 1, d: { id: "discord-in", channel_id: "discord-room", content: "Discord inbound", timestamp: "2026-08-02T00:00:00.000Z", author: { id: "user", username: "Murat", bot: false }, attachments: [] } });
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

  process.stdout.write("notification-hub tests passed\n");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
