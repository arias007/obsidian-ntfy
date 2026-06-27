const obsidian = require("obsidian");

const {
  EditorSuggest,
  ItemView,
  MarkdownRenderer,
  MarkdownView,
  Notice,
  Modal,
  Plugin,
  PluginSettingTab,
  Setting,
  requestUrl,
  SuggestModal,
  setIcon,
} = obsidian;

const PLUGIN_NAME = "Ntfy Notifications";
const VIEW_TYPE_NTFY_MANAGER = "obsidian-ntfy-manager-view";

const DEFAULT_SETTINGS = {
  serverUrl: "https://ntfy.sh",
  topic: "",
  authToken: "",
  aiWebhookUrl: "",
  aiWebhookToken: "",
  autoScanEnabled: true,
  scanIntervalMinutes: 15,
  defaultTime: "08:00",
  suggestionDates: "今天,明天,后天,下周一,下周五,下周日",
  suggestionTimes: "08:00,09:00,12:00,18:00,22:00,08:00,09:00,00:30,01:00",
  suggestionLabels: "今天 08:00,今天 09:00,今天 12:00,今天 18:00,今晚 22:00,明天 08:00,明天 09:00,30分钟后,1小时后",
  includeFileName: true,
  includeFullPath: false,
  includeTaskText: true,
  includeTasksPluginDates: true,
  captureObsidianNotices: true,
  scheduleFutureWithNtfy: true,
  maxFutureDays: 3,
  ntfyHandoffLeadMinutes: 60,
  queueLookaheadDays: 30,
  defaultDelay: "00:30:00",
  defaultRepeat: "00:00:00",
  sentMaxEntries: 1000,
  obsidianNoticeMaxEntries: 200,
  priority: "default",
  tags: "bell",
};

