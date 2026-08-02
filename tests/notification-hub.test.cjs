const assert = require("node:assert/strict");
const Module = require("node:module");

const notices = [];
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
  plugin.settings = plugin.normalizeSettings(settings);
  plugin.saveSettings = async () => {};
  plugin.app = {};
  return plugin;
}

async function run() {
  const plugin = createPlugin({
    topic: "test-topic",
    authToken: "secret-ntfy-token",
    defaultChannelId: "ntfy",
  });

  const status = plugin.getNotificationHubStatus();
  assert.equal(status.ready, true);
  assert.equal(status.defaultChannelId, "ntfy");
  assert.deepEqual(plugin.settings.addedChannelIds, ["ntfy"]);

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
  assert.equal(appChannelPlugin.listNotificationChannels().find((channel) => channel.id === "telegram:work").receiveMode, "send-only");
  assert.equal(JSON.stringify(telegramPreview).includes("telegram-secret"), false);

  await appChannelPlugin.addChannelToSettings("slack", { accountId: "bot", name: "Slack Bot" });
  await appChannelPlugin.updateChannelAccount("slack:bot", { config: { mode: "bot", botToken: "xoxb-slack-secret", channelId: "C123" } });
  const slackPreview = await appChannelPlugin.simulateNotification({ title: "Bot", message: "Slack", channelIds: ["slack:bot"] });
  assert.equal(slackPreview.results[0].request.url.endsWith("/chat.postMessage"), true);
  assert.equal(JSON.parse(slackPreview.results[0].request.body).channel, "C123");
  assert.equal(JSON.stringify(slackPreview).includes("slack-secret"), false);

  await appChannelPlugin.addChannelToSettings("matrix", { accountId: "work", name: "工作 Matrix" });
  await appChannelPlugin.updateChannelAccount("matrix:work", { config: { serverUrl: "https://matrix.example", accessToken: "matrix-secret", roomId: "!room:matrix.example" } });
  const matrixPreview = await appChannelPlugin.simulateNotification({ title: "Bot", message: "Matrix", channelIds: ["matrix:work"] });
  assert.equal(matrixPreview.results[0].request.method, "PUT");
  assert.equal(matrixPreview.results[0].request.url.includes("/_matrix/client/v3/rooms/"), true);
  assert.equal(JSON.stringify(matrixPreview).includes("matrix-secret"), false);

  await appChannelPlugin.addChannelToSettings("webhook", { accountId: "agent", name: "Agent Webhook" });
  await appChannelPlugin.updateChannelAccount("webhook:agent", { config: { url: "https://agent.example/receive", token: "webhook-secret", customHeaders: '{"X-API-Key":"header-secret"}' } });
  const webhookPreview = await appChannelPlugin.simulateNotification({ title: "Bot", message: "Webhook", channelIds: ["webhook:agent"] });
  assert.equal(webhookPreview.results[0].request.url, "***");
  assert.equal(webhookPreview.results[0].request.headers.Authorization, "***");
  assert.equal(webhookPreview.results[0].request.headers["X-API-Key"], "***");
  assert.equal(appChannelPlugin.listNotificationChannels().find((channel) => channel.id === "webhook:agent").receiveMode, "forward");

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
  assert.deepEqual(channelIds, ["ntfy", "telegram", "feishu", "wecom", "discord", "slack", "matrix", "email", "webhook"]);
  const channelModes = Object.fromEntries(plugin.listNotificationChannels().map((channel) => [channel.id, channel.receiveMode]));
  assert.deepEqual(channelModes, {
    ntfy: "poll",
    telegram: "poll",
    feishu: "send-only",
    wecom: "send-only",
    discord: "send-only",
    slack: "send-only",
    matrix: "poll",
    email: "send-only",
    webhook: "forward",
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

  let sentRequest = null;
  plugin.httpRequest = async (request) => {
    sentRequest = request;
    return { text: "{}", json: {} };
  };
  await plugin.sendTestNotification({ simulatedEvent: true });
  assert.ok(sentRequest);
  assert.equal(sentRequest.method, "POST");
  assert.equal(sentRequest.url, "https://ntfy.sh/test-topic");
  assert.ok(notices.some((message) => message.includes("test sent through ntfy")));

  process.stdout.write("notification-hub tests passed\n");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
