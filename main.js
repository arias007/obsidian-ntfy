const {
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  requestUrl,
} = require("obsidian");

const PLUGIN_NAME = "Obsidian Ntfy";

const DEFAULT_SETTINGS = {
  serverUrl: "https://ntfy.sh",
  topic: "",
  authToken: "",
  aiWebhookUrl: "",
  aiWebhookToken: "",
  scanIntervalMinutes: 15,
  defaultTime: "09:00",
  includeFileName: true,
  includeFullPath: false,
  includeTaskText: true,
  scheduleFutureWithNtfy: true,
  maxFutureDays: 3,
  sentMaxEntries: 1000,
  priority: "default",
  tags: "bell",
};

const DATE_TIME_RE = /(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})(?:日)?(?:[ T　]+(\d{1,2}:\d{2}))?/;

module.exports = class AndroidNtfyNotifierPlugin extends Plugin {
  async onload() {
    this.settings = this.normalizeSettings(await this.loadData());
    this.isScanning = false;
    this.statusBar = this.addStatusBarItem();
    this.statusBar.addClass("android-ntfy-notifier-status");
    this.statusBar.addClass("obsidian-ntfy-status");
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
        new Notice(`${PLUGIN_NAME}: cache cleared`);
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

  normalizeSettings(data) {
    const settings = Object.assign({}, DEFAULT_SETTINGS, data || {});
    settings.scanIntervalMinutes = this.safePositiveNumber(settings.scanIntervalMinutes, DEFAULT_SETTINGS.scanIntervalMinutes);
    settings.maxFutureDays = this.safePositiveNumber(settings.maxFutureDays, DEFAULT_SETTINGS.maxFutureDays);
    settings.sentMaxEntries = this.safePositiveNumber(settings.sentMaxEntries, DEFAULT_SETTINGS.sentMaxEntries);
    settings.sent = settings.sent && typeof settings.sent === "object" ? settings.sent : {};
    return settings;
  }

  safePositiveNumber(value, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return parsed;
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

  hasDestination() {
    return Boolean(this.topicUrl() || String(this.settings.aiWebhookUrl || "").trim());
  }

  async scanAndSchedule({ showNotice }) {
    if (this.isScanning) {
      if (showNotice) new Notice(`${PLUGIN_NAME}: scan already running`);
      return;
    }

    if (!this.hasDestination()) {
      this.updateStatus("ntfy: no destination");
      if (showNotice) new Notice(`${PLUGIN_NAME}: set an ntfy topic or AI webhook first`);
      return;
    }

    this.isScanning = true;
    let reminders = [];
    try {
      reminders = await this.collectReminders();
    } catch (error) {
      console.error(`${PLUGIN_NAME} scan failed`, error);
      this.updateStatus("ntfy: scan failed");
      if (showNotice) new Notice(`${PLUGIN_NAME}: scan failed, see console`);
      this.isScanning = false;
      return;
    }

    const now = Date.now();
    const sent = this.settings.sent || {};
    const maxFutureMs = Math.max(1, Number(this.settings.maxFutureDays || 3)) * 24 * 60 * 60 * 1000;
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
        console.error(`${PLUGIN_NAME} publish failed`, error);
        failed++;
      }
    }

    this.settings.sent = this.pruneSentCache(sent);
    await this.saveSettings();
    this.isScanning = false;

    const status = failed
      ? `ntfy: ${scheduled} ok, ${failed} failed`
      : `ntfy: ${scheduled} sent`;
    this.updateStatus(status);

    if (showNotice) {
      new Notice(`${PLUGIN_NAME}: ${scheduled} sent/scheduled, ${skipped} skipped, ${failed} failed`);
    }
  }

  async collectReminders() {
    const files = this.app.vault.getMarkdownFiles();
    const reminders = [];

    for (const file of files) {
      try {
        const content = await this.app.vault.cachedRead(file);
        const lines = content.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
          const parsed = this.parseReminderLine(lines[i], file.path, i + 1);
          if (parsed) reminders.push(parsed);
        }
      } catch (error) {
        console.warn(`${PLUGIN_NAME}: skipped unreadable file ${file.path}`, error);
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
      raw.includes("@reminder(") ||
      raw.includes("#remind") ||
      raw.includes("#提醒") ||
      /^notify::/i.test(raw) ||
      /^ntfy::/i.test(raw) ||
      /^提醒::/.test(raw);

    if (!hasMarker) return null;
    if (/^\s*[-*+]\s+\[[xX]\]\s+/.test(line)) return null;
    if (!uncheckedTask && !/^notify::/i.test(raw) && !/^ntfy::/i.test(raw) && !/^提醒::/.test(raw)) return null;

    const match = raw.match(DATE_TIME_RE);
    if (!match) return null;

    const dateText = `${match[1]}-${this.pad2(match[2])}-${this.pad2(match[3])}`;
    const timeText = match[4] || this.settings.defaultTime || "09:00";
    const due = this.parseLocalDateTime(match[1], match[2], match[3], timeText);
    if (!due) return null;

    const cleanedText = raw
      .replace(/^\s*[-*+]\s+\[\s\]\s+/, "")
      .replace(/⏰\s*/g, "")
      .replace(/🔔\s*/g, "")
      .replace(/@remind(?:er)?\(\s*[^)]+\s*\)/i, "")
      .replace(/#remind/i, "")
      .replace(/#提醒/, "")
      .replace(/^notify::\s*/i, "")
      .replace(/^ntfy::\s*/i, "")
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

  parseLocalDateTime(yearText, monthText, dayText, timeText) {
    const timeParts = String(timeText || "").match(/^(\d{1,2}):(\d{2})$/);
    if (!timeParts) return null;
    const year = Number(yearText);
    const month = Number(monthText) - 1;
    const day = Number(dayText);
    const hour = Number(timeParts[1]);
    const minute = Number(timeParts[2]);
    if (hour > 23 || minute > 59) return null;
    const due = new Date(year, month, day, hour, minute, 0, 0);
    if (Number.isNaN(due.getTime())) return null;
    if (due.getFullYear() !== year || due.getMonth() !== month || due.getDate() !== day) return null;
    return due;
  }

  async publishReminder(reminder, scheduleFuture) {
    const results = [];
    let aiWebhookError = null;
    if (this.topicUrl()) {
      results.push(await this.publishNtfy(reminder, scheduleFuture));
    }

    if (String(this.settings.aiWebhookUrl || "").trim()) {
      try {
        results.push(await this.publishAiWebhook(reminder, scheduleFuture));
      } catch (error) {
        aiWebhookError = error;
        console.warn(`${PLUGIN_NAME} AI webhook failed`, error);
      }
    }

    if (!this.topicUrl() && aiWebhookError) {
      throw aiWebhookError;
    }

    return results;
  }

  async publishNtfy(reminder, scheduleFuture) {
    const headers = {
      "Content-Type": "text/plain; charset=utf-8",
      "Title": this.safeHeader(`Obsidian Ntfy: ${reminder.text}`.slice(0, 120)),
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
    return await this.httpRequest({
      url: this.topicUrl(),
      method: "POST",
      headers,
      body,
      throw: true,
    });
  }

  async publishAiWebhook(reminder, scheduleFuture) {
    const headers = {
      "Content-Type": "application/json; charset=utf-8",
    };

    if (this.settings.aiWebhookToken) {
      headers.Authorization = `Bearer ${String(this.settings.aiWebhookToken).trim()}`;
    }

    return await this.httpRequest({
      url: String(this.settings.aiWebhookUrl || "").trim(),
      method: "POST",
      headers,
      body: JSON.stringify({
        source: "obsidian-ntfy",
        type: "reminder",
        scheduledWithNtfy: Boolean(scheduleFuture && this.settings.scheduleFutureWithNtfy),
        reminder: {
          text: reminder.text,
          due: reminder.due.toISOString(),
          dueLocal: this.formatLocalDateTime(reminder.due),
          file: this.settings.includeFullPath ? reminder.filePath : reminder.filePath.split("/").pop(),
          line: reminder.lineNumber,
        },
      }),
      throw: true,
    });
  }

  async httpRequest(options) {
    if (typeof requestUrl === "function") {
      return await requestUrl(options);
    }

    if (typeof fetch !== "function") {
      throw new Error("No HTTP request API is available in this Obsidian environment.");
    }

    const response = await fetch(options.url, {
      method: options.method || "GET",
      headers: options.headers || {},
      body: options.body,
    });
    if (options.throw && !response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    return response;
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
    if (!this.hasDestination()) {
      new Notice(`${PLUGIN_NAME}: set an ntfy topic or AI webhook first`);
      return;
    }

    const reminder = {
      key: "test",
      due: new Date(Date.now() + 5 * 1000),
      text: "Obsidian Ntfy test notification",
      filePath: "test.md",
      lineNumber: 1,
    };

    try {
      await this.publishReminder(reminder, false);
      new Notice(`${PLUGIN_NAME}: test notification sent`);
      this.updateStatus("ntfy: test sent");
    } catch (error) {
      console.error(error);
      new Notice(`${PLUGIN_NAME} failed: ${error.message || error}`);
      this.updateStatus("ntfy: failed");
    }
  }

  formatLocalDateTime(date) {
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  pad2(value) {
    return String(value).padStart(2, "0");
  }

  pruneSentCache(sent) {
    const entries = Object.entries(sent || {});
    const maxEntries = Math.max(100, Number(this.settings.sentMaxEntries || DEFAULT_SETTINGS.sentMaxEntries));
    if (entries.length <= maxEntries) return sent;
    entries.sort((a, b) => String(b[1].at || "").localeCompare(String(a[1].at || "")));
    return Object.fromEntries(entries.slice(0, maxEntries));
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

    containerEl.createEl("h2", { text: PLUGIN_NAME });
    containerEl.createEl("p", {
      text: "Send reminder lines to ntfy and optional AI webhooks. Android notifications are shown by the ntfy app subscribed to the same topic.",
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
      .setName("AI webhook URL")
      .setDesc("Optional JSON endpoint for AI agents or automation. Leave empty to disable.")
      .addText((text) =>
        text
          .setPlaceholder("https://example.com/obsidian-ntfy")
          .setValue(this.plugin.settings.aiWebhookUrl)
          .onChange(async (value) => {
            this.plugin.settings.aiWebhookUrl = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("AI webhook token")
      .setDesc("Optional Bearer token for the AI webhook.")
      .addText((text) =>
        text
          .setPlaceholder("optional")
          .setValue(this.plugin.settings.aiWebhookToken)
          .onChange(async (value) => {
            this.plugin.settings.aiWebhookToken = value.trim();
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
      .setName("Sent cache limit")
      .setDesc("Keeps the sent/scheduled cache bounded for long-running mobile use.")
      .addText((text) =>
        text
          .setPlaceholder("1000")
          .setValue(String(this.plugin.settings.sentMaxEntries))
          .onChange(async (value) => {
            this.plugin.settings.sentMaxEntries = Math.max(100, Number(value || 1000));
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