const DATE_TIME_RE = /(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})(?:日)?(?:[\sT　]+(\d{1,2}:\d{2}))?/;
const TIME_PREFIX_RE = /^\s*(?:[（(])?(\d{1,2})[:：](\d{2})(?:[）)])?\s*/;
const DATE_TIME_WITH_SEPARATOR_RE = /(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})(?:日)?(?:[\sT　]+(\d{1,2}:\d{2}))?\s*[:：,，、;；]?/;
const DELAY_LINE_RE = /^(?:ntfy-in|notify-in|remind-in|提醒后|稍后提醒)::\s*(\S+)\s*(.*)$/i;
const INLINE_DELAY_RE = /(?:⏲|⏱|after:|in:|后:)\s*(\d+(?::\d{1,2}){1,2}|\d+\s*(?:秒|分钟|分|小时|时|天)?后|\d+\s*(?:s|sec|second|seconds|m|min|minute|minutes|h|hr|hour|hours|d|day|days|秒|分钟|分|小时|时|天)?)/i;
const TASKS_DATE_RE = /(⏳|📅|🛫|➕|✅|✓|❌)\s*(\d{4})-(\d{2})-(\d{2})(?:[\sT　](\d{1,2}:\d{2}))?/gu;
const TASKS_MAIN_DATE_ORDER = ["⏳", "📅", "🛫"];
const DONE_DATE_RE = /\s*(?:✅|✓)\s*\d{4}-\d{2}-\d{2}(?:[\sT　]\d{1,2}:\d{2})?/gu;
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
    this.doneDateWriteGuards = new Set();
    this.doneDateTimers = new Map();
    this.installNoticeCapture();
    this.statusBar = this.addStatusBarItem();
    this.statusBar.addClass("android-ntfy-notifier-status");
    this.statusBar.addClass("obsidian-ntfy-status");
    this.registerDomEvent(this.statusBar, "click", () => this.openNtfyManager());
    this.updateStatusCount();

    this.registerView(
      VIEW_TYPE_NTFY_MANAGER,
      (leaf) => new NtfyManagerView(leaf, this)
    );

    this.addSettingTab(new AndroidNtfyNotifierSettingTab(this.app, this));
    if (typeof EditorSuggest === "function") {
      this.registerEditorSuggest(new NtfyReminderSuggest(this.app, this));
    }

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
      id: "insert-tasks-reminder-date",
      name: "Insert ntfy/Tasks reminder date",
      editorCallback: (editor) => {
        new NtfyReminderInsertModal(this.app, this, editor).open();
      },
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

    this.scanTimer = window.setInterval(
      () => this.runAutoScan(),
      Math.max(1, Number(this.settings.scanIntervalMinutes || 15)) * 60 * 1000
    );
    this.registerInterval(this.scanTimer);
    this.registerEvent(this.app.vault.on("modify", (file) => this.queueEnsureDoneDates(file)));

    this.runAutoScan();
  }

  onunload() {
    this.restoreNoticeCapture();
  }

  runAutoScan() {
    if (!this.settings.autoScanEnabled) {
      this.updateStatusCount("auto off");
      return;
    }
    this.scanAndSchedule({ showNotice: false });
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  normalizeSettings(data) {
    const settings = Object.assign({}, DEFAULT_SETTINGS, data || {});
    settings.scanIntervalMinutes = this.safePositiveNumber(settings.scanIntervalMinutes, DEFAULT_SETTINGS.scanIntervalMinutes);
    settings.maxFutureDays = this.safePositiveNumber(settings.maxFutureDays, DEFAULT_SETTINGS.maxFutureDays);
    settings.ntfyHandoffLeadMinutes = this.safePositiveNumber(settings.ntfyHandoffLeadMinutes, DEFAULT_SETTINGS.ntfyHandoffLeadMinutes);
    settings.queueLookaheadDays = this.safePositiveNumber(settings.queueLookaheadDays, DEFAULT_SETTINGS.queueLookaheadDays);
    settings.sentMaxEntries = this.safePositiveNumber(settings.sentMaxEntries, DEFAULT_SETTINGS.sentMaxEntries);
    settings.obsidianNoticeMaxEntries = this.safePositiveNumber(settings.obsidianNoticeMaxEntries, DEFAULT_SETTINGS.obsidianNoticeMaxEntries);
    settings.sent = settings.sent && typeof settings.sent === "object" ? settings.sent : {};
    settings.ignoredReminders = settings.ignoredReminders && typeof settings.ignoredReminders === "object" ? settings.ignoredReminders : {};
    settings.queue = Array.isArray(settings.queue) ? settings.queue : [];
    settings.obsidianNotices = Array.isArray(settings.obsidianNotices) ? settings.obsidianNotices : [];
    settings.autoScanEnabled = settings.autoScanEnabled !== false;
    settings.captureObsidianNotices = settings.captureObsidianNotices !== false;
    return settings;
  }

  safePositiveNumber(value, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return parsed;
  }

  installNoticeCapture() {
    if (this.noticeCaptureInstalled || !this.settings.captureObsidianNotices) return;
    try {
      this.originalNotice = obsidian.Notice;
      const plugin = this;
      obsidian.Notice = class CapturedObsidianNotice extends plugin.originalNotice {
        constructor(message, timeout) {
          super(message, timeout);
          plugin.recordObsidianNotice(message, timeout);
        }
      };
      this.capturedNotice = obsidian.Notice;
      this.noticeCaptureInstalled = true;
    } catch (error) {
      this.noticeCaptureInstalled = false;
      console.warn(`${PLUGIN_NAME}: Obsidian Notice capture is unavailable`, error);
    }
  }

  restoreNoticeCapture() {
    if (!this.noticeCaptureInstalled || !this.originalNotice) return;
    if (obsidian.Notice === this.capturedNotice) obsidian.Notice = this.originalNotice;
    this.noticeCaptureInstalled = false;
  }

  recordObsidianNotice(message, timeout) {
    if (!this.settings.captureObsidianNotices) return;
    const text = this.noticeText(message);
    if (!text) return;
    this.settings.obsidianNotices = Array.isArray(this.settings.obsidianNotices) ? this.settings.obsidianNotices : [];
    this.settings.obsidianNotices.unshift({
      id: this.hash(`notice:${Date.now()}:${Math.random()}:${text}`),
      text,
      timeout: Number(timeout || 0),
      createdAt: new Date().toISOString(),
      source: "obsidian-notice",
    });
    this.settings.obsidianNotices = this.pruneObsidianNotices(this.settings.obsidianNotices);
    this.saveSettings().catch((error) => console.warn(`${PLUGIN_NAME}: failed to save captured notice`, error));
  }

  noticeText(message) {
    if (message === null || message === undefined) return "";
    if (typeof message === "string") return message.trim();
    if (typeof DocumentFragment !== "undefined" && message instanceof DocumentFragment) return message.textContent.trim();
    if (typeof HTMLElement !== "undefined" && message instanceof HTMLElement) return message.innerText.trim();
    return String(message).trim();
  }

  pruneObsidianNotices(notices) {
    const maxEntries = Math.max(20, Number(this.settings.obsidianNoticeMaxEntries || DEFAULT_SETTINGS.obsidianNoticeMaxEntries));
    return (notices || []).slice(0, maxEntries);
  }

  async deleteObsidianNotice(id) {
    this.settings.obsidianNotices = (this.settings.obsidianNotices || []).filter((notice) => notice.id !== id);
    await this.saveSettings();
  }

  async clearObsidianNotices() {
    this.settings.obsidianNotices = [];
    await this.saveSettings();
  }

  async deleteSentEntry(id) {
    if (!this.settings.sent || !this.settings.sent[id]) return;
    delete this.settings.sent[id];
    await this.saveSettings();
    this.updateStatusCount();
  }

  async sendObsidianNoticeNow(id) {
    const notice = (this.settings.obsidianNotices || []).find((entry) => entry.id === id);
    if (!notice) return;
    if (!this.hasDestination()) {
      new Notice(`${PLUGIN_NAME}: set an ntfy topic or AI webhook first`);
      return;
    }
    const due = new Date();
    await this.publishReminder({
      key: notice.id,
      due,
      text: notice.text,
      filePath: "obsidian-notice",
      lineNumber: 0,
      source: "obsidian-notice",
    }, false);
    this.settings.sent[notice.id] = {
      at: new Date().toISOString(),
      due: due.toISOString(),
      file: "obsidian-notice",
      line: 0,
    };
    this.settings.sent = this.pruneSentCache(this.settings.sent);
    await this.deleteObsidianNotice(id);
    this.updateStatusCount();
  }

  updateStatus(text) {
    if (!this.statusBar) return;
    this.statusBar.setText(text);
    this.statusBar.setAttr("aria-label", "Open Ntfy Notifications manager");
    this.statusBar.setAttr("title", "Open Ntfy Notifications manager");
  }

  updateStatusCount(extraText) {
    const queueCount = (this.settings.queue || []).length;
    const noticeCount = (this.settings.obsidianNotices || []).length;
    const sentCount = Object.keys(this.settings.sent || {}).length;
    const ignoredCount = Object.keys(this.settings.ignoredReminders || {}).length;
    const totalCount = queueCount + noticeCount + sentCount + ignoredCount;
    const localScheduledCount = queueCount;
    const label = `ntfy ${localScheduledCount}/${totalCount}`;
    this.updateStatus(extraText ? `${label} ${extraText}` : label);
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

  async openNtfyManager() {
    const preload = await this.collectManagerViewData();
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_NTFY_MANAGER);
    let leaf = leaves[0];
    if (leaf && leaf.view && typeof leaf.view.setPreloadedData === "function") {
      leaf.view.setPreloadedData(preload);
      await leaf.view.render();
      this.app.workspace.revealLeaf(leaf);
      return;
    }

    this.managerViewPreload = preload;
    if (!leaf) {
      leaf = this.app.workspace.getLeaf("tab");
      await leaf.setViewState({ type: VIEW_TYPE_NTFY_MANAGER, active: true });
    }
    this.app.workspace.revealLeaf(leaf);
  }

  async collectManagerViewData() {
    const data = {
      notificationTasks: [],
      vaultTasks: [],
      scanError: "",
    };
    try {
      data.notificationTasks = await this.collectNotificationTasks();
      data.vaultTasks = await this.collectVaultTasks();
    } catch (error) {
      data.scanError = error.message || String(error);
    }
    return data;
  }

  consumeManagerViewPreload() {
    const data = this.managerViewPreload || null;
    this.managerViewPreload = null;
    return data;
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
    const handoffMs = Math.min(maxFutureMs, Math.max(1, Number(this.settings.ntfyHandoffLeadMinutes || 60)) * 60 * 1000);
    const queueLookaheadMs = Math.max(1, Number(this.settings.queueLookaheadDays || 30)) * 24 * 60 * 60 * 1000;
    let scheduled = 0;
    let queued = 0;
    let skipped = 0;
    let failed = 0;

    const queueResult = await this.flushDueQueue(now, handoffMs);
    scheduled += queueResult.sent;
    failed += queueResult.failed;

    for (const reminder of reminders) {
      if (sent[reminder.key] || this.settings.ignoredReminders[reminder.key]) {
        skipped++;
        continue;
      }

      const dueMs = reminder.due.getTime();
      const isFuture = reminder.isDelay || dueMs > now + 60 * 1000;
      if (isFuture) {
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

  async collectUnqueuedReminders() {
    const reminders = await this.collectReminders();
    const queueIds = new Set((this.settings.queue || []).map((item) => item.id));
    const sent = this.settings.sent || {};
    const ignored = this.settings.ignoredReminders || {};
    return reminders
      .filter((reminder) => !queueIds.has(reminder.key) && !sent[reminder.key] && !ignored[reminder.key])
      .sort((a, b) => a.due.getTime() - b.due.getTime());
  }

  async collectNotificationTasks() {
    const reminders = await this.collectReminders();
    const queueIds = new Set((this.settings.queue || []).map((item) => item.id));
    const sent = this.settings.sent || {};
    const ignored = this.settings.ignoredReminders || {};
    return reminders
      .map((reminder) => Object.assign({}, reminder, {
        notificationState: ignored[reminder.key]
          ? "ignored"
          : queueIds.has(reminder.key)
          ? "queued"
          : sent[reminder.key]
          ? "delivered"
          : "pending",
      }))
      .sort((a, b) => a.due.getTime() - b.due.getTime());
  }

  async collectVaultTasks() {
    const files = this.app.vault.getMarkdownFiles();
    const tasks = [];

    for (const file of files) {
      try {
        const content = await this.app.vault.cachedRead(file);
        const lines = content.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
          const parsed = this.parseTaskLine(lines[i], file.path, i + 1);
          if (parsed) tasks.push(parsed);
        }
      } catch (error) {
        console.warn(`${PLUGIN_NAME}: skipped unreadable file ${file.path}`, error);
      }
    }

    tasks.sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      if (a.completed && b.completed) {
        const aDone = a.doneAt ? a.doneAt.getTime() : 0;
        const bDone = b.doneAt ? b.doneAt.getTime() : 0;
        if (aDone !== bDone) return bDone - aDone;
      }
      if (a.due && b.due) return a.due.getTime() - b.due.getTime();
      if (a.due && !b.due) return -1;
      if (!a.due && b.due) return 1;
      return a.filePath.localeCompare(b.filePath) || a.lineNumber - b.lineNumber;
    });
    return tasks;
  }

  async queueReminder(reminder) {
    this.upsertQueueReminder(reminder);
    await this.saveSettings();
    this.updateStatusCount();
  }

  async ignoreReminder(reminder) {
    this.settings.ignoredReminders = this.settings.ignoredReminders && typeof this.settings.ignoredReminders === "object" ? this.settings.ignoredReminders : {};
    this.settings.ignoredReminders[reminder.key] = {
      at: new Date().toISOString(),
      text: reminder.text,
      due: reminder.due.toISOString(),
      file: reminder.filePath,
      line: reminder.lineNumber,
    };
    await this.saveSettings();
  }

  async toggleTaskCompletion(filePath, lineNumber) {
    const path = String(filePath || "").replace(/\\/g, "/");
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file) throw new Error("source not found");
    const lineIndex = Math.max(0, Number(lineNumber || 1) - 1);
    const content = await this.app.vault.read(file);
    const lines = content.split(/\r?\n/);
    if (!lines[lineIndex]) throw new Error("line not found");
    const match = lines[lineIndex].match(/^(\s*[-*+]\s+\[)([^\]])(\]\s+.*)$/);
    if (!match) throw new Error("line is not a task");
    const nextMark = match[2] === "x" || match[2] === "X" ? " " : "x";
    const doneAt = nextMark === "x" ? new Date() : null;
    const body = nextMark === "x" ? this.addTasksDoneDate(match[3], doneAt) : this.removeTasksDoneDate(match[3]);
    lines[lineIndex] = `${match[1]}${nextMark}${body}`;
    await this.app.vault.modify(file, lines.join("\n"));
    return { completed: nextMark === "x", doneAt };
  }

  queueEnsureDoneDates(file) {
    if (!file || file.extension !== "md") return;
    const path = file.path;
    if (this.doneDateWriteGuards.has(path)) return;
    if (this.doneDateTimers.has(path)) window.clearTimeout(this.doneDateTimers.get(path));
    const timer = window.setTimeout(() => {
      this.doneDateTimers.delete(path);
      this.ensureDoneDates(file).catch((error) => console.warn(`${PLUGIN_NAME}: failed to ensure done dates`, error));
    }, 120);
    this.doneDateTimers.set(path, timer);
  }

  async ensureDoneDates(file) {
    if (!file || file.extension !== "md") return;
    const path = file.path;
    if (this.doneDateWriteGuards.has(path)) return;
    const content = await this.app.vault.read(file);
    const lines = content.split(/\r?\n/);
    let changed = false;
    const nextLines = lines.map((line) => {
      const match = String(line || "").match(/^(\s*[-*+]\s+\[([^\]])\]\s+)(.*)$/);
      if (!match) return line;
      const isDone = match[2] === "x" || match[2] === "X";
      const nextBody = isDone ? this.addTasksDoneDate(match[3]) : this.removeTasksDoneDate(match[3]);
      if (nextBody === match[3]) return line;
      changed = true;
      return `${match[1]}${nextBody}`;
    });
    if (!changed) return;
    this.doneDateWriteGuards.add(path);
    try {
      await this.app.vault.modify(file, nextLines.join("\n"));
    } finally {
      window.setTimeout(() => this.doneDateWriteGuards.delete(path), 1000);
    }
  }

  tasksDoneDateText(date = new Date()) {
    const pad = (value) => String(value).padStart(2, "0");
    return `✅ ${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  addTasksDoneDate(taskBody, date = new Date()) {
    const body = String(taskBody || "");
    const doneText = this.tasksDoneDateText(date);
    if (/(?:✅|✓)\s*\d{4}-\d{2}-\d{2}[\sT　]\d{1,2}:\d{2}/u.test(body)) return body;
    if (/(?:✅|✓)\s*\d{4}-\d{2}-\d{2}/u.test(body)) {
      return body.replace(DONE_DATE_RE, ` ${doneText}`).replace(/\s{2,}/g, " ").trim();
    }
    return `${body.trimEnd()} ${doneText}`.trim();
  }

  removeTasksDoneDate(taskBody) {
    return String(taskBody || "").replace(DONE_DATE_RE, "").trimEnd();
  }

  formatDoneDateTime(date) {
    const pad = (value) => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}\u00a0${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  normalizeDoneText(value) {
    return String(value || "").replace(DONE_DATE_RE, "").trim();
  }

  cleanTaskDisplayText(value) {
    const text = String(value || "")
      .replace(/\s+/g, " ")
      .replace(/^[\s:：,，、;；.。]+/u, "")
      .replace(/^\d{1,2}\s*[:：]\s*/u, "")
      .replace(/(\*\*[^*]+\*\*)\s*[:：]\s*/u, "$1 ")
      .replace(/\s*[:：,，、;；.。]+$/u, "")
      .replace(/\s+([:：,，、;；])/gu, "$1")
      .replace(/([:：])\s+/gu, "$1")
      .trim();
    return text || "Task";
  }

  async enableNotificationForReminder(reminder) {
    this.settings.ignoredReminders = this.settings.ignoredReminders && typeof this.settings.ignoredReminders === "object" ? this.settings.ignoredReminders : {};
    delete this.settings.ignoredReminders[reminder.key];
    this.upsertQueueReminder(reminder);
    await this.saveSettings();
    this.updateStatusCount();
  }

  async disableNotificationForReminder(reminder) {
    this.settings.queue = (this.settings.queue || []).filter((item) => item.id !== reminder.key);
    this.settings.ignoredReminders = this.settings.ignoredReminders && typeof this.settings.ignoredReminders === "object" ? this.settings.ignoredReminders : {};
    this.settings.ignoredReminders[reminder.key] = {
      at: new Date().toISOString(),
      text: reminder.text,
      due: reminder.due.toISOString(),
      file: reminder.filePath,
      line: reminder.lineNumber,
    };
    await this.saveSettings();
    this.updateStatusCount();
  }

  async sendReminderNow(reminder) {
    if (!this.hasDestination()) {
      new Notice(`${PLUGIN_NAME}: set an ntfy topic or AI webhook first`);
      return;
    }
    await this.publishReminder(reminder, false);
    this.settings.sent[reminder.key] = {
      at: new Date().toISOString(),
      due: reminder.due.toISOString(),
      file: reminder.filePath,
      line: reminder.lineNumber,
    };
    this.settings.sent = this.pruneSentCache(this.settings.sent);
    await this.saveSettings();
    this.updateStatusCount();
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
    const explicitDateMatch = raw.match(DATE_TIME_RE);
    const taskBody = isTaskLine ? raw.replace(/^\s*[-*+]\s+\[[^\]]\]\s+/, "") : raw;
    const timePrefix = taskBody.match(TIME_PREFIX_RE);
    const diaryDate = isTaskLine && uncheckedTask && !explicitDateMatch && !tasksDate && !delay
      ? this.extractDiaryDate(filePath)
      : null;
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
      Boolean(tasksDate) ||
      Boolean(isTaskLine && uncheckedTask && explicitDateMatch) ||
      Boolean(diaryDate);

    if (!hasMarker) return null;
    if (isTaskLine && !uncheckedTask) return null;
    if (!uncheckedTask && !/^notify::/i.test(raw) && !/^ntfy::/i.test(raw) && !/^提醒::/.test(raw) && !delayedLine) return null;

    const match = explicitDateMatch;
    if (!match && !tasksDate && !delay && !diaryDate) return null;

    const dateText = delay
      ? `in-${delay.spec}`
      : tasksDate
      ? tasksDate.dateText
      : diaryDate
      ? diaryDate.dateText
      : `${match[1]}-${this.pad2(match[2])}-${this.pad2(match[3])}`;
    const timeText = delay
      ? this.formatDuration(delay.seconds)
      : tasksDate
      ? tasksDate.timeText
      : diaryDate
      ? timePrefix ? `${this.pad2(timePrefix[1])}:${timePrefix[2]}` : this.settings.defaultTime || "08:00"
      : match[4] || this.settings.defaultTime || "08:00";
    const due = delay
      ? new Date(Date.now() + delay.seconds * 1000)
      : tasksDate
      ? this.parseLocalDateTime(tasksDate.year, tasksDate.month, tasksDate.day, timeText)
      : diaryDate
      ? this.parseLocalDateTime(diaryDate.year, diaryDate.month, diaryDate.day, timeText)
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
      .replace(DATE_TIME_WITH_SEPARATOR_RE, "")
      .trim();
    if (delayedLine) cleanedText = delayedLine.text || cleanedText.replace(DELAY_LINE_RE, "").trim();
    if (inlineDelay) cleanedText = cleanedText.replace(INLINE_DELAY_RE, "").trim();
    if (diaryDate && timePrefix) cleanedText = cleanedText.replace(TIME_PREFIX_RE, "").trim();
    cleanedText = this.cleanTaskDisplayText(cleanedText);

    const keyBase = delay
      ? `${filePath}:${lineNumber}:delay:${delay.spec}:${cleanedText}`
      : `${filePath}:${lineNumber}:${dateText} ${timeText}:${cleanedText}`;
    return {
      key: this.hash(keyBase),
      due,
      text: cleanedText || "Obsidian reminder",
      filePath,
      lineNumber,
      source: delay ? "ntfy:delay" : tasksDate ? `tasks:${tasksDate.label}` : diaryDate ? "diary-task" : "obsidian-ntfy",
      isDelay: Boolean(delay),
    };
  }

  parseTaskLine(line, filePath, lineNumber) {
    const raw = String(line || "");
    const taskMatch = raw.match(/^\s*[-*+]\s+\[([^\]])\]\s+(.*)$/);
    if (!taskMatch) return null;
    const status = taskMatch[1];
    const completed = status === "x" || status === "X";
    const body = String(taskMatch[2] || "").trim();
    const tasksDate = this.settings.includeTasksPluginDates ? this.extractTasksDate(body) : null;
    const doneDate = this.extractTasksDateByLabel(body, "done");
    const explicitDateMatch = body.match(DATE_TIME_RE);
    const timePrefix = body.match(TIME_PREFIX_RE);
    const diaryDate = !explicitDateMatch && !tasksDate ? this.extractDiaryDate(filePath) : null;
    const timeText = tasksDate
      ? tasksDate.timeText
      : explicitDateMatch
      ? explicitDateMatch[4] || this.settings.defaultTime || "08:00"
      : diaryDate
      ? timePrefix ? `${this.pad2(timePrefix[1])}:${timePrefix[2]}` : this.settings.defaultTime || "08:00"
      : "";
    const due = tasksDate
      ? this.parseLocalDateTime(tasksDate.year, tasksDate.month, tasksDate.day, timeText)
      : explicitDateMatch
      ? this.parseLocalDateTime(explicitDateMatch[1], explicitDateMatch[2], explicitDateMatch[3], timeText)
      : diaryDate
      ? this.parseLocalDateTime(diaryDate.year, diaryDate.month, diaryDate.day, timeText)
      : null;
    const cleanedText = this.cleanTaskDisplayText(body
      .replace(TASKS_DATE_RE, "")
      .replace(DATE_TIME_WITH_SEPARATOR_RE, "")
      .replace(diaryDate && timePrefix ? TIME_PREFIX_RE : /$a/, "")
      .replace(/(?:⏫|🔼|🔽|⏬|🔺)\s*/gu, "")
      .replace(/🔁\s+.*?(?=(?:🛫|⏳|📅|➕|✅|✓|❌|🔼|🔽|⏫|⏬|🔺|⛔|🆔|🏁)|$)/gu, "")
      .replace(/(?:🆔|⛔|🏁)\s+\S+/g, "")
      .trim());
    return {
      key: this.hash(`task:${filePath}:${lineNumber}:${status}:${body}`),
      completed,
      doneAt: doneDate ? this.parseLocalDateTime(doneDate.year, doneDate.month, doneDate.day, doneDate.timeText) : null,
      due,
      hasTime: Boolean(due),
      text: cleanedText || body || "Task",
      filePath,
      lineNumber,
      source: tasksDate ? `tasks:${tasksDate.label}` : diaryDate ? "diary-task" : explicitDateMatch ? "task-date" : "task",
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
        timeText: match[5] || this.settings.defaultTime || "08:00",
      });
    }

    for (const wanted of TASKS_MAIN_DATE_ORDER) {
      const found = dates.find((date) => date.signifier === wanted);
      if (found) return found;
    }

    return null;
  }

  extractTasksDateByLabel(raw, label) {
    for (const match of String(raw || "").matchAll(TASKS_DATE_RE)) {
      const signifier = match[1];
      const currentLabel = TASKS_DATE_LABELS[signifier] || "date";
      if (currentLabel !== label) continue;
      return {
        signifier,
        label: currentLabel,
        year: match[2],
        month: match[3],
        day: match[4],
        dateText: `${match[2]}-${match[3]}-${match[4]}`,
        timeText: match[5] || this.settings.defaultTime || "08:00",
      };
    }
    return null;
  }

  extractDiaryDate(filePath) {
    const normalized = String(filePath || "").replace(/\\/g, "/");
    if (!/(^|\/)(日记|daily|journal)(\/|$)/i.test(normalized)) return null;
    const name = normalized.split("/").pop() || normalized;
    const match = name.match(/(\d{4})[-_.年](\d{1,2})[-_.月](\d{1,2})(?:日)?/);
    if (!match) return null;
    return {
      year: match[1],
      month: match[2],
      day: match[3],
      dateText: `${match[1]}-${this.pad2(match[2])}-${this.pad2(match[3])}`,
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
      "Title": this.safeHeader(`${PLUGIN_NAME}: ${reminder.text}`.slice(0, 120)),
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
      text: "Ntfy Notifications test notification",
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
    await this.openNtfyManager();
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

class NtfyManagerView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.activeTab = "pending";
    this.notificationTasks = [];
    this.vaultTasks = [];
    this.scanError = "";
  }

  getViewType() {
    return VIEW_TYPE_NTFY_MANAGER;
  }

  getDisplayText() {
    return PLUGIN_NAME;
  }

  getIcon() {
    return "bell-ring";
  }

  async onOpen() {
    const preload = this.plugin.consumeManagerViewPreload();
    if (preload) this.setPreloadedData(preload);
    await this.render();
  }

  async onClose() {
    this.viewContentEl().empty();
  }

  viewContentEl() {
    return this.contentEl || this.containerEl.children[1] || this.containerEl;
  }

  setPreloadedData(data) {
    this.preloadedData = data;
    if (!data) return;
    this.notificationTasks = data.notificationTasks || [];
    this.vaultTasks = data.vaultTasks || [];
    this.scanError = data.scanError || "";
  }

  async render() {
    const contentEl = this.viewContentEl();
    contentEl.empty();
    contentEl.addClass("obsidian-ntfy-manager");

    const preload = this.preloadedData;
    this.preloadedData = null;
    if (preload) {
      this.setPreloadedData(preload);
      this.preloadedData = null;
    } else {
      try {
        this.notificationTasks = await this.plugin.collectNotificationTasks();
        this.vaultTasks = await this.plugin.collectVaultTasks();
        this.scanError = "";
      } catch (error) {
        this.notificationTasks = [];
        this.vaultTasks = [];
        this.scanError = error.message || String(error);
      }
    }

    this.renderHeader(contentEl);
    const body = contentEl.createDiv({ cls: "obsidian-ntfy-window-body" });
    if (this.activeTab === "pending") this.renderNotificationTasks(body);
    if (this.activeTab === "queue") this.renderQueueWorkspace(body);
    if (this.activeTab === "completed") this.renderCompletedTasks(body);
    if (this.activeTab === "tasks") this.renderVaultTasks(body);
  }

  renderHeader(containerEl) {
    const taskGroups = this.groupVaultTasks();
    const nav = containerEl.createDiv({ cls: "obsidian-ntfy-nav" });
    this.renderNavItem(nav, "pending", "alarm-clock", "待处理", this.notificationTasks.length);
    this.renderNavItem(nav, "completed", "check-check", "已完成", taskGroups.done.length);
    this.renderNavItem(nav, "tasks", "library", "整库待办", taskGroups.openUntimed.length);
  }

  renderNavItem(containerEl, id, icon, label, value, subValue) {
    const tab = containerEl.createEl("button", {
      cls: `obsidian-ntfy-nav-item${this.activeTab === id ? " is-active" : ""}`,
      attr: { type: "button", title: `${label} ${subValue || value}`, "data-tab-id": id },
    });
    tab.createSpan({ cls: "obsidian-ntfy-nav-badge", text: subValue || String(value) });
    const iconEl = tab.createSpan({ cls: "obsidian-ntfy-nav-icon" });
    if (typeof setIcon === "function") setIcon(iconEl, icon);
    else iconEl.textContent = label.slice(0, 1);
    tab.createSpan({ cls: "obsidian-ntfy-nav-label", text: label });
    tab.addEventListener("click", async () => {
      this.activeTab = id;
      await this.render();
    });
  }

  renderSectionHeader(containerEl, title, count, desc) {
    const header = containerEl.createDiv({ cls: "obsidian-ntfy-section-header" });
    const titleRow = header.createDiv({ cls: "obsidian-ntfy-section-title-row" });
    titleRow.createEl("h3", { text: title });
    if (count !== "") titleRow.createSpan({ cls: "obsidian-ntfy-count", text: String(count) });
    if (desc) header.createEl("p", { cls: "obsidian-ntfy-muted", text: desc });
  }

  button(parentEl, text, kind, onClick) {
    const button = parentEl.createEl("button", { text });
    button.addClass("obsidian-ntfy-button");
    if (kind) button.addClass(`obsidian-ntfy-button-${kind}`);
    button.addEventListener("click", onClick);
    return button;
  }

  iconButton(parentEl, icon, label, kind, onClick) {
    const button = parentEl.createEl("button", {
      cls: "obsidian-ntfy-icon-button",
      attr: { type: "button", title: label, "aria-label": label },
    });
    if (kind) button.addClass(`obsidian-ntfy-button-${kind}`);
    if (typeof setIcon === "function") setIcon(button, icon);
    else button.textContent = label;
    button.addEventListener("click", onClick);
    return button;
  }

  updateIconButton(button, icon, label, kind) {
    if (!button) return;
    button.empty();
    button.setAttr("title", label);
    button.setAttr("aria-label", label);
    for (const value of ["primary", "secondary", "danger"]) {
      button.removeClass(`obsidian-ntfy-button-${value}`);
    }
    if (kind) button.addClass(`obsidian-ntfy-button-${kind}`);
    if (typeof setIcon === "function") setIcon(button, icon);
    else button.textContent = label;
  }

  systemLocale() {
    const docLang = typeof document !== "undefined" && document.documentElement ? document.documentElement.lang : "";
    const navLang = typeof navigator !== "undefined" ? navigator.language : "";
    return String(docLang || navLang || "").toLowerCase();
  }

  isChineseLocale() {
    return /^(zh|cmn|yue)/i.test(this.systemLocale());
  }

  uiText(zh, en) {
    return this.isChineseLocale() ? zh : en;
  }

  renderNotificationToggle(parentEl, reminder, enabled) {
    let isEnabled = Boolean(enabled);
    const onLabel = this.uiText("提醒中", "Notifications on");
    const offLabel = this.uiText("不提醒", "Notifications off");
    const button = this.iconButton(
      parentEl,
      isEnabled ? "bell" : "bell-off",
      isEnabled ? onLabel : offLabel,
      isEnabled ? "primary" : "danger",
      async (event) => {
        event.preventDefault();
        event.stopPropagation();
        try {
          if (isEnabled) {
            await this.plugin.disableNotificationForReminder(reminder);
            isEnabled = false;
            this.updateIconButton(button, "bell-off", offLabel, "danger");
            new Notice(this.uiText(`${PLUGIN_NAME}: 已关闭提醒`, `${PLUGIN_NAME}: notifications off`));
          } else {
            await this.plugin.enableNotificationForReminder(reminder);
            isEnabled = true;
            this.updateIconButton(button, "bell", onLabel, "primary");
            new Notice(this.uiText(`${PLUGIN_NAME}: 已开启提醒`, `${PLUGIN_NAME}: notifications on`));
          }
        } catch (error) {
          new Notice(`${PLUGIN_NAME}: notification update failed`);
          console.error(error);
        }
      }
    );
    return button;
  }

  async refreshTaskCaches() {
    try {
      this.notificationTasks = await this.plugin.collectNotificationTasks();
      this.vaultTasks = await this.plugin.collectVaultTasks();
      this.scanError = "";
      this.updateNavCounts();
      this.plugin.updateStatusCount();
    } catch (error) {
      this.scanError = error.message || String(error);
      console.error(error);
    }
  }

  updateNavCounts() {
    const taskGroups = this.groupVaultTasks();
    this.viewContentEl().querySelectorAll(".obsidian-ntfy-nav-item").forEach((tab) => {
      const id = tab.getAttribute("data-tab-id");
      const badge = tab.querySelector(".obsidian-ntfy-nav-badge");
      if (!badge) return;
      if (id === "pending") badge.textContent = String(this.notificationTasks.length);
      if (id === "completed") badge.textContent = String(taskGroups.done.length);
      if (id === "tasks") badge.textContent = String(taskGroups.openUntimed.length);
    });
  }

  shouldRemoveTaskRowAfterToggle(taskLike) {
    if (this.activeTab === "pending") return Boolean(taskLike.completed);
    if (this.activeTab === "completed") return !taskLike.completed;
    return false;
  }

  removeTaskRow(line) {
    const row = line.closest(".obsidian-ntfy-item") || line;
    row.addClass("obsidian-ntfy-row-removing");
    window.setTimeout(() => row.detach(), 120);
  }

  sourceName(filePath) {
    const path = String(filePath || "");
    const name = path.split(/[\\/]/).pop() || path;
    return name || "来源";
  }

  isOpenableSource(filePath) {
    const path = String(filePath || "").trim();
    return Boolean(path && path !== "manual" && path !== "queue" && path !== "obsidian-notice");
  }

  renderSourceLink(containerEl, filePath, lineNumber, prefix = "") {
    if (!this.isOpenableSource(filePath)) return;
    const wrap = containerEl.createEl("span", { cls: "obsidian-ntfy-source-wrap" });
    if (prefix) wrap.createSpan({ text: prefix });
    const line = Math.max(1, Number(lineNumber || 1));
    const link = wrap.createEl("a", {
      cls: "obsidian-ntfy-source-link",
      text: `(${this.sourceName(filePath)})`,
      attr: { href: "#", title: String(filePath || "") },
    });
    link.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await this.openSource(filePath, line);
    });
  }

  stateClass(state) {
    const normalized = String(state || "pending").toLowerCase();
    if (normalized === "queued") return "obsidian-ntfy-item-state-queued";
    if (normalized === "delivered" || normalized === "sent") return "obsidian-ntfy-item-state-delivered";
    if (normalized === "ignored" || normalized === "off") return "obsidian-ntfy-item-state-ignored";
    if (normalized === "done" || normalized === "completed") return "obsidian-ntfy-item-state-done";
    if (normalized === "untimed") return "obsidian-ntfy-item-state-untimed";
    return "obsidian-ntfy-item-state-pending";
  }

  sourceClass(source) {
    const normalized = String(source || "").toLowerCase();
    if (normalized.includes("tasks:")) return "obsidian-ntfy-item-source-tasks";
    if (normalized.includes("diary")) return "obsidian-ntfy-item-source-diary";
    if (normalized.includes("notice")) return "obsidian-ntfy-item-source-notice";
    if (normalized.includes("manual")) return "obsidian-ntfy-item-source-manual";
    if (normalized.includes("queue")) return "obsidian-ntfy-item-source-queue";
    if (normalized.includes("delay")) return "obsidian-ntfy-item-source-delay";
    return "obsidian-ntfy-item-source-task";
  }

  itemClass(state, source, extra = "") {
    return [
      "obsidian-ntfy-item",
      this.stateClass(state),
      this.sourceClass(source),
      extra,
    ].filter(Boolean).join(" ");
  }

  renderMarkdownContent(containerEl, markdown, sourcePath) {
    const text = this.normalizeTaskDisplayText(markdown || "Task");
    const target = containerEl.createSpan({ cls: "obsidian-ntfy-task-md" });
    if (!MarkdownRenderer || this.shouldRenderInlineMarkdown(text)) {
      this.renderInlineMarkdown(target, text);
      return;
    }
    try {
      let rendered;
      if (typeof MarkdownRenderer.render === "function") {
        rendered = MarkdownRenderer.render(this.plugin.app, text, target, sourcePath || "", this);
      } else if (typeof MarkdownRenderer.renderMarkdown === "function") {
        rendered = MarkdownRenderer.renderMarkdown(text, target, sourcePath || "", this);
      }
      if (rendered && typeof rendered.catch === "function") {
        rendered
          .then(() => this.flattenInlineMarkdown(target, text))
          .catch((error) => {
            console.error(error);
            target.empty();
            target.textContent = text;
          });
      } else if (!target.childNodes.length) {
        target.textContent = text;
      } else {
        this.flattenInlineMarkdown(target, text);
      }
    } catch (error) {
      console.error(error);
      target.empty();
      target.textContent = text;
    }
  }

  flattenInlineMarkdown(target, fallbackText) {
    if (!target.childNodes.length) {
      target.textContent = fallbackText;
      return;
    }
    const onlyChild = target.children.length === 1 ? target.children[0] : null;
    if (onlyChild && ["P", "DIV"].includes(onlyChild.tagName)) {
      while (onlyChild.firstChild) target.insertBefore(onlyChild.firstChild, onlyChild);
      onlyChild.remove();
    }
    target.querySelectorAll("p, div").forEach((block) => {
      block.addClass("obsidian-ntfy-inline-block");
    });
  }

  shouldRenderInlineMarkdown(text) {
    const value = String(text || "");
    if (/\*\*[^*]+\*\*/u.test(value)) return true;
    if (value.length <= 80) return true;
    return !/[#`<>!|]|\n/.test(value);
  }

  renderInlineMarkdown(containerEl, markdown) {
    const text = String(markdown || "");
    const tokenRe = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\)|#[\p{L}\p{N}_/-]+)/gu;
    let lastIndex = 0;
    for (const match of text.matchAll(tokenRe)) {
      if (match.index > lastIndex) containerEl.appendText(text.slice(lastIndex, match.index));
      const token = match[0];
      if (token.startsWith("**") && token.endsWith("**")) {
        containerEl.createEl("strong", { text: token.slice(2, -2) });
      } else if (token.startsWith("[") && token.includes("](")) {
        const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/u);
        if (linkMatch) {
          const link = containerEl.createEl("a", {
            cls: "obsidian-ntfy-inline-link",
            text: linkMatch[1],
            attr: { href: linkMatch[2] },
          });
          link.addEventListener("click", (event) => event.stopPropagation());
        } else {
          containerEl.appendText(token);
        }
      } else if (token.startsWith("#")) {
        containerEl.createSpan({ cls: "obsidian-ntfy-inline-tag", text: token });
      } else {
        containerEl.appendText(token);
      }
      lastIndex = match.index + token.length;
    }
    if (lastIndex < text.length) containerEl.appendText(text.slice(lastIndex));
  }

  normalizeTaskDisplayText(value) {
    return (String(value || "Task").trim() || "Task")
      .replace(/\s*([:：])\s*/g, "\u2060$1 ")
      .replace(/\s{2,}/g, " ");
  }

  timeClass(dueDate) {
    if (!dueDate) return "obsidian-ntfy-task-time-none";
    const due = dueDate instanceof Date ? dueDate : new Date(dueDate);
    const dueMs = due.getTime();
    if (Number.isNaN(dueMs)) return "obsidian-ntfy-task-time-none";
    const now = new Date();
    if (
      due.getFullYear() === now.getFullYear() &&
      due.getMonth() === now.getMonth() &&
      due.getDate() === now.getDate()
    ) return "obsidian-ntfy-task-time-soon";
    if (dueMs < now.getTime()) return "obsidian-ntfy-task-time-past";
    return "obsidian-ntfy-task-time-future";
  }

  renderTaskTime(containerEl, dueText, dueDate) {
    if (!dueText) return;
    containerEl.createSpan({
      cls: `obsidian-ntfy-task-time ${this.timeClass(dueDate)}`,
      text: dueText,
    });
  }

  renderCompletedTaskTime(containerEl, doneText) {
    const text = this.plugin.normalizeDoneText(doneText);
    if (!text) return;
    containerEl.createSpan({
      cls: "obsidian-ntfy-task-time obsidian-ntfy-task-time-done",
      text,
    });
  }

  renderTaskLine(containerEl, taskLike, options = {}) {
    const line = containerEl.createDiv({ cls: `obsidian-ntfy-task-line${taskLike.completed ? " is-done" : ""}` });
    const checkbox = line.createEl("input", {
      cls: "obsidian-ntfy-task-checkbox",
      attr: {
        type: "checkbox",
        title: taskLike.completed ? "标记未完成" : "标记完成",
        "aria-label": taskLike.completed ? "标记未完成" : "标记完成",
      },
    });
    checkbox.checked = Boolean(taskLike.completed);
    checkbox.addEventListener("click", async (event) => {
      event.stopPropagation();
      try {
        const result = await this.plugin.toggleTaskCompletion(taskLike.filePath, taskLike.lineNumber);
        taskLike.completed = Boolean(result.completed);
        taskLike.doneAt = result.doneAt || null;
        line.toggleClass("is-done", taskLike.completed);
        checkbox.checked = taskLike.completed;
        checkbox.setAttr("title", taskLike.completed ? "标记未完成" : "标记完成");
        checkbox.setAttr("aria-label", taskLike.completed ? "标记未完成" : "标记完成");

        const timeContainer = line.querySelector(".obsidian-ntfy-task-actions");
        if (timeContainer) {
          timeContainer.empty();
          if (taskLike.completed) {
            this.renderCompletedTaskTime(timeContainer, this.plugin.formatDoneDateTime(taskLike.doneAt || new Date()));
          } else if (options.dueText) {
            this.renderTaskTime(timeContainer, options.dueText, options.dueDate);
            if (typeof options.renderActions === "function") options.renderActions(timeContainer);
          }
        }

        if (this.shouldRemoveTaskRowAfterToggle(taskLike)) this.removeTaskRow(line);
        this.refreshTaskCaches();
      } catch (error) {
        new Notice(`${PLUGIN_NAME}: task update failed`);
        console.error(error);
        checkbox.checked = !checkbox.checked;
      }
    });

    const content = line.createDiv({ cls: "obsidian-ntfy-task-content" });
    const text = content.createSpan({ cls: "obsidian-ntfy-task-text" });
    this.renderMarkdownContent(text, taskLike.text || "Task", taskLike.filePath || "");
    text.createSpan({ text: "\u00a0" });
    this.renderSourceLink(text, taskLike.filePath, taskLike.lineNumber, "");
    if (options.dueText || options.completedText || typeof options.renderActions === "function") {
      const actions = content.createDiv({ cls: "obsidian-ntfy-task-actions" });
      if (taskLike.completed && options.completedText) {
        this.renderCompletedTaskTime(actions, options.completedText);
      } else {
        this.renderTaskTime(actions, options.dueText, options.dueDate);
      }
      if (typeof options.renderActions === "function") options.renderActions(actions);
    }
  }

  async openSource(filePath, lineNumber) {
    if (!this.isOpenableSource(filePath)) {
      new Notice(`${PLUGIN_NAME}: no source note`);
      return;
    }
    const path = String(filePath || "").replace(/\\/g, "/");
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file) {
      new Notice(`${PLUGIN_NAME}: source not found`);
      return;
    }
    const line = Math.max(0, Number(lineNumber || 1) - 1);
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.openFile(file, { active: true, eState: { line } });
    this.app.workspace.revealLeaf(leaf);
    const view = leaf.view;
    if (typeof MarkdownView === "function" && view instanceof MarkdownView && view.editor) {
      view.editor.setCursor({ line, ch: 0 });
      view.editor.scrollIntoView({ from: { line, ch: 0 }, to: { line, ch: 0 } }, true);
    } else if (view && typeof view.setEphemeralState === "function") {
      view.setEphemeralState({ line });
    }
  }

  renderAddForm(containerEl) {
    const details = containerEl.createEl("details", { cls: "obsidian-ntfy-section obsidian-ntfy-compose" });
    details.createEl("summary", { text: "设定通知" });
    const group = details.createDiv({ cls: "obsidian-ntfy-compose-body" });

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
            await this.render();
          })
      )
      .addButton((button) =>
        button
          .setButtonText("扫描笔记")
          .onClick(async () => {
            await this.plugin.scanAndSchedule({ showNotice: true });
            await this.render();
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
      const label = document.createElement("span");
      label.addClass("obsidian-ntfy-unit");
      label.textContent = placeholder;
      text.inputEl.insertAdjacentElement("afterend", label);
    });
  }

  renderQueueWorkspace(containerEl) {
    this.renderQueue(containerEl);
    this.renderObsidianNotices(containerEl);
  }

  renderQueue(containerEl) {
    const group = containerEl.createDiv({ cls: "obsidian-ntfy-section" });
    const queue = [...(this.plugin.settings.queue || [])].sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime());
    this.renderSectionHeader(group, "排队中", queue.length, "本地队列，仍可编辑、发送或删除；临近到期才移交 ntfy。");
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
    const row = containerEl.createDiv({ cls: this.itemClass("queued", item.source || "ntfy:queue") });
    const meta = row.createDiv({ cls: "obsidian-ntfy-item-meta" });
    if (this.isOpenableSource(item.file)) {
      this.renderTaskLine(meta, {
        completed: false,
        filePath: item.file,
        lineNumber: item.line || 1,
        text: item.text || "Obsidian reminder",
      }, {
        dueDate: due,
        dueText: Number.isNaN(due.getTime()) ? "时间无效" : this.plugin.formatLocalDateTime(due),
        renderActions: (actions) => {
          this.iconButton(actions, "bell-off", "不通知", "danger", async () => {
            await this.plugin.deleteQueueItem(item.id);
            new Notice(`${PLUGIN_NAME}: notification off`);
            await this.render();
          });
        },
      });
    } else {
      meta.createEl("strong", { text: item.text || "Obsidian reminder" });
      meta.createEl("div", {
        cls: "obsidian-ntfy-muted",
        text: Number.isNaN(due.getTime()) ? "时间无效" : `到期: ${this.plugin.formatLocalDateTime(due)}`,
      });
    }
    if (Number(item.repeatSeconds || 0) > 0) {
      meta.createEl("div", {
        cls: "obsidian-ntfy-muted",
        text: `循环: ${this.plugin.formatDuration(item.repeatSeconds)}`,
      });
    }
    if (item.lastError) {
      meta.createEl("div", {
        cls: "obsidian-ntfy-error",
        text: `错误: ${item.lastError}`,
      });
    }
    if (!this.isOpenableSource(item.file)) {
      const controls = row.createDiv({ cls: "obsidian-ntfy-controls" });
      this.iconButton(controls, "bell-off", "不通知", "danger", async () => {
        await this.plugin.deleteQueueItem(item.id);
        new Notice(`${PLUGIN_NAME}: notification off`);
        await this.render();
      });
    }
  }

  renderNotificationTasks(containerEl) {
    const group = containerEl.createDiv({ cls: "obsidian-ntfy-section" });
    if (this.scanError) {
      group.createEl("p", { cls: "obsidian-ntfy-error", text: `扫描失败: ${this.scanError}` });
      return;
    }
    if (!this.notificationTasks.length) {
      group.createEl("p", { cls: "obsidian-ntfy-muted", text: "暂无带时间的待办提醒。" });
      return;
    }
    for (const reminder of this.notificationTasks) {
      this.renderReminderItem(group, reminder);
    }
  }

  renderReminderItem(containerEl, reminder) {
    const row = containerEl.createDiv({
      cls: this.itemClass(reminder.notificationState || "pending", reminder.source || "task"),
    });
    const meta = row.createDiv({ cls: "obsidian-ntfy-item-meta" });
    this.renderTaskLine(meta, {
      completed: false,
      filePath: reminder.filePath,
      lineNumber: reminder.lineNumber,
      text: reminder.text || "Obsidian reminder",
    }, {
      dueDate: reminder.due,
      dueText: this.plugin.formatLocalDateTime(reminder.due),
      renderActions: (actions) => {
        this.renderNotificationToggle(actions, reminder, reminder.notificationState !== "ignored");
      },
    });
  }

  reminderStateLabel(state) {
    if (state === "queued") return "已排队";
    if (state === "delivered") return "已交付";
    if (state === "ignored") return "不通知";
    return "待处理";
  }

  renderObsidianNotices(containerEl) {
    const group = containerEl.createDiv({ cls: "obsidian-ntfy-section" });
    const notices = this.plugin.settings.obsidianNotices || [];
    this.renderSectionHeader(group, "插件通知", notices.length, "Obsidian 或其他插件弹出的 Notice，按需转发到手机。");
    if (!notices.length) {
      group.createEl("p", { cls: "obsidian-ntfy-muted", text: "暂无捕获的 Obsidian 通知。" });
      return;
    }
    const tools = group.createDiv({ cls: "obsidian-ntfy-controls" });
    this.button(tools, "清空插件通知", "secondary", async () => {
      await this.plugin.clearObsidianNotices();
      await this.render();
    });
    for (const notice of notices.slice(0, 50)) {
      this.renderNoticeItem(group, notice);
    }
  }

  renderNoticeItem(containerEl, notice) {
    const row = containerEl.createDiv({ cls: this.itemClass("pending", notice.source || "obsidian-notice") });
    const meta = row.createDiv({ cls: "obsidian-ntfy-item-meta" });
    meta.createSpan({ cls: "obsidian-ntfy-tag obsidian-ntfy-tag-notice", text: "插件通知" });
    meta.createEl("strong", { text: notice.text || "Obsidian notice" });
    meta.createEl("div", {
      cls: "obsidian-ntfy-muted",
      text: `时间: ${this.plugin.formatLocalDateTime(new Date(notice.createdAt || Date.now()))}`,
    });

    const controls = row.createDiv({ cls: "obsidian-ntfy-controls" });
    this.iconButton(controls, "send", "发送", "primary", async () => {
      try {
        await this.plugin.sendObsidianNoticeNow(notice.id);
        new Notice(`${PLUGIN_NAME}: sent`);
      } catch (error) {
        new Notice(`${PLUGIN_NAME}: send failed`);
        console.error(error);
      }
      await this.render();
    });
    this.iconButton(controls, "trash-2", "删除", "danger", async () => {
      await this.plugin.deleteObsidianNotice(notice.id);
      await this.render();
    });
  }

  renderSentCache(containerEl) {
    const group = containerEl.createDiv({ cls: "obsidian-ntfy-section" });
    const sentEntries = Object.entries(this.plugin.settings.sent || {})
      .sort((a, b) => String(b[1].at || "").localeCompare(String(a[1].at || "")))
      .slice(0, 30);
    this.renderSectionHeader(group, "已交付", Object.keys(this.plugin.settings.sent || {}).length, "已经发送或已移交给 ntfy 的记录，只作为历史和去重缓存。");
    if (!sentEntries.length) {
      group.createEl("p", { cls: "obsidian-ntfy-muted", text: "暂无已提交记录。" });
      return;
    }
    for (const [id, entry] of sentEntries) {
      const row = group.createDiv({
        cls: this.itemClass("delivered", entry.source || entry.file || "sent", "obsidian-ntfy-item-compact"),
      });
      const meta = row.createDiv({ cls: "obsidian-ntfy-item-meta" });
      meta.createSpan({ cls: "obsidian-ntfy-tag obsidian-ntfy-tag-sent", text: "已交付" });
      meta.createEl("strong", { text: entry.file || id });
      meta.createEl("div", {
        cls: "obsidian-ntfy-muted",
        text: `提交: ${entry.at ? this.plugin.formatLocalDateTime(new Date(entry.at)) : "未知"} / 到期: ${entry.due ? this.plugin.formatLocalDateTime(new Date(entry.due)) : "未知"}`,
      });
      if (this.isOpenableSource(entry.file)) {
        const source = meta.createEl("div", { cls: "obsidian-ntfy-muted" });
        this.renderSourceLink(source, entry.file, entry.line || 1, "来源 ");
      }
      const controls = row.createDiv({ cls: "obsidian-ntfy-controls" });
      this.iconButton(controls, "trash-2", "删除记录", "secondary", async () => {
        await this.plugin.deleteSentEntry(id);
        await this.render();
      });
    }
  }

  groupVaultTasks() {
    const tasks = this.vaultTasks || [];
    return {
      openTimed: tasks.filter((task) => !task.completed && task.due),
      openUntimed: tasks.filter((task) => !task.completed && !task.due),
      doneTimed: tasks.filter((task) => task.completed && task.due),
      doneUntimed: tasks.filter((task) => task.completed && !task.due),
      done: tasks.filter((task) => task.completed),
    };
  }

  renderVaultTasks(containerEl) {
    const group = containerEl.createDiv({ cls: "obsidian-ntfy-section" });
    const groups = this.groupVaultTasks();
    this.renderTaskGroup(group, "有时间", groups.openTimed, 80);
    this.renderTaskGroup(group, "没时间", groups.openUntimed, 80);
    this.renderTaskGroup(group, "已完成 有时间", groups.doneTimed, 40);
    this.renderTaskGroup(group, "已完成 没时间", groups.doneUntimed, 40);
  }

  renderCompletedTasks(containerEl) {
    const group = containerEl.createDiv({ cls: "obsidian-ntfy-section" });
    const groups = this.groupVaultTasks();
    this.renderTaskGroup(group, "已完成 有时间", groups.doneTimed, 80);
    this.renderTaskGroup(group, "已完成 没时间", groups.doneUntimed, 80);
  }

  renderTaskGroup(containerEl, title, tasks, limit) {
    const block = containerEl.createDiv({ cls: "obsidian-ntfy-task-group" });
    this.renderSectionHeader(block, title, tasks.length, "");
    if (!tasks.length) {
      block.createEl("p", { cls: "obsidian-ntfy-muted", text: "暂无。" });
      return;
    }
    for (const task of tasks.slice(0, limit)) {
      const state = task.completed ? "done" : (task.due ? "pending" : "untimed");
      const displayDate = task.completed ? task.doneAt : task.due;
      const row = block.createDiv({
        cls: `${this.itemClass(state, task.source || "task", "obsidian-ntfy-item-compact")}${task.completed ? " is-done" : ""}`,
      });
      const meta = row.createDiv({ cls: "obsidian-ntfy-item-meta" });
      this.renderTaskLine(meta, task, {
        dueDate: displayDate,
        dueText: !task.completed && displayDate ? this.plugin.formatLocalDateTime(displayDate) : "无时间",
        completedText: task.completed && displayDate ? this.plugin.formatDoneDateTime(displayDate) : "无完成时间",
        renderActions: task.due && !task.completed ? (actions) => {
          this.renderNotificationToggle(actions, {
            key: task.key,
            due: task.due,
            text: task.text,
            filePath: task.filePath,
            lineNumber: task.lineNumber,
            source: task.source || "task",
          }, true);
        } : null,
      });
    }
    if (tasks.length > limit) block.createEl("p", { cls: "obsidian-ntfy-muted", text: `还有 ${tasks.length - limit} 条未显示。` });
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

class NtfyReminderSuggest extends EditorSuggest {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
  }

  onTrigger(cursor, editor) {
    const line = editor.getLine(cursor.line).slice(0, cursor.ch);
    const match = line.match(/(?:^|\s)(ntfy|提醒|notify|remind|todo|task|待办|今天|明天|后天|下周|今晚|早八|上午|中午|下午|30分钟|1小时|📅|⏰|➕|⏲)$/i);
    const taskLine = /^\s*[-*+]\s+\[[^\]]\]/.test(line);
    const emojiTrigger = line.match(/(?:📅|⏰|➕|⏲)\s*$/u);
    const dateNeedsTimeTrigger = /[📅⏰]\s*\d{4}-\d{2}-\d{2}\s*$/u.test(line);
    const taskTextTrigger = taskLine && /[\p{L}\p{N}\u4e00-\u9fff]$/u.test(line) && !/[📅⏰]\s*\d{4}-\d{2}-\d{2}/u.test(line);
    if (!match && !(taskLine && emojiTrigger) && !taskTextTrigger && !dateNeedsTimeTrigger) return null;
    const trigger = match ? match[1] : emojiTrigger ? emojiTrigger[0].trim() : "";
    return {
      start: {
        line: cursor.line,
        ch: match
          ? cursor.ch - match[0].length + (match[0].startsWith(" ") ? 1 : 0)
          : emojiTrigger
          ? cursor.ch - emojiTrigger[0].length
          : dateNeedsTimeTrigger
          ? cursor.ch
          : cursor.ch,
      },
      end: cursor,
      query: trigger,
    };
  }

  getSuggestions(context) {
    const line = context.editor.getLine(context.start.line);
    return ntfyReminderSuggestions(this.plugin, line);
  }

  suggestion(label, due, hint) {
    return {
      label,
      due,
      note: this.plugin.formatLocalDateTime(due),
      hint,
    };
  }

  tasksFields(due, currentLine = "") {
    return ntfyTasksFields(this.plugin, due, currentLine);
  }

  formatDelay(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h > 0 && m > 0) return `${h}h${m}m`;
    if (h > 0) return `${h}h`;
    return `${m}m`;
  }

  renderSuggestion(suggestion, el) {
    el.addClass("obsidian-ntfy-suggest-item");
    el.createEl("div", { cls: "obsidian-ntfy-suggest-title", text: suggestion.label });
    el.createEl("div", { cls: "obsidian-ntfy-suggest-note", text: `${suggestion.hint || "到期"} / ${suggestion.note}` });
  }

  selectSuggestion(suggestion) {
    if (!this.context) return;
    const currentLine = this.context.editor.getLine(this.context.start.line);
    const text = suggestion.insertText || this.tasksFields(suggestion.due, currentLine);
    this.context.editor.replaceRange(text, this.context.start, this.context.end);
  }
}

