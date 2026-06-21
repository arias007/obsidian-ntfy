const {
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  requestUrl,
} = require("obsidian");

const DEFAULT_SETTINGS = {
  serverUrl: "https://ntfy.sh",
  topic: "",
  authToken: "",
  scanIntervalMinutes: 15,
  defaultTime: "09:00",
  includeFileName: true,
  includeFullPath: false,
  includeTaskText: true,
  scheduleFutureWithNtfy: true,
  maxFutureDays: 3,
  priority: "default",
  tags: "bell",
};

const DATE_TIME_RE = /(\d{4}-\d{2}-\d{2})(?:[ T](\d{1,2}:\d{2}))?/;

module.exports = class AndroidNtfyNotifierPlugin extends Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.statusBar = this.addStatusBarItem();
    this.statusBar.addClass("android-ntfy-notifier-status");
    this.updateStatus("ntfy: idle");

    this.addSettingTab(new AndroidNtfyNotifierSettingTab(this.app, this));

    this.addCommand({
      id: "scan-and-schedule-reminders",
      name: "Scan and schedule reminders",
      callback: async () => this.scanAndSchedule({ showNotice: true }),
    });

    this.addCommand({
      id: "send-test-notification",
      name: "Send test notification",
      callback: async () => this.sendTestNotification(),
    });

    this.addCommand({
      id: "clear-sent-cache",
      name: "Clear sent/scheduled cache",
      callback: async () => {
        this.settings.sent = {};
        await this.saveSettings();
        new Notice("Android ntfy Notifier: cache cleared");
      },
    });

    this.registerInterval(
      window.setInterval(
        () => this.scanAndSchedule({ showNotice: false }),
        Math.max(1, Number(this.settings.scanIntervalMinutes || 15)) * 60 * 1000
      )
    );

    this.scanAndSchedule({ showNotice: false });
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  updateStatus(text) {
    if (this.statusBar) this.statusBar.setText(text);
  }

  normalizedServerUrl() {
    return String(this.settings.serverUrl || "https://ntfy.sh").replace(/\/+$/, "");
  }

  topicUrl() {
    const topic = String(this.settings.topic || "").trim();
    if (!topic) return "";
    return `${this.normalizedServerUrl()}/${encodeURIComponent(topic)}`;
  }

  async scanAndSchedule({ showNotice }) {
    if (!this.topicUrl()) {
      this.updateStatus("ntfy: no topic");
      if (showNotice) new Notice("Android ntfy Notifier: set an ntfy topic first");
      return;
    }

    const reminders = await this.collectReminders();
    const now = Date.now();
    const sent = this.settings.sent || {};
    const maxFutureMs = Math.max(1, Number(this.settings.maxFutureDays || 30)) * 24 * 60 * 60 * 1000;
    let scheduled = 0;
    let skipped = 0;
    let failed = 0;

    for (const reminder of reminders) {
      if (sent[reminder.key]) {
        skipped++;
        continue;
      }

      const dueMs = reminder.due.getTime();
      const isFuture = dueMs > now + 60 * 1000;
      const tooFar = dueMs - now > maxFutureMs;
      if (isFuture && tooFar) {
        skipped++;
        continue;
      }

      try {
        await this.publishReminder(reminder, isFuture);
        sent[reminder.key] = {
          at: new Date().toISOString(),
          due: reminder.due.toISOString(),
          file: reminder.filePath,
          line: reminder.lineNumber,
        };
        scheduled++;
      } catch (error) {
        console.error("Android ntfy Notifier publish failed", error);
        failed++;
      }
    }

    this.settings.sent = sent;
    await this.saveSettings();

    const status = failed
      ? `ntfy: ${scheduled} ok, ${failed} failed`
      : `ntfy: ${scheduled} sent`;
    this.updateStatus(status);

    if (showNotice) {
      new Notice(`Android ntfy Notifier: ${scheduled} sent/scheduled, ${skipped} skipped, ${failed} failed`);
    }
  }

  async collectReminders() {
    const files = this.app.vault.getMarkdownFiles();
    const reminders = [];

    for (const file of files) {
      const content = await this.app.vault.cachedRead(file);
      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const parsed = this.parseReminderLine(lines[i], file.path, i + 1);
        if (parsed) reminders.push(parsed);
      }
    }

    reminders.sort((a, b) => a.due.getTime() - b.due.getTime());
    return reminders;
  }

  parseReminderLine(line, filePath, lineNumber) {
    const raw = String(line || "").trim();
    if (!raw) return null;

    const uncheckedTask = /^\s*[-*+]\s+\[\s\]\s+/.test(line);
    const hasMarker =
      raw.includes("⏰") ||
      raw.includes("🔔") ||
      raw.includes("@remind(") ||
      /^notify::/i.test(raw) ||
      /^提醒::/.test(raw);

    if (!hasMarker) return null;
    if (/^\s*[-*+]\s+\[[xX]\]\s+/.test(line)) return null;
    if (!uncheckedTask && !/^notify::/i.test(raw) && !/^提醒::/.test(raw)) return null;

    const match = raw.match(DATE_TIME_RE);
    if (!match) return null;

    const dateText = match[1];
    const timeText = match[2] || this.settings.defaultTime || "09:00";
    const due = this.parseLocalDateTime(dateText, timeText);
    if (!due) return null;

    const cleanedText = raw
      .replace(/^\s*[-*+]\s+\[\s\]\s+/, "")
      .replace(/⏰\s*\d{4}-\d{2}-\d{2}(?:[ T]\d{1,2}:\d{2})?/, "")
      .replace(/🔔\s*\d{4}-\d{2}-\d{2}(?:[ T]\d{1,2}:\d{2})?/, "")
      .replace(/@remind\(\s*\d{4}-\d{2}-\d{2}(?:[ T]\d{1,2}:\d{2})?\s*\)/, "")
      .replace(/^notify::\s*/i, "")
      .replace(/^提醒::\s*/, "")
      .replace(DATE_TIME_RE, "")
      .trim();

    const keyBase = `${filePath}:${lineNumber}:${dateText} ${timeText}:${cleanedText}`;
    return {
      key: this.hash(keyBase),
      due,
      text: cleanedText || "Obsidian reminder",
      filePath,
      lineNumber,
    };
  }

  parseLocalDateTime(dateText, timeText) {
    const parts = `${dateText} ${timeText}`.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})$/);
    if (!parts) return null;
    const year = Number(parts[1]);
    const month = Number(parts[2]) - 1;
    const day = Number(parts[3]);
    const hour = Number(parts[4]);
    const minute = Number(parts[5]);
    const due = new Date(year, month, day, hour, minute, 0, 0);
    if (Number.isNaN(due.getTime())) return null;
    return due;
  }

  async publishReminder(reminder, scheduleFuture) {
    const headers = {
      "Content-Type": "text/plain; charset=utf-8",
      "Title": this.safeHeader(`Obsidian: ${reminder.text}`.slice(0, 120)),
    };

    const tags = String(this.settings.tags || "").trim();
    if (tags) headers.Tags = this.safeHeader(tags);

    if (this.settings.priority && this.settings.priority !== "default") {
      headers.Priority = this.safeHeader(String(this.settings.priority));
    }

    if (this.settings.authToken) {
      headers.Authorization = `Bearer ${String(this.settings.authToken).trim()}`;
    }

    if (scheduleFuture && this.settings.scheduleFutureWithNtfy) {
      headers.At = Math.floor(reminder.due.getTime() / 1000).toString();
    }

    const body = this.buildNotificationBody(reminder);
    await requestUrl({
      url: this.topicUrl(),
      method: "POST",
      headers,
      body,
      throw: true,
    });
  }

  buildNotificationBody(reminder) {
    const lines = [];
    if (this.settings.includeTaskText) lines.push(reminder.text);
    lines.push(`时间: ${this.formatLocalDateTime(reminder.due)}`);

    if (this.settings.includeFullPath) {
      lines.push(`来源: ${reminder.filePath}:${reminder.lineNumber}`);
    } else if (this.settings.includeFileName) {
      lines.push(`来源: ${reminder.filePath.split("/").pop()}:${reminder.lineNumber}`);
    }

    return lines.join("\n");
  }

  async sendTestNotification() {
    if (!this.topicUrl()) {
      new Notice("Android ntfy Notifier: set an ntfy topic first");
      return;
    }

    const reminder = {
      key: "test",
      due: new Date(Date.now() + 5 * 1000),
      text: "Obsidian Android test notification",
      filePath: "test.md",
      lineNumber: 1,
    };

    try {
      await this.publishReminder(reminder, false);
      new Notice("Android ntfy Notifier: test notification sent");
      this.updateStatus("ntfy: test sent");
    } catch (error) {
      console.error(error);
      new Notice(`Android ntfy Notifier failed: ${error.message || error}`);
      this.updateStatus("ntfy: failed");
    }
  }

  formatLocalDateTime(date) {
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  safeHeader(value) {
    return String(value || "").replace(/[\r\n]/g, " ").trim();
  }

  hash(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16);
  }
};

class AndroidNtfyNotifierSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Android ntfy Notifier" });
    containerEl.createEl("p", {
      text: "Send reminder lines to ntfy. Android notifications are shown by the ntfy app subscribed to the same topic.",
    });

    new Setting(containerEl)
      .setName("ntfy server")
      .setDesc("Use https://ntfy.sh or your self-hosted ntfy server.")
      .addText((text) =>
        text
          .setPlaceholder("https://ntfy.sh")
          .setValue(this.plugin.settings.serverUrl)
          .onChange(async (value) => {
            this.plugin.settings.serverUrl = value.trim() || DEFAULT_SETTINGS.serverUrl;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Topic")
      .setDesc("Use a long random topic. Anyone who guesses a public topic can subscribe to it.")
      .addText((text) =>
        text
          .setPlaceholder("murat-ob-random-long-topic")
          .setValue(this.plugin.settings.topic)
          .onChange(async (value) => {
            this.plugin.settings.topic = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Auth token")
      .setDesc("Optional Bearer token for a protected ntfy server/topic.")
      .addText((text) =>
        text
          .setPlaceholder("tk_...")
          .setValue(this.plugin.settings.authToken)
          .onChange(async (value) => {
            this.plugin.settings.authToken = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Scan interval")
      .setDesc("Minutes between scans while Obsidian is running.")
      .addText((text) =>
        text
          .setPlaceholder("15")
          .setValue(String(this.plugin.settings.scanIntervalMinutes))
          .onChange(async (value) => {
            this.plugin.settings.scanIntervalMinutes = Math.max(1, Number(value || 15));
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Default time")
      .setDesc("Used when a reminder has only a date.")
      .addText((text) =>
        text
          .setPlaceholder("09:00")
          .setValue(this.plugin.settings.defaultTime)
          .onChange(async (value) => {
            this.plugin.settings.defaultTime = value.trim() || "09:00";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Schedule future reminders through ntfy")
      .setDesc("Uses ntfy scheduled delivery so Obsidian does not need to be open at the exact reminder time.")
      .addToggle((toggle) =>
        toggle
          .setValue(Boolean(this.plugin.settings.scheduleFutureWithNtfy))
          .onChange(async (value) => {
            this.plugin.settings.scheduleFutureWithNtfy = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Maximum future days")
      .setDesc("Future reminders later than this are ignored until a later scan. ntfy.sh defaults to a 3-day maximum.")
      .addText((text) =>
        text
          .setPlaceholder("3")
          .setValue(String(this.plugin.settings.maxFutureDays))
          .onChange(async (value) => {
            this.plugin.settings.maxFutureDays = Math.max(1, Number(value || 3));
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Include task text")
      .addToggle((toggle) =>
        toggle.setValue(Boolean(this.plugin.settings.includeTaskText)).onChange(async (value) => {
          this.plugin.settings.includeTaskText = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Include file name")
      .addToggle((toggle) =>
        toggle.setValue(Boolean(this.plugin.settings.includeFileName)).onChange(async (value) => {
          this.plugin.settings.includeFileName = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Include full path")
      .setDesc("More useful, but leaks more vault structure to ntfy.")
      .addToggle((toggle) =>
        toggle.setValue(Boolean(this.plugin.settings.includeFullPath)).onChange(async (value) => {
          this.plugin.settings.includeFullPath = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Priority")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("default", "Default")
          .addOption("1", "Min")
          .addOption("2", "Low")
          .addOption("3", "Default")
          .addOption("4", "High")
          .addOption("5", "Urgent")
          .setValue(this.plugin.settings.priority)
          .onChange(async (value) => {
            this.plugin.settings.priority = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Tags")
      .setDesc("Comma-separated ntfy tags, for example bell,warning.")
      .addText((text) =>
        text
          .setPlaceholder("bell")
          .setValue(this.plugin.settings.tags)
          .onChange(async (value) => {
            this.plugin.settings.tags = value.trim();
            await this.plugin.saveSettings();
          })
      );
  }
}
