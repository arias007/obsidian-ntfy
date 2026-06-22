const {
  Notice,
  Modal,
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
  includeTasksPluginDates: true,
  scheduleFutureWithNtfy: true,
  maxFutureDays: 3,
  queueLookaheadDays: 30,
  defaultDelay: "00:30:00",
  defaultRepeat: "00:00:00",
  sentMaxEntries: 1000,
  priority: "default",
  tags: "bell",
};

const DATE_TIME_RE = /(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})(?:日)?(?:[ T　]+(\d{1,2}:\d{2}))?/;
const DELAY_LINE_RE = /^(?:ntfy-in|notify-in|remind-in|提醒后|稍后提醒)::\s*(\S+)\s*(.*)$/i;
const INLINE_DELAY_RE = /(?:⏲|⏱|after:|in:|后:)\s*(\d+(?::\d{1,2}){1,2}|\d+\s*(?:秒|分钟|分|小时|时|天)?后|\d+\s*(?:s|sec|second|seconds|m|min|minute|minutes|h|hr|hour|hours|d|day|days|秒|分钟|分|小时|时|天)?)/i;
const TASKS_DATE_RE = /(⏳|📅|🛫|➕|✅|✓|❌)\s*(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}:\d{2}))?/gu;
const TASKS_MAIN_DATE_ORDER = ["⏳", "📅", "🛫"];
const TASKS_DATE_LABELS = {
  "⏳": "scheduled",
  "📅": "due",
  "🛫": "start",
  "➕": "created",
  "✅": "done",
  "✓": "done",
  "❌": "cancelled",
};