class NtfyReminderInsertModal extends SuggestModal {
  constructor(app, plugin, editor) {
    super(app);
    this.plugin = plugin;
    this.editor = editor;
    this.setPlaceholder("选择 ntfy / Tasks 到期时间");
  }

  getSuggestions(query) {
    const value = String(query || "").trim();
    const suggestions = ntfyReminderSuggestions(this.plugin, "");
    if (!value) return suggestions;
    return suggestions.filter((item) => `${item.label} ${item.hint} ${item.note}`.toLowerCase().includes(value.toLowerCase()));
  }

  renderSuggestion(suggestion, el) {
    el.addClass("obsidian-ntfy-suggest-item");
    el.createEl("div", { cls: "obsidian-ntfy-suggest-title", text: suggestion.label });
    el.createEl("div", { cls: "obsidian-ntfy-suggest-note", text: `${suggestion.hint || "到期"} / ${suggestion.note}` });
  }

  onChooseSuggestion(suggestion) {
    const cursor = this.editor.getCursor();
    const currentLine = this.editor.getLine(cursor.line);
    const text = suggestion.insertText || ntfyTasksFields(this.plugin, suggestion.due, currentLine);
    this.editor.replaceRange(text, cursor);
  }
}

function ntfyReminderSuggestions(plugin, currentLine = "") {
  const now = new Date();
  const line = String(currentLine || "");
  if (!/[📅⏰]\s*\d{4}-\d{2}-\d{2}/u.test(line)) {
    return ntfyDateSuggestions(plugin, now);
  }
  if (/[📅⏰]\s*\d{4}-\d{2}-\d{2}[\sT　]\d{1,2}:\d{2}/u.test(line)) {
    return ntfyDateTimeSuggestions(plugin);
  }
  return ntfyTimeSuggestions(plugin, line, now);
}

