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
  assert.deepEqual(channelIds, ["ntfy", "wecom", "telegram", "feishu", "discord", "slack", "matrix", "email", "webhook"]);
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
