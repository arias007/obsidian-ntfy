export type ConversationDirection = "incoming" | "outgoing";
export type ConversationStatus = "sending" | "sent" | "failed" | "received";

export interface ConversationAttachment {
  name?: string;
  type?: string;
  size?: number;
  url?: string;
  path?: string;
  hash?: string;
  temporary?: boolean;
  remoteOnly?: boolean;
  expiresAt?: string;
  savedPath?: string;
  savedAt?: string;
  remotePath?: string;
}

export type ConversationFileInput = string | File | {
  path?: string;
  name?: string;
  type?: string;
  data?: ArrayBuffer;
  file?: File;
};

export interface ConversationParticipant {
  id?: string;
  userId?: string;
  openId?: string;
  name?: string;
  displayName?: string;
  username?: string;
}

export interface ConversationMessageInput {
  id?: string;
  channelId?: string;
  channel?: string;
  provider?: string;
  platform?: string;
  conversationId?: string;
  chatId?: string;
  roomId?: string;
  threadId?: string;
  groupId?: string;
  sessionId?: string;
  conversationName?: string;
  chatName?: string;
  groupName?: string;
  participants?: Array<string | number | ConversationParticipant>;
  members?: Array<string | number | ConversationParticipant>;
  direction?: ConversationDirection | "sent" | "me" | "assistant";
  isMine?: boolean;
  isOutgoing?: boolean;
  sender?: string | ConversationParticipant;
  from?: string | ConversationParticipant;
  author?: string | ConversationParticipant;
  user?: string | ConversationParticipant;
  name?: string;
  role?: string;
  title?: string;
  text?: string;
  message?: string;
  content?: string;
  body?: string;
  timestamp?: string | number | Date;
  sentAt?: string | number | Date;
  receivedAt?: string | number | Date;
  createdAt?: string | number | Date;
  time?: string | number | Date;
  date?: string | number | Date;
  status?: ConversationStatus;
  error?: string;
  attachments?: ConversationAttachment[];
  metadata?: Record<string, unknown>;
}

export interface ConversationImportBundle {
  channelId?: string;
  channel?: string;
  provider?: string;
  platform?: string;
  conversationId?: string;
  chatId?: string;
  roomId?: string;
  threadId?: string;
  groupId?: string;
  sessionId?: string;
  conversationName?: string;
  chatName?: string;
  groupName?: string;
  participants?: Array<string | number | ConversationParticipant>;
  members?: Array<string | number | ConversationParticipant>;
  messages: ConversationMessageInput[];
  metadata?: Record<string, unknown>;
}

export interface ConversationMessage extends ConversationMessageInput {
  id: string;
  channelId: string;
  conversationId: string;
  conversationKey: string;
  direction: ConversationDirection;
  sender: string;
  title: string;
  text: string;
  timestamp: string;
  status: ConversationStatus;
  attachments: ConversationAttachment[];
  metadata: Record<string, unknown>;
}

export interface ConversationImportRequest {
  source?: string;
  importSource?: string;
  mode?: "merge" | "append";
  dryRun?: boolean;
  limit?: number;
  messages?: ConversationMessageInput[];
  conversations?: ConversationImportBundle[];
  conversation?: ConversationImportBundle;
  chat?: ConversationImportBundle;
  group?: ConversationImportBundle;
  channelId?: string;
  channel?: string;
  provider?: string;
  platform?: string;
  conversationId?: string;
  chatId?: string;
  roomId?: string;
  threadId?: string;
  groupId?: string;
  sessionId?: string;
  conversationName?: string;
  chatName?: string;
  groupName?: string;
  participants?: Array<string | number | ConversationParticipant>;
  members?: Array<string | number | ConversationParticipant>;
  metadata?: Record<string, unknown>;
}

export interface ConversationImportResult {
  ok: boolean;
  status: "accepted" | "partial" | "rejected";
  dryRun: boolean;
  mode: "merge" | "append";
  source: string;
  requested: number;
  inserted: number;
  duplicates: number;
  conflicts: number;
  rejected: number;
  errors: Array<{ index: number; error: string }>;
  conversations: string[];
}

export interface ConversationExportRequest {
  conversationKey?: string;
  channelId?: string;
  conversationId?: string;
  limit?: number;
}

export interface ConversationExportResult {
  schemaVersion: 1;
  apiVersion: string;
  exportedAt: string;
  source: "android-ntfy-notifier";
  messages: ConversationMessage[];
}