function ntfyDateSuggestions(plugin, now) {
  const labels = String(plugin.settings.suggestionDates || DEFAULT_SETTINGS.suggestionDates)
    .split(/[,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
  const dateForLabel = (label) => {
    if (/^今天$/u.test(label)) return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    if (/^明天$/u.test(label)) return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
    if (/^后天$/u.test(label)) return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2, 0, 0, 0, 0);
    const weekMatch = label.match(/^下周([一二三四五六日天])$/u);
    if (weekMatch) {
      const map = { "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "日": 0, "天": 0 };
      const target = map[weekMatch[1]];
      const current = now.getDay();
      const diff = ((target - current + 7) % 7) + 7;
      return new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff, 0, 0, 0, 0);
    }
    return null;
  };
  return labels.map((label) => {
    const date = dateForLabel(label);
    if (!date) return null;
    const dateText = `${date.getFullYear()}-${plugin.pad2(date.getMonth() + 1)}-${plugin.pad2(date.getDate())}`;
    return {
      label,
      hint: "选择日期",
      note: dateText,
      insertText: `📅 ${dateText} `,
    };
  }).filter(Boolean);
}

function ntfyTimeSuggestions(plugin, currentLine, now) {
  const times = String(plugin.settings.suggestionTimes || DEFAULT_SETTINGS.suggestionTimes)
    .split(/[,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
  const pickTime = (index, fallback) => times[index] || fallback;
  const dateMatch = String(currentLine || "").match(/[📅⏰]\s*(\d{4})-(\d{2})-(\d{2})/u);
  const makeDate = (time) => {
    const parts = String(time || "08:00").split(":");
    const hour = Math.max(0, Math.min(23, Number(parts[0]) || 0));
    const minute = Math.max(0, Math.min(59, Number(parts[1]) || 0));
    const second = Math.max(0, Math.min(59, Number(parts[2]) || 0));
    if (dateMatch) return new Date(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3]), hour, minute, second, 0);
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, second, 0);
  };
  return times.slice(0, 12).map((time, index) => {
    const due = makeDate(pickTime(index, time));
    return {
      label: plugin.formatLocalDateTime(due).slice(11),
      due,
      note: plugin.formatLocalDateTime(due),
      hint: "选择时间",
      insertText: plugin.formatLocalDateTime(due).slice(11),
    };
  });
}