module.exports = class AndroidNtfyNotifierPlugin extends Plugin {
  async onload() {
    this.settings = this.normalizeSettings(await this.loadData());
    this.isScanning = false;
    this.statusBar = this.addStatusBarItem();
    this.statusBar.addClass("android-ntfy-notifier-status");
    this.statusBar.addClass("obsidian-ntfy-status");
    this.registerDomEvent(this.statusBar, "click", () => this.openNtfyManager());
    this.updateStatusCount();

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
      id: "schedule-delayed-notification",
      name: "Schedule delayed notification",
      callback: async () => this.scheduleDelayedNotificationPrompt(),
    });

    this.addCommand({
      id: "open-ntfy-manager",
      name: "Open ntfy notification manager",
      callback: async () => this.openNtfyManager(),
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
    settings.queueLookaheadDays = this.safePositiveNumber(settings.queueLookaheadDays, DEFAULT_SETTINGS.queueLookaheadDays);
    settings.sentMaxEntries = this.safePositiveNumber(settings.sentMaxEntries, DEFAULT_SETTINGS.sentMaxEntries);
    settings.sent = settings.sent && typeof settings.sent === "object" ? settings.sent : {};
    settings.queue = Array.isArray(settings.queue) ? settings.queue : [];
    return settings;
  }

  safePositiveNumber(value, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return parsed;
  }

  updateStatus(text) {
    if (!this.statusBar) return;
    this.statusBar.setText(text);
    this.statusBar.setAttr("aria-label", "Open Obsidian Ntfy notification manager");
    this.statusBar.setAttr("title", "Open Obsidian Ntfy notification manager");
  }

  updateStatusCount(extraText) {
    const cacheCount = Object.keys(this.settings.sent || {}).length;
    const queueCount = (this.settings.queue || []).length;
    this.updateStatus(extraText ? `ntfy: ${queueCount}/${cacheCount} ${extraText}` : `ntfy: ${queueCount}/${cacheCount}`);
  }

  normalizedServerUrl() {
    return String(this.settings.serverUrl || "https://ntfy.sh").replace(/\/+$/, "");
  }

  topicUrl() {
    const topic = String(this.settings.topic || "").trim();
    if (!topic) return "";
    return `${this.normalizedServerUrl()}/${encodeURIComponent(topic)}`;
  }

  ntfyManagerUrl() {
    const topic = String(this.settings.topic || "").trim();
    if (!topic) return "";
    return `${this.normalizedServerUrl()}/${encodeURIComponent(topic)}`;
  }

  openNtfyManager() {
    new NtfyQueueModal(this.app, this).open();
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
    const queueLookaheadMs = Math.max(1, Number(this.settings.queueLookaheadDays || 30)) * 24 * 60 * 60 * 1000;
    let scheduled = 0;
    let queued = 0;
    let skipped = 0;
    let failed = 0;

    const queueResult = await this.flushDueQueue(now, maxFutureMs);
    scheduled += queueResult.sent;
    failed += queueResult.failed;

    for (const reminder of reminders) {
      if (sent[reminder.key]) {
        skipped++;
        continue;
      }

      const dueMs = reminder.due.getTime();
      const isFuture = reminder.isDelay || dueMs > now + 60 * 1000;
      const tooFar = dueMs - now > maxFutureMs;
      if (isFuture && tooFar) {
        if (dueMs - now <= queueLookaheadMs) {
          this.upsertQueueReminder(reminder);
          queued++;
        } else {
          skipped++;
        }
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

    const cacheCount = Object.keys(this.settings.sent || {}).length;
    this.updateStatusCount(failed ? `(${failed} fail)` : "");

    if (showNotice) {
      new Notice(`${PLUGIN_NAME}: ${scheduled} sent/scheduled, ${queued} queued, ${skipped} skipped, ${failed} failed`);
    }
  }

  async flushDueQueue(now, maxFutureMs) {
    const queue = Array.isArray(this.settings.queue) ? this.settings.queue : [];
    const remaining = [];
    let sent = 0;
    let failed = 0;
    this.settings.sent = this.settings.sent && typeof this.settings.sent === "object" ? this.settings.sent : {};

    for (const item of queue) {
      const due = new Date(item.due);
      if (Number.isNaN(due.getTime())) continue;
      const dueMs = due.getTime();
      if (dueMs - now > maxFutureMs) {
        remaining.push(item);
        continue;
      }

      try {
        await this.publishReminder({
          key: item.id,
          due,
          text: item.text,
          filePath: item.file || "queue",
          lineNumber: item.line || 0,
          source: item.source || "ntfy:queue",
        }, dueMs > now + 1000);
        this.settings.sent[item.id] = {
          at: new Date().toISOString(),
          due: due.toISOString(),
          file: item.file || "queue",
          line: item.line || 0,
        };
        const repeatSeconds = Math.max(0, Number(item.repeatSeconds || 0));
        if (repeatSeconds > 0) {
          const nextDue = this.nextRepeatDue(due, repeatSeconds, now);
          remaining.push(Object.assign({}, item, {
            due: nextDue.toISOString(),
            lastError: "",
            updatedAt: new Date().toISOString(),
          }));
        }
        sent++;
      } catch (error) {
        item.lastError = error.message || String(error);
        remaining.push(item);
        failed++;
      }
    }

    this.settings.queue = remaining.sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime());
    return { sent, failed };
  }

  upsertQueueReminder(reminder) {
    const queue = Array.isArray(this.settings.queue) ? this.settings.queue : [];
    const item = {
      id: reminder.key,
      text: reminder.text,
      due: reminder.due.toISOString(),
      file: reminder.filePath,
      line: reminder.lineNumber,
      source: reminder.source || "obsidian-ntfy",
      createdAt: new Date().toISOString(),
      repeatSeconds: Math.max(0, Number(reminder.repeatSeconds || 0)),
    };
    const index = queue.findIndex((existing) => existing.id === item.id);
    if (index >= 0) queue[index] = Object.assign({}, queue[index], item);
    else queue.push(item);
    this.settings.queue = queue.sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime());
  }

  async addQueueItem(text, due, options = {}) {
    const id = options.id || this.hash(`manual:${Date.now()}:${text}:${due.toISOString()}:${options.repeatSeconds || 0}`);
    this.settings.queue = Array.isArray(this.settings.queue) ? this.settings.queue : [];
    this.settings.queue.push({
      id,
      text: String(text || "").trim() || "Obsidian reminder",
      due: due.toISOString(),
      file: options.file || "manual",
      line: options.line || 0,
      source: options.source || "ntfy:manual",
      repeatSeconds: Math.max(0, Number(options.repeatSeconds || 0)),
      createdAt: options.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    this.settings.queue.sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime());
    await this.saveSettings();
    this.updateStatusCount();
    return id;
  }

  async updateQueueItem(id, patch) {
    this.settings.queue = (this.settings.queue || []).map((item) => item.id === id ? Object.assign({}, item, patch, {
      updatedAt: new Date().toISOString(),
      lastError: patch.lastError === undefined ? "" : patch.lastError,
    }) : item);
    this.settings.queue.sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime());
    await this.saveSettings();
    this.updateStatusCount();
  }

  async deleteQueueItem(id) {
    this.settings.queue = (this.settings.queue || []).filter((item) => item.id !== id);
    await this.saveSettings();
    this.updateStatusCount();
  }

  async sendQueueItemNow(id) {
    const item = (this.settings.queue || []).find((entry) => entry.id === id);
    if (!item) return;
    if (!this.hasDestination()) {
      new Notice(`${PLUGIN_NAME}: set an ntfy topic or AI webhook first`);
      return;
    }

    const due = new Date(item.due);
    const now = Date.now();
    await this.publishReminder({
      key: item.id,
      due: Number.isNaN(due.getTime()) ? new Date(now) : due,
      text: item.text,
      filePath: item.file || "queue",
      lineNumber: item.line || 0,
      source: item.source || "ntfy:queue",
    }, false);

    const repeatSeconds = Math.max(0, Number(item.repeatSeconds || 0));
    if (repeatSeconds > 0) {
      const nextDue = this.nextRepeatDue(Number.isNaN(due.getTime()) ? new Date(now) : due, repeatSeconds, now);
      await this.updateQueueItem(id, { due: nextDue.toISOString() });
    } else {
      await this.deleteQueueItem(id);
    }
  }

  nextRepeatDue(previousDue, repeatSeconds, nowMs) {
    let nextMs = previousDue.getTime() + repeatSeconds * 1000;
    let guard = 0;
    while (nextMs <= nowMs && guard < 10000) {
      nextMs += repeatSeconds * 1000;
      guard++;
    }
    if (nextMs <= nowMs) nextMs = nowMs + repeatSeconds * 1000;
    return new Date(nextMs);
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

    const taskMatch = line.match(/^\s*[-*+]\s+\[([^\]])\]\s+/);
    const isTaskLine = Boolean(taskMatch);
    const taskStatus = taskMatch ? taskMatch[1] : "";
    const uncheckedTask = isTaskLine && taskStatus !== "x" && taskStatus !== "X";
    const tasksDate = this.settings.includeTasksPluginDates ? this.extractTasksDate(raw) : null;
    const delayedLine = this.extractDelayedLine(raw);
    const inlineDelay = isTaskLine ? this.extractInlineDelay(raw) : null;
    const delay = delayedLine || inlineDelay;
    const hasMarker =
      raw.includes("⏰") ||
      raw.includes("🔔") ||
      raw.includes("@remind(") ||
      raw.includes("@reminder(") ||
      raw.includes("#remind") ||
      raw.includes("#提醒") ||
      /^notify::/i.test(raw) ||
      /^ntfy::/i.test(raw) ||
      /^提醒::/.test(raw) ||
      Boolean(delay) ||
      Boolean(tasksDate);

    if (!hasMarker) return null;
    if (isTaskLine && !uncheckedTask) return null;
    if (!uncheckedTask && !/^notify::/i.test(raw) && !/^ntfy::/i.test(raw) && !/^提醒::/.test(raw) && !delayedLine) return null;

    const match = raw.match(DATE_TIME_RE);
    if (!match && !tasksDate && !delay) return null;

    const dateText = delay
      ? `in-${delay.spec}`
      : tasksDate
      ? tasksDate.dateText
      : `${match[1]}-${this.pad2(match[2])}-${this.pad2(match[3])}`;
    const timeText = delay
      ? this.formatDuration(delay.seconds)
      : tasksDate
      ? tasksDate.timeText
      : match[4] || this.settings.defaultTime || "09:00";
    const due = delay
      ? new Date(Date.now() + delay.seconds * 1000)
      : tasksDate
      ? this.parseLocalDateTime(tasksDate.year, tasksDate.month, tasksDate.day, timeText)
      : this.parseLocalDateTime(match[1], match[2], match[3], timeText);
    if (!due) return null;

    let cleanedText = raw
      .replace(/^\s*[-*+]\s+\[[^\]]\]\s+/, "")
      .replace(/⏰\s*/g, "")
      .replace(/🔔\s*/g, "")
      .replace(/@remind(?:er)?\(\s*[^)]+\s*\)/i, "")
      .replace(/#remind/i, "")
      .replace(/#提醒/, "")
      .replace(/^notify::\s*/i, "")
      .replace(/^ntfy::\s*/i, "")
      .replace(/^提醒::\s*/, "")
      .replace(TASKS_DATE_RE, "")
      .replace(/(?:⏫|🔼|🔽|⏬|🔺)\s*/gu, "")
      .replace(/🔁\s+.*?(?=(?:🛫|⏳|📅|➕|✅|✓|❌|🔼|🔽|⏫|⏬|🔺|⛔|🆔|🏁)|$)/gu, "")
      .replace(/(?:🆔|⛔|🏁)\s+\S+/g, "")
      .replace(DATE_TIME_RE, "")
      .trim();
    if (delayedLine) cleanedText = delayedLine.text || cleanedText.replace(DELAY_LINE_RE, "").trim();
    if (inlineDelay) cleanedText = cleanedText.replace(INLINE_DELAY_RE, "").trim();

    const keyBase = delay
      ? `${filePath}:${lineNumber}:delay:${delay.spec}:${cleanedText}`
      : `${filePath}:${lineNumber}:${dateText} ${timeText}:${cleanedText}`;
    return {
      key: this.hash(keyBase),
      due,
      text: cleanedText || "Obsidian reminder",
      filePath,
      lineNumber,
      source: delay ? "ntfy:delay" : tasksDate ? `tasks:${tasksDate.label}` : "obsidian-ntfy",
      isDelay: Boolean(delay),
    };
  }

  extractDelayedLine(raw) {
    const match = raw.match(DELAY_LINE_RE);
    if (!match) return null;
    const parsed = this.parseDelaySpec(match[1]);
    if (!parsed) return null;
    return {
      spec: match[1],
      seconds: parsed,
      text: String(match[2] || "").trim(),
    };
  }

  extractInlineDelay(raw) {
    const match = raw.match(INLINE_DELAY_RE);
    if (!match) return null;
    const parsed = this.parseDelaySpec(match[1]);
    if (!parsed) return null;
    return {
      spec: match[1].replace(/\s+/g, ""),
      seconds: parsed,
    };
  }

  parseDelaySpec(spec) {
    const value = String(spec || "").trim().toLowerCase().replace(/后$/, "");
    if (!value) return null;

    const clock = value.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
    if (clock) {
      const first = Number(clock[1]);
      const second = Number(clock[2]);
      const third = clock[3] === undefined ? null : Number(clock[3]);
      if (second > 59 || (third !== null && third > 59)) return null;
      return third === null ? first * 60 + second : first * 3600 + second * 60 + third;
    }

    const unit = value.match(/^(\d+)\s*(s|sec|second|seconds|m|min|minute|minutes|h|hr|hour|hours|d|day|days|秒|分钟|分|小时|时|天)?$/);
    if (!unit) return null;
    const amount = Number(unit[1]);
    const suffix = unit[2] || "m";
    if (suffix === "s" || suffix === "sec" || suffix === "second" || suffix === "seconds" || suffix === "秒") return amount;
    if (suffix === "m" || suffix === "min" || suffix === "minute" || suffix === "minutes" || suffix === "分钟" || suffix === "分") return amount * 60;
    if (suffix === "h" || suffix === "hr" || suffix === "hour" || suffix === "hours" || suffix === "小时" || suffix === "时") return amount * 3600;
    if (suffix === "d" || suffix === "day" || suffix === "days" || suffix === "天") return amount * 86400;
    return null;
  }

  extractTasksDate(raw) {
    const dates = [];
    for (const match of raw.matchAll(TASKS_DATE_RE)) {
      const signifier = match[1];
      dates.push({
        signifier,
        label: TASKS_DATE_LABELS[signifier] || "date",
        year: match[2],
        month: match[3],
        day: match[4],
        dateText: `${match[2]}-${match[3]}-${match[4]}`,
        timeText: match[5] || this.settings.defaultTime || "09:00",
      });
    }

    for (const wanted of TASKS_MAIN_DATE_ORDER) {
      const found = dates.find((date) => date.signifier === wanted);
      if (found) return found;
    }

    return null;
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
      headers.At = Math.floor(this.normalizeScheduledAt(reminder.due).getTime() / 1000).toString();
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
          source: reminder.source || "obsidian-ntfy",
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

  async scheduleDelayedNotificationPrompt() {
    new NtfyQueueModal(this.app, this).open();
  }

  normalizeScheduledAt(date) {
    const now = Date.now();
    const minDelayMs = 10 * 1000;
    if (date.getTime() - now < minDelayMs) return new Date(now + minDelayMs);
    return date;
  }

  formatDuration(totalSeconds) {
    const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (d > 0) return `${d}d ${this.pad2(h)}:${this.pad2(m)}:${this.pad2(s)}`;
    return `${this.pad2(h)}:${this.pad2(m)}:${this.pad2(s)}`;
  }

  durationFromParts(days, hours, minutes, seconds) {
    const d = Math.max(0, Math.floor(Number(days) || 0));
    const h = Math.max(0, Math.floor(Number(hours) || 0));
    const m = Math.max(0, Math.floor(Number(minutes) || 0));
    const s = Math.max(0, Math.floor(Number(seconds) || 0));
    return d * 86400 + h * 3600 + m * 60 + s;
  }

  durationParts(totalSeconds) {
    const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    return {
      days: Math.floor(seconds / 86400),
      hours: Math.floor((seconds % 86400) / 3600),
      minutes: Math.floor((seconds % 3600) / 60),
      seconds: seconds % 60,
    };
  }

  parseDateTimeLocal(value) {
    const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
    if (!match) return null;
    return this.parseLocalDateTime(match[1], match[2], match[3], `${match[4]}:${match[5]}`);
  }

  formatDateTimeLocal(date) {
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
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

class NtfyQueueModal extends Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen() {
    this.render();
  }

  render() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("obsidian-ntfy-manager");
    contentEl.createEl("h2", { text: "Obsidian Ntfy" });

    const summary = contentEl.createEl("p", {
      cls: "obsidian-ntfy-muted",
      text: `本地队列 ${(this.plugin.settings.queue || []).length} 条。ntfy 官方默认只排队 10 秒到 3 天内的延迟通知；更远的通知先留在 Obsidian 队列。`,
    });
    summary.setAttr("aria-label", "Queue summary");

    this.renderAddForm(contentEl);
    this.renderQueue(contentEl);
  }

  renderAddForm(containerEl) {
    const group = containerEl.createDiv({ cls: "obsidian-ntfy-section" });
    group.createEl("h3", { text: "新增通知" });

    let textValue = "Obsidian reminder";
    const delayDefaults = this.plugin.durationParts(this.plugin.parseDelaySpec(this.plugin.settings.defaultDelay) || 1800);
    const repeatDefaults = this.plugin.durationParts(this.plugin.parseDelaySpec(this.plugin.settings.defaultRepeat) || 0);
    const delayParts = Object.assign({}, delayDefaults);
    const repeatParts = Object.assign({}, repeatDefaults);

    new Setting(group)
      .setName("内容")
      .addText((text) => {
        text.setPlaceholder("通知内容").setValue(textValue).onChange((value) => {
          textValue = value;
        });
      });

    this.renderDurationInputs(group, "多久后通知", delayParts);
    this.renderDurationInputs(group, "循环间隔", repeatParts, "0 表示不循环");

    new Setting(group)
      .setName("操作")
      .addButton((button) =>
        button
          .setButtonText("加入队列")
          .setCta()
          .onClick(async () => {
            const delaySeconds = this.plugin.durationFromParts(delayParts.days, delayParts.hours, delayParts.minutes, delayParts.seconds);
            const repeatSeconds = this.plugin.durationFromParts(repeatParts.days, repeatParts.hours, repeatParts.minutes, repeatParts.seconds);
            if (delaySeconds <= 0) {
              new Notice(`${PLUGIN_NAME}: delay must be greater than 0`);
              return;
            }
            await this.plugin.addQueueItem(textValue, new Date(Date.now() + delaySeconds * 1000), { repeatSeconds });
            new Notice(`${PLUGIN_NAME}: queued`);
            this.render();
          })
      )
      .addButton((button) =>
        button
          .setButtonText("扫描笔记")
          .onClick(async () => {
            await this.plugin.scanAndSchedule({ showNotice: true });
            this.render();
          })
      );
  }

  renderDurationInputs(containerEl, name, parts, desc) {
    const setting = new Setting(containerEl).setName(name);
    if (desc) setting.setDesc(desc);
    this.addNumberControl(setting, "天", parts.days, (value) => { parts.days = value; });
    this.addNumberControl(setting, "时", parts.hours, (value) => { parts.hours = value; });
    this.addNumberControl(setting, "分", parts.minutes, (value) => { parts.minutes = value; });
    this.addNumberControl(setting, "秒", parts.seconds, (value) => { parts.seconds = value; });
  }

  addNumberControl(setting, placeholder, initialValue, onChange) {
    setting.addText((text) => {
      text
        .setPlaceholder(placeholder)
        .setValue(String(initialValue || 0))
        .onChange((value) => {
          onChange(Math.max(0, Math.floor(Number(value) || 0)));
        });
      text.inputEl.type = "number";
      text.inputEl.min = "0";
      text.inputEl.addClass("obsidian-ntfy-number");
      text.inputEl.setAttr("aria-label", placeholder);
    });
  }

  renderQueue(containerEl) {
    const group = containerEl.createDiv({ cls: "obsidian-ntfy-section" });
    group.createEl("h3", { text: "通知队列" });

    const queue = [...(this.plugin.settings.queue || [])].sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime());
    if (!queue.length) {
      group.createEl("p", { cls: "obsidian-ntfy-muted", text: "暂无排队通知。" });
      return;
    }

    for (const item of queue) {
      this.renderQueueItem(group, item);
    }
  }

  renderQueueItem(containerEl, item) {
    const due = new Date(item.due);
    const row = containerEl.createDiv({ cls: "obsidian-ntfy-item" });
    const meta = row.createDiv({ cls: "obsidian-ntfy-item-meta" });
    meta.createEl("strong", { text: item.text || "Obsidian reminder" });
    meta.createEl("div", {
      cls: "obsidian-ntfy-muted",
      text: Number.isNaN(due.getTime()) ? "时间无效" : `到期: ${this.plugin.formatLocalDateTime(due)}`,
    });
    if (Number(item.repeatSeconds || 0) > 0) {
      meta.createEl("div", {
        cls: "obsidian-ntfy-muted",
        text: `循环: ${this.plugin.formatDuration(item.repeatSeconds)}`,
      });
    }
    if (item.file && item.file !== "manual") {
      meta.createEl("div", {
        cls: "obsidian-ntfy-muted",
        text: `来源: ${item.file}:${item.line || 0}`,
      });
    }
    if (item.lastError) {
      meta.createEl("div", {
        cls: "obsidian-ntfy-error",
        text: `错误: ${item.lastError}`,
      });
    }

    const controls = row.createDiv({ cls: "obsidian-ntfy-controls" });
    controls.createEl("button", { text: "编辑" }).addEventListener("click", () => this.openEditModal(item));
    controls.createEl("button", { text: "发送" }).addEventListener("click", async () => {
      try {
        await this.plugin.sendQueueItemNow(item.id);
        new Notice(`${PLUGIN_NAME}: sent`);
        this.render();
      } catch (error) {
        new Notice(`${PLUGIN_NAME}: send failed`);
        await this.plugin.updateQueueItem(item.id, { lastError: error.message || String(error) });
        this.render();
      }
    });
    controls.createEl("button", { text: "删除" }).addEventListener("click", async () => {
      await this.plugin.deleteQueueItem(item.id);
      new Notice(`${PLUGIN_NAME}: deleted`);
      this.render();
    });
  }

  openEditModal(item) {
    const due = new Date(item.due);
    const currentDue = Number.isNaN(due.getTime()) ? new Date(Date.now() + 30 * 60 * 1000) : due;
    let textValue = item.text || "Obsidian reminder";
    let dueValue = this.plugin.formatDateTimeLocal(currentDue);
    const repeatParts = this.plugin.durationParts(item.repeatSeconds || 0);

    const modal = new Modal(this.app);
    modal.onOpen = () => {
      const { contentEl } = modal;
      contentEl.empty();
      contentEl.addClass("obsidian-ntfy-manager");
      contentEl.createEl("h2", { text: "编辑通知" });

      new Setting(contentEl)
        .setName("内容")
        .addText((text) => text.setValue(textValue).onChange((value) => { textValue = value; }));

      new Setting(contentEl)
        .setName("到期时间")
        .addText((text) => {
          text.setValue(dueValue).onChange((value) => { dueValue = value; });
          text.inputEl.type = "datetime-local";
        });

      this.renderDurationInputs(contentEl, "循环间隔", repeatParts, "0 表示不循环");

      new Setting(contentEl)
        .setName("操作")
        .addButton((button) =>
          button
            .setButtonText("保存")
            .setCta()
            .onClick(async () => {
              const parsedDue = this.plugin.parseDateTimeLocal(dueValue);
              if (!parsedDue) {
                new Notice(`${PLUGIN_NAME}: invalid date/time`);
                return;
              }
              const repeatSeconds = this.plugin.durationFromParts(repeatParts.days, repeatParts.hours, repeatParts.minutes, repeatParts.seconds);
              await this.plugin.updateQueueItem(item.id, {
                text: textValue.trim() || "Obsidian reminder",
                due: parsedDue.toISOString(),
                repeatSeconds,
              });
              modal.close();
              this.render();
            })
        )
        .addButton((button) =>
          button.setButtonText("取消").onClick(() => modal.close())
        );
    };
    modal.open();
  }
}

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
      .setName("Default delay")
      .setDesc("Default value for the manager's days/hours/minutes/seconds delay inputs. Supports HH:MM:SS.")
      .addText((text) =>
        text
          .setPlaceholder("00:30:00")
          .setValue(this.plugin.settings.defaultDelay)
          .onChange(async (value) => {
            this.plugin.settings.defaultDelay = value.trim() || "00:30:00";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Default repeat")
      .setDesc("Default repeat interval for the manager. Use 00:00:00 for one-time notifications.")
      .addText((text) =>
        text
          .setPlaceholder("00:00:00")
          .setValue(this.plugin.settings.defaultRepeat)
          .onChange(async (value) => {
            this.plugin.settings.defaultRepeat = value.trim() || "00:00:00";
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
      .setDesc("How far into the future this plugin may hand off reminders to ntfy. ntfy.sh defaults to a 3-day maximum.")
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
      .setName("Local queue lookahead days")
      .setDesc("Future reminders farther than the ntfy handoff window but within this range are kept in Obsidian's local editable queue.")
      .addText((text) =>
        text
          .setPlaceholder("30")
          .setValue(String(this.plugin.settings.queueLookaheadDays))
          .onChange(async (value) => {
            this.plugin.settings.queueLookaheadDays = Math.max(1, Number(value || 30));
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
      .setName("Read Tasks plugin dates")
      .setDesc("Use Tasks Emoji Format dates: scheduled first, then due, then start.")
      .addToggle((toggle) =>
        toggle.setValue(Boolean(this.plugin.settings.includeTasksPluginDates)).onChange(async (value) => {
          this.plugin.settings.includeTasksPluginDates = value;
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