export interface PublicChannelDescriptor {
  id: string;
  type: string;
  accountId: string;
  name: string;
  providerName: string;
  enabled: boolean;
  configured: boolean;
  sendConfigured: boolean;
  receiveConfigured: boolean;
  canReceive: boolean;
  receiveMode: string;
  connectionStatus: string;
  verificationState: string;
  deliveryReady: boolean;
  builtin: boolean;
}

export interface NotificationHubApi {
  readonly apiVersion: string;
  readonly contractVersion: 2;
  getStatus(): Record<string, unknown>;
  getCapabilities(): Record<string, unknown>;
  listChannels(): PublicChannelDescriptor[];
  send(input: Record<string, unknown>): Promise<unknown>;
  schedule(input: Record<string, unknown>): Promise<unknown>;
  simulate(input: Record<string, unknown>): Promise<unknown>;
  receive(input: ConversationMessageInput): Promise<unknown>;
  importConversationMessages(input: ConversationImportRequest | ConversationMessageInput[] | string): Promise<ConversationImportResult>;
  exportConversationMessages(input?: ConversationExportRequest): ConversationExportResult;
  sendConversationMessage(conversationKey: string, text?: string, files?: ConversationFileInput[]): Promise<ConversationMessage>;
  saveConversationAttachment(messageId: string, attachmentPath: string): Promise<ConversationAttachment>;
  conversations: {
    list(): Array<Record<string, unknown>>;
    get(conversationKey: string): Record<string, unknown> | null;
    messages(conversationKey?: string): ConversationMessage[];
    import(input: ConversationImportRequest | ConversationMessageInput[] | string): Promise<ConversationImportResult>;
    export(input?: ConversationExportRequest): ConversationExportResult;
    send(conversationKey: string, text?: string, files?: ConversationFileInput[]): Promise<ConversationMessage>;
    preference(conversationKey: string): Record<string, unknown>;
    updatePreference(conversationKey: string, patch: Record<string, unknown>): Promise<void>;
    markRead(conversationKey: string): Promise<void>;
    clear(conversationKey: string): Promise<void>;
    removeMessage(messageId: string, direction?: ConversationDirection): Promise<void>;
    saveAttachment(messageId: string, attachmentPath: string): Promise<ConversationAttachment>;
  };
  messages: {
    ingest(input: ConversationMessageInput): Promise<unknown>;
    incoming(): ConversationMessageInput[];
    status(): Record<string, unknown>;
    poll(options?: Record<string, unknown>): Promise<unknown>;
    registerHandler(consumerId: string, handler: ((message: ConversationMessageInput, context: Record<string, unknown>) => unknown) | { handle(message: ConversationMessageInput, context: Record<string, unknown>): unknown }): () => boolean;
    unregisterHandler(consumerId: string): boolean;
    send(conversationKey: string, text?: string, files?: ConversationFileInput[]): Promise<ConversationMessage>;
    reply(messageId: string, replyText: string, channelId?: string): Promise<unknown>;
    retry(messageId: string, channelId?: string): Promise<unknown>;
    remove(messageId: string, channelId?: string): Promise<unknown>;
    clear(): Promise<unknown>;
  };
  channels: {
    list(): PublicChannelDescriptor[];
    get(channelId: string): PublicChannelDescriptor | null;
    register(adapter: Record<string, unknown>): () => boolean;
    unregister(channelId: string): boolean;
    test(channelId?: string): Promise<unknown>;
    poll(options?: Record<string, unknown>): Promise<unknown>;
  };
  notifications: Record<string, (...args: any[]) => any>;
  reminders: Record<string, (...args: any[]) => any>;
  lan: {
    status(): Record<string, unknown>;
    peers(): Array<Record<string, unknown>>;
    activity(): Record<string, unknown>;
    requestSync(): { ok: boolean; status: string };
    sendMessage(deviceId: string, input: Record<string, unknown>): Promise<unknown>;
    sendFile(deviceId: string, vaultPath: string): Promise<unknown>;
    sendDeviceFile(deviceId: string, input: { name: string; type?: string; data: ArrayBuffer }): Promise<ConversationAttachment>;
    cleanupInbox(): Promise<{ removed: number; checked: number }>;
  };
  events: {
    readonly names: readonly string[];
    on(event: string, callback: (...args: any[]) => void): () => boolean;
    off(event: string, callback?: (...args: any[]) => void): boolean;
  };
  manager: {
    open(): Promise<unknown>;
    openSettings(): void;
  };
}

export interface NotificationHubPlugin {
  readonly api: NotificationHubApi;
  getApi(): NotificationHubApi;
}