function ntfyDateTimeSuggestions(plugin) {
  return [];
}

function ntfyTasksFields(plugin, due, currentLine = "") {
  const created = plugin.formatLocalDateTime(new Date());
  const createdText = /➕\s*\d{4}-\d{2}-\d{2}/u.test(currentLine) ? "" : `➕ ${created} `;
  return `${createdText}📅 ${plugin.formatLocalDateTime(due)}`.trim();
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
      .setName("Auto scan")
      .setDesc("Automatically scan notes and refresh the local queue while Obsidian is running.")
      .addToggle((toggle) =>
        toggle
          .setValue(Boolean(this.plugin.settings.autoScanEnabled))
          .onChange(async (value) => {
            this.plugin.settings.autoScanEnabled = value;
            await this.plugin.saveSettings();
            this.plugin.runAutoScan();
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
      .setName("Capture Obsidian notices")
      .setDesc("Try to capture later Obsidian/plugin Notice popups into the manager. Plugins that cached Notice before this plugin loaded may not be captured.")
      .addToggle((toggle) =>
        toggle
          .setValue(Boolean(this.plugin.settings.captureObsidianNotices))
          .onChange(async (value) => {
            this.plugin.settings.captureObsidianNotices = value;
            if (value) this.plugin.installNoticeCapture();
            else this.plugin.restoreNoticeCapture();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Obsidian notice cache limit")
      .setDesc("Maximum captured OB/plugin notices to keep in the manager.")
      .addText((text) =>
        text
          .setPlaceholder("200")
          .setValue(String(this.plugin.settings.obsidianNoticeMaxEntries))
          .onChange(async (value) => {
            this.plugin.settings.obsidianNoticeMaxEntries = Math.max(20, Number(value || 200));
            this.plugin.settings.obsidianNotices = this.plugin.pruneObsidianNotices(this.plugin.settings.obsidianNotices || []);
            await this.plugin.saveSettings();
          })
      );

    const timeGroup = containerEl.createDiv({ cls: "obsidian-ntfy-settings-group" });
    timeGroup.createEl("h3", { text: "Time Defaults" });

    new Setting(timeGroup)
      .setName("Default time")
      .setDesc("Used when a reminder has only a date.")
      .addText((text) =>
        text
          .setPlaceholder("08:00")
          .setValue(this.plugin.settings.defaultTime)
          .onChange(async (value) => {
            this.plugin.settings.defaultTime = value.trim() || "08:00";
            await this.plugin.saveSettings();
          })
      );

    new Setting(timeGroup)
      .setName("Suggestion dates")
      .setDesc("Comma-separated date choices shown before time choices.")
      .addText((text) =>
        text
          .setPlaceholder("今天,明天,后天,下周一")
          .setValue(this.plugin.settings.suggestionDates)
          .onChange(async (value) => {
            this.plugin.settings.suggestionDates = value.trim() || DEFAULT_SETTINGS.suggestionDates;
            await this.plugin.saveSettings();
          })
      );

    new Setting(timeGroup)
      .setName("Suggestion times")
      .setDesc("Comma-separated hover suggestion times in HH:MM or HH:MM:SS, used by the reminder picker.")
      .addText((text) =>
        text
          .setPlaceholder("08:00,09:00,12:00,18:00")
          .setValue(this.plugin.settings.suggestionTimes)
          .onChange(async (value) => {
            this.plugin.settings.suggestionTimes = value.trim() || DEFAULT_SETTINGS.suggestionTimes;
            await this.plugin.saveSettings();
          })
      );

    new Setting(timeGroup)
      .setName("Suggestion labels")
      .setDesc("Comma-separated labels matched to the suggestion times, used in the hover picker.")
      .addText((text) =>
        text
          .setPlaceholder("今天 08:00,今天 09:00")
          .setValue(this.plugin.settings.suggestionLabels)
          .onChange(async (value) => {
            this.plugin.settings.suggestionLabels = value.trim() || DEFAULT_SETTINGS.suggestionLabels;
            await this.plugin.saveSettings();
          })
      );

    new Setting(timeGroup)
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

    new Setting(timeGroup)
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
      .setName("ntfy handoff lead minutes")
      .setDesc("Queue items are handed off to ntfy only when they are this close to due time, so they stay editable in Obsidian longer.")
      .addText((text) =>
        text
          .setPlaceholder("60")
          .setValue(String(this.plugin.settings.ntfyHandoffLeadMinutes))
          .onChange(async (value) => {
            this.plugin.settings.ntfyHandoffLeadMinutes = Math.max(1, Number(value || 60));
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




