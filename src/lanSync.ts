import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { RemoteInfo, Socket } from "node:dgram";

export type LanSyncRuntimeSettings = {
  enabled: boolean;
  autoDiscovery: boolean;
  checkIntervalSeconds: number;
  mode: LanSyncMode;
  conflictRule: LanSyncConflictRule;
  syncConfigFolder: boolean;
  configDir: string;
  port: number;
  maxFileBytes: number;
  inboxRetentionHours: number;
  manualPeers: string[];
};

export type LanLinkType = "ethernet" | "wifi" | "hotspot" | "bluetooth-pan" | "usb" | "lan" | "manual";

export type LanSyncPeerInfo = {
  deviceId: string;
  address: string;
  port: number;
  linkType: LanLinkType;
  verified: boolean;
  lastSeenAt: number;
  canHost: boolean;
  compatible: boolean;
};

export type LanSyncIncomingMessage = {
  id: string;
  deviceId: string;
  text: string;
  sentAt: string;
  attachments: LanSyncAttachment[];
};

export type LanSyncMode = "bidirectional" | "incremental-push" | "incremental-pull" | "delete-push" | "delete-pull";
export type LanSyncConflictRule = "latest" | "larger";

export type LanSyncAttachment = {
  name: string;
  type: string;
  path: string;
  size: number;
  hash: string;
  temporary: boolean;
  expiresAt: string;
};

export type LanSyncPolicy = {
  incrementalPush: boolean;
  incrementalPull: boolean;
  deletePush: boolean;
  deletePull: boolean;
  syncConfigFolder: boolean;
  deleteProtocol: boolean;
  conflictRule: LanSyncConflictRule;
};

export type LanSyncPathOptions = {
  syncConfigFolder?: boolean;
  configDir?: string;
  identityRoot?: string;
};

export type LanSyncFileStat = {
  path: string;
  size: number;
  mtime: number;
};

export type LanSyncStorage = {
  identityRoot: string;
  listFiles(includeConfigFolder: boolean): Promise<LanSyncFileStat[]>;
  statFile(path: string): Promise<LanSyncFileStat | null>;
  readBinary(path: string): Promise<ArrayBuffer>;
  writeBinary(path: string, data: ArrayBuffer, mtime?: number): Promise<void>;
  deleteFile(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  readText(path: string): Promise<string>;
  writeText(path: string, content: string): Promise<void>;
  ensureFolder(path: string): Promise<void>;
  listDirectory(path: string): Promise<string[]>;
};

export type LanSyncHttpRequest = {
  url: string;
  method: "POST";
  headers: Record<string, string>;
  body: string;
  timeoutMs: number;
};

export type LanSyncHttpResponse = {
  status: number;
  text: string;
};

export type LanSyncProgressPhase = "stopped" | "discovering" | "connected" | "scanning" | "syncing" | "complete" | "error";

export type LanSyncProgressStage =
  | "stopped"
  | "discovering"
  | "checking-peer"
  | "requesting-peer-scan"
  | "waiting-peer-scan"
  | "enumerating"
  | "fingerprinting"
  | "planning"
  | "transferring"
  | "complete"
  | "peer-upgrade-required"
  | "error";

export type LanSyncProgress = {
  phase: LanSyncProgressPhase;
  stage: LanSyncProgressStage;
  active: boolean;
  peerId: string;
  peerCount: number;
  completed: number;
  total: number;
  bytesTransferred: number;
  bytesTotal: number;
  changed: number;
  conflicts: number;
  uploads: number;
  uploadCompleted: number;
  downloads: number;
  downloadCompleted: number;
  error: string;
};

export type LanSyncFileAction = "push" | "pull" | "delete-local" | "delete-remote";

export type LanSyncFileActivity = {
  path: string;
  action: LanSyncFileAction;
  state: "pending" | "syncing" | "complete" | "deferred" | "error";
  size: number;
};

export type LanSyncScanFileActivity = {
  path: string;
  state: "pending" | "hashing" | "cached" | "complete" | "skipped" | "error";
  size: number;
  reason: string;
};

export type LanSyncScanActivity = {
  id: string;
  phase: "idle" | "scanning" | "complete" | "error";
  completed: number;
  total: number;
  cached: number;
  hashed: number;
  skipped: number;
  error: string;
  files: LanSyncScanFileActivity[];
};

export type LanSyncActivityGroup = {
  key: string;
  total: number;
  completed: number;
  active: number;
  errors: number;
  bytesTotal: number;
  bytesTransferred: number;
  uploads: number;
  uploadCompleted: number;
  downloads: number;
  downloadCompleted: number;
};

export type LanSyncActivitySnapshot = {
  progress: LanSyncProgress;
  files: LanSyncFileActivity[];
  scan: LanSyncScanActivity;
  transferGroups: LanSyncActivityGroup[];
  scanGroups: LanSyncActivityGroup[];
};

export type LanSyncServiceOptions = {
  desktop: boolean;
  getSettings(): LanSyncRuntimeSettings;
  storage: LanSyncStorage;
  httpRequest(request: LanSyncHttpRequest): Promise<LanSyncHttpResponse>;
  onProgress(progress: LanSyncProgress): void;
  onMessage?(message: LanSyncIncomingMessage): void | Promise<void>;
  onPeersChanged?(peers: LanSyncPeerInfo[]): void;
  localStore?: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
  now?: () => number;
};

export type LanSyncManifestEntry = {
  path: string;
  size: number;
  mtime: number;
  hash: string;
};

export type LanSyncReconcileAction = {
  kind: LanSyncFileAction;
  path: string;
  local: LanSyncManifestEntry | null;
  remote: LanSyncManifestEntry | null;
};

export type LanSyncMetadataEntry = {
  path: string;
  size: number;
  mtime: number;
};

export type LanSyncMetadataSnapshot = {
  size: number;
  mtime: number;
};

export type LanSyncMetadataLedgerEntry = {
  local: LanSyncMetadataSnapshot;
  remote: LanSyncMetadataSnapshot;
};

export type LanSyncMetadataLedger = {
  schemaVersion: 3;
  entries: Record<string, LanSyncMetadataLedgerEntry>;
};

export type LanSyncMetadataReconcileAction = {
  kind: LanSyncFileAction;
  path: string;
  local: LanSyncMetadataEntry | null;
  remote: LanSyncMetadataEntry | null;
};

type LanSyncIdentity = {
  schemaVersion: 1;
  vaultId: string;
  secret: string;
  createdAt: string;
};

type LanSyncPeerDescriptor = {
  schemaVersion: 1;
  protocolVersion: 1;
  vaultId: string;
  deviceId: string;
  port: number;
  addresses: string[];
  updatedAt: string;
};

type LanSyncPeer = {
  deviceId: string;
  port: number;
  addresses: Set<string>;
  canHost: boolean;
  lastSeenAt: number;
  verifiedAt: number;
  lastProbeAt: number;
  lastSyncAt: number;
  consecutiveFailures: number;
  lastFailureAt: number;
  probing: boolean;
  manual: boolean;
  lastRemoteSyncRequestId: string;
  remoteFullSyncRequestId: string;
  remoteDirtyPaths: Map<string, number>;
  policy: LanSyncPolicy;
  capabilities: Set<string>;
  compatibilityPendingSince: number;
};

type LanSyncDirtyPath = {
  path: string;
  generation: number;
};

type LanSyncMetadataCommit = {
  path: string;
  coordinator: LanSyncMetadataSnapshot | null;
  peer: LanSyncMetadataSnapshot | null;
};

type LanSyncMetadataActionResult = {
  bytes: number;
  changed: boolean;
  conflict: boolean;
  commit: LanSyncMetadataCommit | null;
};

type LanSyncPeerResult = {
  settledLocalPaths: Set<string>;
  fullSyncComplete: boolean;
};

type LanSyncInboundSession = {
  id: string;
  deviceId: string;
  bytesTotal: number;
  uploads: number;
  downloads: number;
};

type LanNetworkInterface = {
  name: string;
  address: string;
  netmask: string;
  broadcast: string;
  linkType: LanLinkType;
};

type LanSyncEnvelope = {
  version: 1;
  iv: string;
  ciphertext: string;
};

type LanSyncLedger = {
  schemaVersion: 1;
  entries: Record<string, string>;
};

type NodeHttp = typeof import("node:http");
type NodeDgram = typeof import("node:dgram");
type NodeOs = typeof import("node:os");
type RequireLike = (name: string) => unknown;

const PROTOCOL_VERSION = 1;
const PROTOCOL_NAME = "cancip-lan-sync";
const API_PREFIX = "/cancip-lan/v1";
const METADATA_LEDGER_CAPABILITY = "metadata-session-v4";
const METADATA_ROUTE_PREFIX = "/metadata/v4";
const BOOTSTRAP_MTIME_TOLERANCE_MS = 2_000;
const MULTICAST_ADDRESS = "239.255.67.19";
const DISCOVERY_PORT = 43189;
const ANNOUNCE_INTERVAL_MS = 750;
const PEER_SWEEP_INTERVAL_MS = 350;
const PEER_PROBE_INTERVAL_MS = 900;
const PEER_MIN_STABLE_GRACE_MS = 30_000;
const PEER_MAX_ADDRESS_HISTORY = 8;
const REMEMBERED_PEER_MAX_AGE_MS = 30 * 24 * 60 * 60_000;
const SYNC_MIN_INTERVAL_MS = 400;
const QUEUED_SYNC_DELAY_MS = 750;
const MIN_FULL_RESCAN_INTERVAL_MS = 10 * 60_000;
const MAX_FULL_RESCAN_INTERVAL_MS = 60 * 60_000;
const HASH_CONCURRENCY = 12;
const LARGE_TRANSFER_CONCURRENCY = 6;
const MEDIUM_TRANSFER_CONCURRENCY = 8;
const SMALL_TRANSFER_CONCURRENCY = 12;
const SMALL_TRANSFER_BYTES = 512 * 1024;
const MEDIUM_TRANSFER_BYTES = 2 * 1024 * 1024;
const MAX_CLOCK_SKEW_MS = 120_000;
const REPLAY_TTL_MS = 180_000;
const MAX_MANIFEST_FILES = 100_000;
const MAX_LEDGER_ENTRIES = 50_000;
const HARD_MAX_REQUEST_BYTES = 960 * 1024 * 1024;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 120_000;
const DEVICE_ID_STORAGE_KEY = "cancip.lan-sync.device-id.v1";
const HASH_CACHE_STORAGE_PREFIX = "ntfy.lan-sync.hash-cache.v1";
const LAN_INBOX_ROOT = ".trash/ntfy-inbox";
const MAX_MESSAGE_TEXT_LENGTH = 32_000;
const MAX_MESSAGE_ATTACHMENTS = 12;
const MAX_DIRTY_PATHS = 4096;
const MAX_QUEUED_MESSAGES_PER_PEER = 100;
const MAX_PING_MESSAGES = 20;
const OUTBOUND_MESSAGE_STORAGE_PREFIX = "ntfy.lan-message-outbox.v1";

class LanSyncProtocolError extends Error {
  constructor(
    readonly code: string,
    readonly status = 400
  ) {
    super(code);
  }
}

function nodeRequire<T>(name: string): T | null {
  try {
    const scope = globalThis as typeof globalThis & { require?: RequireLike };
    const requireLike = scope.require
      ?? (typeof window !== "undefined" ? (window as unknown as { require?: RequireLike }).require : undefined);
    if (typeof requireLike !== "function") return null;
    return requireLike(name) as T;
  } catch {
    return null;
  }
}

function cryptoApi(): Crypto {
  if (!globalThis.crypto?.subtle) throw new Error("secure_crypto_unavailable");
  return globalThis.crypto;
}

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function bytesToBase64Url(value: ArrayBuffer | Uint8Array): string {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64url");
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, Math.min(bytes.length, index + 0x8000)));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) throw new LanSyncProtocolError("invalid_base64");
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(value, "base64url"));
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function arrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function randomId(bytes: number): string {
  const value = new Uint8Array(bytes);
  cryptoApi().getRandomValues(value);
  return bytesToBase64Url(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!isRecord(parsed)) throw new Error("not_object");
    return parsed;
  } catch {
    throw new LanSyncProtocolError("invalid_json");
  }
}

function safeErrorCode(error: unknown): string {
  if (error instanceof LanSyncProtocolError) return error.code;
  const value = error instanceof Error ? error.message : String(error);
  if (/timeout/i.test(value)) return "timeout";
  if (/precondition/i.test(value)) return "precondition_failed";
  if (/unreachable|fetch|connect|socket|network/i.test(value)) return "peer_unreachable";
  return "sync_failed";
}

function normalizedPort(value: unknown, fallback = 43190): number {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? Math.max(1024, Math.min(65527, parsed)) : fallback;
}

function normalizedMaxFileBytes(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(64 * 1024, Math.min(512 * 1024 * 1024, Math.floor(parsed))) : 50 * 1024 * 1024;
}

function normalizedCheckIntervalSeconds(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(10, Math.min(3600, Math.floor(parsed))) : 60;
}

function normalizedMode(value: unknown): LanSyncMode {
  return value === "incremental-push"
    || value === "incremental-pull"
    || value === "delete-push"
    || value === "delete-pull"
    || value === "bidirectional"
    ? value
    : "bidirectional";
}

function normalizedConflictRule(value: unknown): LanSyncConflictRule {
  return value === "larger" ? "larger" : "latest";
}

function normalizedInboxRetentionHours(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(24 * 90, Math.floor(parsed))) : 168;
}

function normalizedConfigDir(value: unknown): string {
  if (typeof value !== "string") return ".obsidian";
  const path = value.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  return path && !path.includes("/") && path !== "." && path !== ".." ? path : ".obsidian";
}

function fileTransferTimeoutMs(bytes: number): number {
  const estimatedAtTwoMbPerSecond = Math.ceil(Math.max(0, bytes) / (2 * 1024 * 1024) * 1000) + 15_000;
  return Math.max(45_000, Math.min(10 * 60_000, estimatedAtTwoMbPerSecond));
}

function defaultLocalPolicy(): LanSyncPolicy {
  return {
    incrementalPush: true,
    incrementalPull: true,
    deletePush: false,
    deletePull: false,
    syncConfigFolder: false,
    deleteProtocol: true,
    conflictRule: "latest"
  };
}

function passivePeerPolicy(): LanSyncPolicy {
  return {
    incrementalPush: false,
    incrementalPull: false,
    deletePush: false,
    deletePull: false,
    syncConfigFolder: false,
    deleteProtocol: false,
    conflictRule: "latest"
  };
}

function policyFromRaw(value: unknown): LanSyncPolicy {
  if (!isRecord(value)) return passivePeerPolicy();
  return {
    incrementalPush: value.incrementalPush === true,
    incrementalPull: value.incrementalPull === true,
    deletePush: value.deletePush === true,
    deletePull: value.deletePull === true,
    syncConfigFolder: value.syncConfigFolder === true,
    deleteProtocol: value.deleteProtocol === true,
    conflictRule: normalizedConflictRule(value.conflictRule)
  };
}

function headerValue(request: IncomingMessage, name: string): string {
  const value = request.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function normalizeRemoteAddress(value: string): string {
  const trimmed = value.trim().replace(/^::ffff:/i, "");
  return trimmed === "::1" ? "127.0.0.1" : trimmed;
}

export function isPrivateLanAddress(value: string): boolean {
  const host = normalizeRemoteAddress(value).replace(/^\[|\]$/g, "");
  if (host === "127.0.0.1" || host === "localhost") return true;
  const parts = host.split(".");
  if (parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)) {
    const [a, b] = parts.map(Number);
    return a === 10
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || (a === 169 && b === 254);
  }
  return /^f[cd][0-9a-f]{2}:/i.test(host) || /^fe8[0-9a-f]:/i.test(host);
}

export function normalizeLanSyncPath(value: unknown, options: LanSyncPathOptions = {}): string | null {
  if (typeof value !== "string") return null;
  const path = value.trim();
  if (!path || path.length > 1024 || path.includes("\\") || path.includes("\0") || path.startsWith("/") || /^[A-Za-z]:/.test(path)) return null;
  const segments = path.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) return null;
  if (segments.some((segment) => segment.toLocaleLowerCase() === "node_modules" || segment.toLocaleLowerCase() === ".git")) return null;
  if (segments.some((segment) => / \(lan conflict [^)]+\)(?:\.[^.]+)?$/i.test(segment))) return null;
  const root = segments[0].toLocaleLowerCase();
  const normalized = segments.join("/");
  const configDir = normalizedConfigDir(options.configDir);
  const configRoot = configDir.toLocaleLowerCase();
  if (root === "node_modules") return null;
  if (root.startsWith(".") && root !== configRoot) return null;
  if (root !== configRoot) return normalized;
  if (!options.syncConfigFolder || segments.length < 2) return null;
  const lower = normalized.toLocaleLowerCase();
  const identityRoot = typeof options.identityRoot === "string"
    ? options.identityRoot.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").toLocaleLowerCase()
    : "";
  if (identityRoot && (lower === identityRoot || lower.startsWith(`${identityRoot}/`))) return null;
  if (lower === `${configRoot}/workspace.json` || lower === `${configRoot}/workspace-mobile.json`) return null;
  if (lower.startsWith(`${configRoot}/cache/`) || lower.startsWith(`${configRoot}/.cache/`)) return null;
  if (lower === `${configRoot}/plugins/remotely-save` || lower.startsWith(`${configRoot}/plugins/remotely-save/`)) return null;
  if (lower === `${configRoot}/plugins/android-ntfy-notifier/data.json`) return null;
  return normalized;
}

export function classifyLanLinkType(name: string, address = ""): LanLinkType {
  const value = `${name} ${address}`.toLocaleLowerCase();
  if (/bluetooth|\bbnep\b|\bpan\b/.test(value)) return "bluetooth-pan";
  if (/\b(?:r?ndis)\b|usb|tether/.test(value)) return "usb";
  if (/hotspot|mobile hotspot|local area connection\*|192\.168\.137\./.test(value)) return "hotspot";
  if (/wi-?fi|wlan|wireless|802\.11/.test(value)) return "wifi";
  if (/ethernet|以太网|\beth\d*\b|en\d+/.test(value)) return "ethernet";
  return "lan";
}

export function ipv4BroadcastAddress(address: string, netmask: string): string | null {
  const addressParts = address.split(".").map(Number);
  const maskParts = netmask.split(".").map(Number);
  if (addressParts.length !== 4 || maskParts.length !== 4) return null;
  if ([...addressParts, ...maskParts].some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return addressParts.map((part, index) => (part | (~maskParts[index] & 255)) >>> 0).join(".");
}

export function normalizeManualLanPeer(value: unknown, fallbackPort = 43190): { address: string; port: number } | null {
  const raw = typeof value === "string" ? value.trim() : "";
  const match = /^(\d{1,3}(?:\.\d{1,3}){3})(?::(\d{1,5}))?$/.exec(raw);
  if (!match || !isPrivateLanAddress(match[1])) return null;
  if (match[2] && (Number(match[2]) < 1024 || Number(match[2]) > 65527)) return null;
  const port = normalizedPort(match[2] || fallbackPort, 0);
  return port ? { address: match[1].split(".").map((part) => String(Number(part))).join("."), port } : null;
}

export function isLanSyncPathEligible(value: unknown, options: LanSyncPathOptions = {}): value is string {
  return normalizeLanSyncPath(value, options) !== null;
}

function safeLanInboxName(value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : "";
  const name = raw
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .replace(/^\.+|\.+$/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 180);
  return name && name !== "." && name !== ".." ? name : "attachment.bin";
}

export function normalizeLanInboxAttachmentPath(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 512 || value.includes("\\") || value.includes("\0")) return null;
  const segments = value.split("/");
  if (segments.length !== 4 || segments[0] !== ".trash" || segments[1] !== "ntfy-inbox") return null;
  if (!/^[A-Za-z0-9_-]{16,96}$/.test(segments[2])) return null;
  const name = safeLanInboxName(segments[3]);
  return name === segments[3] ? `${LAN_INBOX_ROOT}/${segments[2]}/${name}` : null;
}

export function isLanInboxAttachmentPath(value: unknown): value is string {
  return normalizeLanInboxAttachmentPath(value) !== null;
}

export async function hashLanSyncBytes(value: ArrayBuffer | Uint8Array): Promise<string> {
  return await sha256Bytes(value);
}

function isConfigPath(path: string, configDir: string): boolean {
  return path.toLocaleLowerCase().startsWith(`${normalizedConfigDir(configDir).toLocaleLowerCase()}/`);
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, task: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await task(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, worker));
  return results;
}

async function sha256Bytes(value: ArrayBuffer | Uint8Array | string): Promise<string> {
  const bytes = typeof value === "string" ? utf8(value) : value instanceof Uint8Array ? value : new Uint8Array(value);
  return bytesToBase64Url(await cryptoApi().subtle.digest("SHA-256", arrayBuffer(bytes)));
}

async function aesKey(secret: string): Promise<CryptoKey> {
  const keyMaterial = await cryptoApi().subtle.digest("SHA-256", arrayBuffer(utf8(`cancip-lan-sync:aes:${secret}`)));
  return await cryptoApi().subtle.importKey("raw", keyMaterial, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  const keyMaterial = await cryptoApi().subtle.digest("SHA-256", arrayBuffer(utf8(`cancip-lan-sync:hmac:${secret}`)));
  return await cryptoApi().subtle.importKey("raw", keyMaterial, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function encryptLanSyncPayload(secret: string, value: unknown): Promise<string> {
  const iv = new Uint8Array(12);
  cryptoApi().getRandomValues(iv);
  const ciphertext = await cryptoApi().subtle.encrypt(
    { name: "AES-GCM", iv: arrayBuffer(iv) },
    await aesKey(secret),
    arrayBuffer(utf8(JSON.stringify(value)))
  );
  const envelope: LanSyncEnvelope = {
    version: 1,
    iv: bytesToBase64Url(iv),
    ciphertext: bytesToBase64Url(ciphertext)
  };
  return JSON.stringify(envelope);
}

export async function decryptLanSyncPayload(secret: string, value: string): Promise<Record<string, unknown>> {
  const raw = safeJsonObject(value);
  if (raw.version !== 1 || typeof raw.iv !== "string" || typeof raw.ciphertext !== "string") {
    throw new LanSyncProtocolError("invalid_envelope");
  }
  const iv = base64UrlToBytes(raw.iv);
  if (iv.byteLength !== 12) throw new LanSyncProtocolError("invalid_envelope");
  try {
    const plaintext = await cryptoApi().subtle.decrypt(
      { name: "AES-GCM", iv: arrayBuffer(iv) },
      await aesKey(secret),
      arrayBuffer(base64UrlToBytes(raw.ciphertext))
    );
    return safeJsonObject(new TextDecoder().decode(plaintext));
  } catch (error) {
    if (error instanceof LanSyncProtocolError) throw error;
    throw new LanSyncProtocolError("decrypt_failed", 401);
  }
}

async function requestSignature(secret: string, canonical: string): Promise<string> {
  return bytesToBase64Url(await cryptoApi().subtle.sign("HMAC", await hmacKey(secret), arrayBuffer(utf8(canonical))));
}

async function verifyRequestSignature(secret: string, canonical: string, signature: string): Promise<boolean> {
  try {
    return await cryptoApi().subtle.verify(
      "HMAC",
      await hmacKey(secret),
      arrayBuffer(base64UrlToBytes(signature)),
      arrayBuffer(utf8(canonical))
    );
  } catch {
    return false;
  }
}

async function authHeaders(identity: LanSyncIdentity, deviceId: string, method: string, path: string, body: string, now: number): Promise<Record<string, string>> {
  const timestamp = String(Math.floor(now));
  const nonce = randomId(18);
  const bodyHash = await sha256Bytes(body);
  const canonical = `${method}\n${path}\n${timestamp}\n${nonce}\n${bodyHash}`;
  return {
    "Content-Type": "application/json; charset=utf-8",
    "X-Cancip-Lan-Version": String(PROTOCOL_VERSION),
    "X-Cancip-Vault": identity.vaultId,
    "X-Cancip-Device": deviceId,
    "X-Cancip-Timestamp": timestamp,
    "X-Cancip-Nonce": nonce,
    "X-Cancip-Signature": await requestSignature(identity.secret, canonical)
  };
}

export async function createLanSyncRequestHeaders(input: {
  secret: string;
  vaultId: string;
  deviceId: string;
  method: string;
  path: string;
  body: string;
  now: number;
}): Promise<Record<string, string>> {
  return await authHeaders(
    { schemaVersion: 1, vaultId: input.vaultId, secret: input.secret, createdAt: new Date(input.now).toISOString() },
    input.deviceId,
    input.method,
    input.path,
    input.body,
    input.now
  );
}

export async function verifyLanSyncRequest(input: {
  secret: string;
  vaultId: string;
  method: string;
  path: string;
  body: string;
  headers: Record<string, string>;
  replayCache: Map<string, number>;
  now: number;
}): Promise<string> {
  const version = input.headers["x-cancip-lan-version"] ?? "";
  const vaultId = input.headers["x-cancip-vault"] ?? "";
  const deviceId = input.headers["x-cancip-device"] ?? "";
  const timestampText = input.headers["x-cancip-timestamp"] ?? "";
  const nonce = input.headers["x-cancip-nonce"] ?? "";
  const signature = input.headers["x-cancip-signature"] ?? "";
  if (version !== String(PROTOCOL_VERSION) || vaultId !== input.vaultId) throw new LanSyncProtocolError("vault_mismatch", 401);
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(deviceId) || !/^[A-Za-z0-9_-]{16,64}$/.test(nonce)) throw new LanSyncProtocolError("invalid_auth", 401);
  const timestamp = Number(timestampText);
  if (!Number.isFinite(timestamp) || Math.abs(input.now - timestamp) > MAX_CLOCK_SKEW_MS) throw new LanSyncProtocolError("stale_request", 401);
  for (const [key, expiresAt] of input.replayCache) {
    if (expiresAt <= input.now) input.replayCache.delete(key);
  }
  const replayKey = `${deviceId}:${nonce}`;
  if (input.replayCache.has(replayKey)) throw new LanSyncProtocolError("replayed_request", 409);
  const bodyHash = await sha256Bytes(input.body);
  const canonical = `${input.method}\n${input.path}\n${timestampText}\n${nonce}\n${bodyHash}`;
  if (!await verifyRequestSignature(input.secret, canonical, signature)) throw new LanSyncProtocolError("invalid_auth", 401);
  input.replayCache.set(replayKey, input.now + REPLAY_TTL_MS);
  return deviceId;
}

function manifestWinner(local: LanSyncManifestEntry, remote: LanSyncManifestEntry, rule: LanSyncConflictRule): "local" | "remote" {
  if (rule === "larger" && local.size !== remote.size) return local.size > remote.size ? "local" : "remote";
  if (local.mtime !== remote.mtime) return local.mtime > remote.mtime ? "local" : "remote";
  return local.hash.localeCompare(remote.hash) >= 0 ? "local" : "remote";
}

export function planLanSyncReconciliation(
  localEntries: LanSyncManifestEntry[],
  remoteEntries: LanSyncManifestEntry[],
  ledger: Record<string, string>,
  localPolicy: LanSyncPolicy = defaultLocalPolicy(),
  remotePolicy: LanSyncPolicy = passivePeerPolicy()
): LanSyncReconcileAction[] {
  const local = new Map(localEntries.map((entry) => [entry.path, entry]));
  const remote = new Map(remoteEntries.map((entry) => [entry.path, entry]));
  const paths = [...new Set([...local.keys(), ...remote.keys()])].sort((left, right) => left.localeCompare(right));
  const actions: LanSyncReconcileAction[] = [];
  const canPush = localPolicy.incrementalPush || remotePolicy.incrementalPull;
  const canPull = localPolicy.incrementalPull || remotePolicy.incrementalPush;
  const canDeleteRemote = remotePolicy.deleteProtocol && (localPolicy.deletePush || remotePolicy.deletePull);
  const canDeleteLocal = localPolicy.deletePull || remotePolicy.deletePush;
  for (const path of paths) {
    const localEntry = local.get(path) ?? null;
    const remoteEntry = remote.get(path) ?? null;
    const baseline = ledger[path] ?? "";
    if (localEntry && remoteEntry) {
      if (localEntry.hash === remoteEntry.hash) continue;
      if (baseline && localEntry.hash === baseline) {
        if (canPull) actions.push({ kind: "pull", path, local: localEntry, remote: remoteEntry });
      } else if (baseline && remoteEntry.hash === baseline) {
        if (canPush) actions.push({ kind: "push", path, local: localEntry, remote: remoteEntry });
      } else if (canPush && canPull) {
        actions.push({ kind: manifestWinner(localEntry, remoteEntry, localPolicy.conflictRule) === "local" ? "push" : "pull", path, local: localEntry, remote: remoteEntry });
      } else if (canPush) {
        actions.push({ kind: "push", path, local: localEntry, remote: remoteEntry });
      } else if (canPull) {
        actions.push({ kind: "pull", path, local: localEntry, remote: remoteEntry });
      } else {
        continue;
      }
      continue;
    }
    if (baseline) {
      if (localEntry) {
        if (localEntry.hash === baseline && canDeleteLocal) actions.push({ kind: "delete-local", path, local: localEntry, remote: null });
        else if (localEntry.hash !== baseline && canPush) actions.push({ kind: "push", path, local: localEntry, remote: null });
      } else if (remoteEntry) {
        if (remoteEntry.hash === baseline && canDeleteRemote) actions.push({ kind: "delete-remote", path, local: null, remote: remoteEntry });
        else if (remoteEntry.hash !== baseline && canPull) actions.push({ kind: "pull", path, local: null, remote: remoteEntry });
      }
      continue;
    }
    if (localEntry && canPush) actions.push({ kind: "push", path, local: localEntry, remote: null });
    else if (remoteEntry && canPull) actions.push({ kind: "pull", path, local: null, remote: remoteEntry });
  }
  return actions;
}

function metadataSnapshot(entry: LanSyncMetadataEntry): LanSyncMetadataSnapshot {
  return { size: entry.size, mtime: entry.mtime };
}

function metadataMatches(
  entry: LanSyncMetadataEntry | LanSyncMetadataSnapshot | null | undefined,
  expected: LanSyncMetadataEntry | LanSyncMetadataSnapshot | null | undefined
): boolean {
  return Boolean(entry && expected && entry.size === expected.size && entry.mtime === expected.mtime);
}

function metadataBootstrapEquivalent(local: LanSyncMetadataEntry, remote: LanSyncMetadataEntry): boolean {
  return local.size === remote.size && Math.abs(local.mtime - remote.mtime) <= BOOTSTRAP_MTIME_TOLERANCE_MS;
}

function metadataWinner(local: LanSyncMetadataEntry, remote: LanSyncMetadataEntry, rule: LanSyncConflictRule): "local" | "remote" {
  if (rule === "larger" && local.size !== remote.size) return local.size > remote.size ? "local" : "remote";
  if (local.mtime !== remote.mtime) return local.mtime > remote.mtime ? "local" : "remote";
  if (local.size !== remote.size) return local.size > remote.size ? "local" : "remote";
  return "local";
}

export function planLanSyncMetadataReconciliation(
  localEntries: LanSyncMetadataEntry[],
  remoteEntries: LanSyncMetadataEntry[],
  ledger: Record<string, LanSyncMetadataLedgerEntry>,
  localPolicy: LanSyncPolicy = defaultLocalPolicy(),
  remotePolicy: LanSyncPolicy = passivePeerPolicy()
): LanSyncMetadataReconcileAction[] {
  const local = new Map(localEntries.map((entry) => [entry.path, entry]));
  const remote = new Map(remoteEntries.map((entry) => [entry.path, entry]));
  const paths = [...new Set([...local.keys(), ...remote.keys()])].sort((left, right) => left.localeCompare(right));
  const actions: LanSyncMetadataReconcileAction[] = [];
  const canPush = localPolicy.incrementalPush || remotePolicy.incrementalPull;
  const canPull = localPolicy.incrementalPull || remotePolicy.incrementalPush;
  const canDeleteRemote = remotePolicy.deleteProtocol && (localPolicy.deletePush || remotePolicy.deletePull);
  const canDeleteLocal = localPolicy.deletePull || remotePolicy.deletePush;
  for (const path of paths) {
    const localEntry = local.get(path) ?? null;
    const remoteEntry = remote.get(path) ?? null;
    const baseline = ledger[path];
    if (localEntry && remoteEntry) {
      if (metadataMatches(localEntry, remoteEntry)) continue;
      const localChanged = !baseline || !metadataMatches(localEntry, baseline.local);
      const remoteChanged = !baseline || !metadataMatches(remoteEntry, baseline.remote);
      if (!localChanged && !remoteChanged) continue;
      if (!localChanged && remoteChanged) {
        if (canPull) actions.push({ kind: "pull", path, local: localEntry, remote: remoteEntry });
      } else if (localChanged && !remoteChanged) {
        if (canPush) actions.push({ kind: "push", path, local: localEntry, remote: remoteEntry });
      } else if (canPush && canPull) {
        actions.push({ kind: metadataWinner(localEntry, remoteEntry, localPolicy.conflictRule) === "local" ? "push" : "pull", path, local: localEntry, remote: remoteEntry });
      } else if (canPush) {
        actions.push({ kind: "push", path, local: localEntry, remote: remoteEntry });
      } else if (canPull) {
        actions.push({ kind: "pull", path, local: localEntry, remote: remoteEntry });
      }
      continue;
    }
    if (baseline) {
      if (localEntry) {
        const localChanged = !metadataMatches(localEntry, baseline.local);
        if (localChanged && canPush) actions.push({ kind: "push", path, local: localEntry, remote: null });
        else if (!localChanged && canDeleteLocal) actions.push({ kind: "delete-local", path, local: localEntry, remote: null });
      } else if (remoteEntry) {
        const remoteChanged = !metadataMatches(remoteEntry, baseline.remote);
        if (remoteChanged && canPull) actions.push({ kind: "pull", path, local: null, remote: remoteEntry });
        else if (!remoteChanged && canDeleteRemote) actions.push({ kind: "delete-remote", path, local: null, remote: remoteEntry });
      }
      continue;
    }
    if (localEntry && canPush) actions.push({ kind: "push", path, local: localEntry, remote: null });
    else if (remoteEntry && canPull) actions.push({ kind: "pull", path, local: null, remote: remoteEntry });
  }
  return actions;
}

export class LanStatusBarTakeover {
  private snapshot: {
    element: HTMLElement;
    style: string | null;
    hidden: boolean;
    ariaHidden: string | null;
  } | null = null;

  activeElement(): HTMLElement | null {
    return this.snapshot?.element ?? null;
  }

  takeOver(element: HTMLElement): void {
    if (this.snapshot?.element === element) {
      element.hidden = true;
      element.style.display = "none";
      element.setAttribute("aria-hidden", "true");
      return;
    }
    this.restore();
    this.snapshot = {
      element,
      style: element.getAttribute("style"),
      hidden: element.hidden,
      ariaHidden: element.getAttribute("aria-hidden")
    };
    element.hidden = true;
    element.style.display = "none";
    element.setAttribute("aria-hidden", "true");
  }

  restore(): void {
    const snapshot = this.snapshot;
    this.snapshot = null;
    if (!snapshot) return;
    if (snapshot.style === null) snapshot.element.removeAttribute("style");
    else snapshot.element.setAttribute("style", snapshot.style);
    snapshot.element.hidden = snapshot.hidden;
    if (snapshot.ariaHidden === null) snapshot.element.removeAttribute("aria-hidden");
    else snapshot.element.setAttribute("aria-hidden", snapshot.ariaHidden);
  }
}

function defaultProgress(phase: LanSyncProgressPhase = "stopped"): LanSyncProgress {
  const stage: LanSyncProgressStage = phase === "discovering"
    ? "discovering"
    : phase === "connected"
      ? "waiting-peer-scan"
      : phase === "scanning"
        ? "enumerating"
        : phase === "syncing"
          ? "transferring"
          : phase === "complete"
            ? "complete"
            : phase === "error"
              ? "error"
              : "stopped";
  return {
    phase,
    stage,
    active: false,
    peerId: "",
    peerCount: 0,
    completed: 0,
    total: 0,
    bytesTransferred: 0,
    bytesTotal: 0,
    changed: 0,
    conflicts: 0,
    uploads: 0,
    uploadCompleted: 0,
    downloads: 0,
    downloadCompleted: 0,
    error: ""
  };
}

export function lanSyncTopLevelGroup(path: string): string {
  const normalized = String(path || "").replace(/\\/g, "/").replace(/^\/+/, "");
  const separator = normalized.indexOf("/");
  return separator < 0 ? "" : normalized.slice(0, separator);
}

function adaptiveTransferConcurrency(actions: Array<{ size: number }>): number {
  const largest = actions.reduce((maximum, action) => Math.max(maximum, Math.max(0, Number(action.size) || 0)), 0);
  if (largest <= SMALL_TRANSFER_BYTES) return Math.min(SMALL_TRANSFER_CONCURRENCY, Math.max(1, actions.length));
  if (largest <= MEDIUM_TRANSFER_BYTES) return Math.min(MEDIUM_TRANSFER_CONCURRENCY, Math.max(1, actions.length));
  return Math.min(LARGE_TRANSFER_CONCURRENCY, Math.max(1, actions.length));
}

function emptyActivityGroup(key: string): LanSyncActivityGroup {
  return {
    key,
    total: 0,
    completed: 0,
    active: 0,
    errors: 0,
    bytesTotal: 0,
    bytesTransferred: 0,
    uploads: 0,
    uploadCompleted: 0,
    downloads: 0,
    downloadCompleted: 0
  };
}

function sortedActivityGroups(groups: Map<string, LanSyncActivityGroup>): LanSyncActivityGroup[] {
  return [...groups.values()].sort((left, right) => {
    if (!left.key) return -1;
    if (!right.key) return 1;
    return left.key.localeCompare(right.key);
  });
}

function summarizeTransferGroups(files: LanSyncFileActivity[]): LanSyncActivityGroup[] {
  const groups = new Map<string, LanSyncActivityGroup>();
  for (const file of files) {
    const key = lanSyncTopLevelGroup(file.path);
    const group = groups.get(key) ?? emptyActivityGroup(key);
    groups.set(key, group);
    group.total += 1;
    group.bytesTotal += file.size;
    if (file.state === "complete") {
      group.completed += 1;
      group.bytesTransferred += file.size;
    } else if (file.state === "deferred") {
      group.completed += 1;
      group.errors += 1;
    } else if (file.state === "syncing") group.active += 1;
    else if (file.state === "error") group.errors += 1;
    if (file.action === "push") {
      group.uploads += 1;
      if (file.state === "complete") group.uploadCompleted += 1;
    } else if (file.action === "pull") {
      group.downloads += 1;
      if (file.state === "complete") group.downloadCompleted += 1;
    }
  }
  return sortedActivityGroups(groups);
}

function summarizeScanGroups(files: LanSyncScanFileActivity[]): LanSyncActivityGroup[] {
  const groups = new Map<string, LanSyncActivityGroup>();
  for (const file of files) {
    const key = lanSyncTopLevelGroup(file.path);
    const group = groups.get(key) ?? emptyActivityGroup(key);
    groups.set(key, group);
    group.total += 1;
    group.bytesTotal += file.size;
    if (file.state === "cached" || file.state === "complete" || file.state === "skipped") {
      group.completed += 1;
      group.bytesTransferred += file.size;
    } else if (file.state === "hashing") group.active += 1;
    else if (file.state === "error") group.errors += 1;
  }
  return sortedActivityGroups(groups);
}

function identityFromRaw(value: unknown): LanSyncIdentity | null {
  if (!isRecord(value) || value.schemaVersion !== 1) return null;
  if (typeof value.vaultId !== "string" || !/^[A-Za-z0-9_-]{16,64}$/.test(value.vaultId)) return null;
  if (typeof value.secret !== "string" || !/^[A-Za-z0-9_-]{32,128}$/.test(value.secret)) return null;
  return {
    schemaVersion: 1,
    vaultId: value.vaultId,
    secret: value.secret,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : new Date(0).toISOString()
  };
}

function descriptorFromRaw(value: unknown): LanSyncPeerDescriptor | null {
  if (!isRecord(value) || value.schemaVersion !== 1 || value.protocolVersion !== 1) return null;
  if (typeof value.vaultId !== "string" || !/^[A-Za-z0-9_-]{16,64}$/.test(value.vaultId)) return null;
  if (typeof value.deviceId !== "string" || !/^[A-Za-z0-9_-]{16,64}$/.test(value.deviceId)) return null;
  const port = normalizedPort(value.port, 0);
  if (!port) return null;
  const addresses = Array.isArray(value.addresses)
    ? [...new Set(value.addresses.filter((item): item is string => typeof item === "string" && isPrivateLanAddress(item)))]
    : [];
  if (!addresses.length) return null;
  return {
    schemaVersion: 1,
    protocolVersion: 1,
    vaultId: value.vaultId,
    deviceId: value.deviceId,
    port,
    addresses,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : ""
  };
}

function readBody(request: IncomingMessage, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let size = 0;
    request.on("data", (chunk: Buffer | string) => {
      const bytes = typeof chunk === "string" ? Buffer.from(chunk) : new Uint8Array(chunk);
      size += bytes.byteLength;
      if (size > maxBytes) {
        reject(new LanSyncProtocolError("request_too_large", 413));
        request.destroy();
        return;
      }
      chunks.push(bytes);
    });
    request.on("end", () => {
      const merged = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.byteLength;
      }
      resolve(new TextDecoder().decode(merged));
    });
    request.on("error", reject);
  });
}

function sendText(response: ServerResponse, status: number, text: string, contentType = "application/json; charset=utf-8"): void {
  const body = utf8(text);
  response.statusCode = status;
  response.setHeader("Content-Type", contentType);
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Content-Length", String(body.byteLength));
  response.end(Buffer.from(body));
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), Math.max(100, timeoutMs));
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// Wire identifiers intentionally remain compatible with the previous Cancip
// implementation so devices can be upgraded one at a time without downtime.
export class NtfyLanSync {
  private identity: LanSyncIdentity | null = null;
  private deviceId = "";
  private server: Server | null = null;
  private socket: Socket | null = null;
  private boundPort = 0;
  private runningValue = false;
  private peers = new Map<string, LanSyncPeer>();
  private replayCache = new Map<string, number>();
  private rateByClient = new Map<string, { startedAt: number; count: number }>();
  private hashCache = new Map<string, { signature: string; hash: string }>();
  private hashCacheLoaded = false;
  private hashSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private manifestBuild: { includeConfigFolder: boolean; promise: Promise<LanSyncManifestEntry[]> } | null = null;
  private metadataManifestBuild: { includeConfigFolder: boolean; promise: Promise<LanSyncMetadataEntry[]> } | null = null;
  private intervals: Array<ReturnType<typeof setInterval>> = [];
  private syncTimer: ReturnType<typeof setTimeout> | null = null;
  private syncRunning = false;
  private syncQueued = false;
  private syncForced = false;
  private syncRequestId = "";
  private fullSyncRequestId = "";
  private fullSyncRequested = true;
  private lastFullScanAt = 0;
  private dirtySequence = 0;
  private dirtyPaths = new Map<string, number>();
  private inboundSession: LanSyncInboundSession | null = null;
  private pendingMessages = new Map<string, LanSyncIncomingMessage[]>();
  private receivedMessageIds = new Set<string>();
  private lastTransferAt = 0;
  private progressValue = defaultProgress();
  private activityFiles: LanSyncFileActivity[] = [];
  private scanValue: LanSyncScanActivity = this.emptyScanActivity();
  private activityUpdatedAt = 0;
  private lastErrorValue = "";
  private lastPeerFingerprint = "";

  constructor(private readonly options: LanSyncServiceOptions) {}

  running(): boolean {
    return this.runningValue;
  }

  port(): number {
    return this.boundPort;
  }

  progress(): LanSyncProgress {
    return { ...this.progressValue };
  }

  scanProgress(): Omit<LanSyncScanActivity, "files"> {
    const { files: _files, ...scan } = this.scanValue;
    return { ...scan };
  }

  activity(options: {
    includeScanFiles?: boolean;
    includeTransferFiles?: boolean;
    scanGroups?: string[];
    transferGroups?: string[];
  } = {}): LanSyncActivitySnapshot {
    const includeScanFiles = options.includeScanFiles !== false;
    const includeTransferFiles = options.includeTransferFiles !== false;
    const scanGroups = Array.isArray(options.scanGroups) ? new Set(options.scanGroups.map(String)) : null;
    const transferGroups = Array.isArray(options.transferGroups) ? new Set(options.transferGroups.map(String)) : null;
    const scanFiles = scanGroups
      ? this.scanValue.files.filter((file) => scanGroups.has(lanSyncTopLevelGroup(file.path)))
      : this.scanValue.files;
    const transferFiles = transferGroups
      ? this.activityFiles.filter((file) => transferGroups.has(lanSyncTopLevelGroup(file.path)))
      : this.activityFiles;
    return {
      progress: { ...this.progressValue },
      files: includeTransferFiles ? transferFiles.map((file) => ({ ...file })) : [],
      scan: {
        ...this.scanValue,
        files: includeScanFiles ? scanFiles.map((file) => ({ ...file })) : []
      },
      transferGroups: summarizeTransferGroups(this.activityFiles),
      scanGroups: summarizeScanGroups(this.scanValue.files)
    };
  }

  listPeers(): LanSyncPeerInfo[] {
    const now = this.now();
    const localInterfaces = this.localInterfaces();
    return [...this.peers.values()]
      .filter((peer) => peer.verifiedAt > 0)
      .map((peer) => {
        const address = [...peer.addresses][0] ?? "";
        const detectedLink = this.linkTypeForAddress(address, localInterfaces);
        return {
          deviceId: peer.deviceId,
          address,
          port: peer.port,
          linkType: peer.manual && detectedLink === "lan" ? "manual" : detectedLink,
          verified: this.isPeerActive(peer, now),
          lastSeenAt: Math.max(peer.lastSeenAt, peer.verifiedAt),
          canHost: peer.canHost,
          compatible: peer.capabilities.has(METADATA_LEDGER_CAPABILITY)
        };
      })
      .filter((peer) => peer.verified)
      .sort((left, right) => left.deviceId.localeCompare(right.deviceId));
  }

  async sendMessage(deviceId: string, input: { id?: string; text?: string; attachments?: LanSyncAttachment[] }): Promise<{ id: string }> {
    const peer = this.activePeers().find((candidate) => candidate.deviceId === deviceId);
    if (!peer) throw new Error("peer_unavailable");
    const message = this.normalizeMessagePayload(input, this.deviceId);
    if (!peer.canHost) {
      for (const attachment of message.attachments) {
        const sourcePath = this.outboundAttachmentPath(deviceId, attachment.path);
        const stat = sourcePath ? await this.options.storage.statFile(sourcePath) : null;
        if (!sourcePath || !stat || stat.size !== attachment.size) throw new LanSyncProtocolError("message_attachment_unavailable", 409);
      }
      const queue = this.pendingMessages.get(deviceId) ?? [];
      const next = [...queue.filter((item) => item.id !== message.id), message].slice(-MAX_QUEUED_MESSAGES_PER_PEER);
      this.pendingMessages.set(deviceId, next);
      this.savePendingMessages();
      this.syncRequestId = randomId(18);
      return { id: message.id };
    }
    const response = await this.callPeer(peer, "/message/send", message);
    if (response.ok !== true || response.id !== message.id) throw new Error("message_delivery_failed");
    return { id: message.id };
  }

  async sendFile(deviceId: string, path: string): Promise<LanSyncAttachment> {
    const normalized = this.normalizePath(path);
    if (!normalized) throw new LanSyncProtocolError("unsafe_path");
    const stat = await this.options.storage.statFile(normalized);
    if (!stat || stat.size > this.settings().maxFileBytes) throw new LanSyncProtocolError("file_unavailable", 404);
    return await this.sendDeviceFile(deviceId, {
      name: normalized.split("/").pop() || "attachment.bin",
      type: "application/octet-stream",
      data: await this.options.storage.readBinary(normalized)
    });
  }

  async sendDeviceFile(deviceId: string, input: { name: string; type?: string; data: ArrayBuffer }): Promise<LanSyncAttachment> {
    const peer = this.activePeers().find((candidate) => candidate.deviceId === deviceId);
    if (!peer) throw new Error("peer_unavailable");
    const bytes = new Uint8Array(input.data);
    if (bytes.byteLength > this.settings().maxFileBytes) throw new LanSyncProtocolError("file_unavailable", 413);
    const name = safeLanInboxName(input.name);
    const type = String(input.type || "application/octet-stream").slice(0, 128);
    const hash = await sha256Bytes(bytes);
    const attachmentId = randomId(18);
    if (!peer.canHost) {
      const path = normalizeLanInboxAttachmentPath(`${LAN_INBOX_ROOT}/${attachmentId}/${name}`);
      const sourcePath = path ? this.outboundAttachmentPath(deviceId, path) : null;
      if (!path || !sourcePath) throw new LanSyncProtocolError("unsafe_attachment");
      await this.options.storage.ensureFolder(sourcePath.split("/").slice(0, -1).join("/"));
      await this.options.storage.writeBinary(sourcePath, arrayBuffer(bytes));
      const written = await this.options.storage.statFile(sourcePath);
      if (!written || written.size !== bytes.byteLength) throw new Error("write_verification_failed");
      return {
        name,
        type,
        path,
        size: bytes.byteLength,
        hash,
        temporary: true,
        expiresAt: new Date(this.now() + this.settings().inboxRetentionHours * 60 * 60_000).toISOString()
      };
    }
    this.activityFiles = [{ path: `${LAN_INBOX_ROOT}/${attachmentId}/${name}`, action: "push", state: "syncing", size: bytes.byteLength }];
    this.activityUpdatedAt = this.now();
    this.emit({
      ...defaultProgress("syncing"),
      active: true,
      peerId: peer.deviceId,
      total: 1,
      bytesTotal: bytes.byteLength,
      uploads: 1,
      uploadCompleted: 0
    });
    try {
      const response = await this.callPeer(peer, "/attachment/write", {
        attachmentId,
        name,
        type,
        hash,
        data: bytesToBase64Url(bytes)
      }, fileTransferTimeoutMs(bytes.byteLength));
      const attachment = this.parseAttachment(response);
      this.activityFiles[0].path = attachment.path;
      this.activityFiles[0].state = "complete";
      this.emit({
        ...defaultProgress("complete"),
        active: true,
        peerId: peer.deviceId,
        completed: 1,
        total: 1,
        bytesTransferred: bytes.byteLength,
        bytesTotal: bytes.byteLength,
        changed: 1,
        uploads: 1,
        uploadCompleted: 1
      });
      return attachment;
    } catch (error) {
      this.activityFiles[0].state = "error";
      this.emit({
        ...defaultProgress("error"),
        active: true,
        peerId: peer.deviceId,
        total: 1,
        bytesTotal: bytes.byteLength,
        uploads: 1,
        uploadCompleted: 0,
        error: safeErrorCode(error)
      });
      throw error;
    }
  }

  status(): { running: boolean; port: number; peerCount: number; error: string; desktop: boolean } {
    return {
      running: this.runningValue,
      port: this.boundPort,
      peerCount: this.activePeers().length,
      error: this.lastErrorValue,
      desktop: this.options.desktop
    };
  }

  async start(): Promise<void> {
    if (this.runningValue) return;
    const settings = this.settings();
    if (!settings.enabled) {
      this.emit(defaultProgress("stopped"));
      return;
    }
    this.identity = await this.loadOrCreateIdentity();
    this.deviceId = this.loadOrCreateDeviceId();
    this.lastFullScanAt = this.loadLastFullScanAt();
    if (this.lastFullScanAt > 0 && this.now() - this.lastFullScanAt < this.fullRescanIntervalMs()) {
      this.fullSyncRequested = false;
    }
    if (!this.fullSyncRequestId) {
      this.fullSyncRequestId = randomId(18);
      this.syncRequestId = this.fullSyncRequestId;
    }
    if (!this.syncRequestId) this.syncRequestId = randomId(18);
    this.loadPendingMessages();
    this.loadHashCache();
    this.runningValue = true;
    this.lastErrorValue = "";
    try {
      if (this.options.desktop) {
        await this.startServer();
        await this.publishPeerDescriptor();
        if (settings.autoDiscovery) {
          try {
            await this.startDiscoverySocket();
          } catch {
            this.socket = null;
          }
        }
      }
      await this.loadRememberedPeers();
      this.refreshManualPeers();
      this.intervals.push(setInterval(() => this.announce(), ANNOUNCE_INTERVAL_MS));
      this.intervals.push(setInterval(() => void this.probePeers(), PEER_PROBE_INTERVAL_MS));
      this.intervals.push(setInterval(() => {
        if (this.settings().autoDiscovery) this.requestPeriodicSync();
      }, settings.checkIntervalSeconds * 1000));
      this.intervals.push(setInterval(() => this.sweepPeers(), PEER_SWEEP_INTERVAL_MS));
      this.announce();
      this.emit({ ...defaultProgress("discovering"), active: false });
      void this.probePeers();
    } catch (error) {
      this.lastErrorValue = safeErrorCode(error);
      await this.stop();
      this.emit({ ...defaultProgress("error"), error: this.lastErrorValue });
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.runningValue = false;
    this.syncQueued = false;
    this.syncForced = false;
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }
    for (const interval of this.intervals) clearInterval(interval);
    this.intervals = [];
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      try {
        socket.close();
      } catch {
        // Already closed.
      }
    }
    const server = this.server;
    this.server = null;
    this.boundPort = 0;
    if (server) {
      server.closeIdleConnections?.();
      await Promise.race([
        new Promise<void>((resolve) => server.close(() => resolve())),
        new Promise<void>((resolve) => setTimeout(() => {
          server.closeAllConnections?.();
          resolve();
        }, 250))
      ]);
    }
    if (this.hashSaveTimer) {
      clearTimeout(this.hashSaveTimer);
      this.hashSaveTimer = null;
      this.saveHashCache();
    }
    this.peers.clear();
    this.emitPeersChanged();
    this.replayCache.clear();
    this.rateByClient.clear();
    this.inboundSession = null;
    this.activityFiles = [];
    this.scanValue = this.emptyScanActivity();
    this.activityUpdatedAt = this.now();
    this.emit(defaultProgress("stopped"));
  }

  notifyVaultChange(path: string): void {
    this.markDirtyPath(path, 30);
  }

  private markDirtyPath(path: string, delay = QUEUED_SYNC_DELAY_MS): void {
    const normalized = this.normalizePath(path);
    if (!normalized) return;
    this.hashCache.delete(normalized);
    this.queueHashCacheSave();
    this.dirtySequence += 1;
    this.dirtyPaths.set(normalized, this.dirtySequence);
    if (this.dirtyPaths.size > MAX_DIRTY_PATHS) {
      this.fullSyncRequested = true;
      this.fullSyncRequestId = randomId(18);
      const newest = [...this.dirtyPaths.entries()].slice(-MAX_DIRTY_PATHS);
      this.dirtyPaths = new Map(newest);
    }
    this.syncRequestId = randomId(18);
    this.scheduleSync(delay, true);
  }

  requestSync(): void {
    // Either device may initiate. A non-listening peer receives the request
    // through the authenticated heartbeat and joins the same forced session.
    if (!this.fullSyncRequested) {
      this.fullSyncRequested = true;
      this.fullSyncRequestId = randomId(18);
    }
    this.syncRequestId = randomId(18);
    const passivePeer = this.activePeers().find((peer) => !peer.canHost);
    if (passivePeer && this.progressValue.phase !== "scanning" && this.progressValue.phase !== "syncing") {
      this.emit({
        ...defaultProgress("connected"),
        stage: "requesting-peer-scan",
        active: true,
        peerId: passivePeer.deviceId
      });
    }
    this.scheduleSync(0, true);
  }

  private requestPeriodicSync(): void {
    if (!this.runningValue || this.syncRunning || this.inboundSession || this.metadataManifestBuild || this.manifestBuild) return;
    if (this.progressValue.phase === "scanning" || this.progressValue.phase === "syncing" || this.scanValue.phase === "scanning") return;
    const peers = this.activePeers();
    if (!peers.length) return;
    if (this.dirtyPaths.size || peers.some((peer) => (peer.remoteDirtyPaths?.size ?? 0) > 0)) {
      this.scheduleSync(0, false);
      return;
    }
    if (this.fullSyncRequested || this.now() - this.lastFullScanAt < this.fullRescanIntervalMs()) return;
    if (!this.isPeriodicInitiator(peers)) return;
    this.fullSyncRequested = true;
    this.fullSyncRequestId = randomId(18);
    this.syncRequestId = this.fullSyncRequestId;
    const passivePeer = peers.find((peer) => !peer.canHost);
    if (passivePeer && this.progressValue.phase !== "scanning" && this.progressValue.phase !== "syncing") {
      this.emit({
        ...defaultProgress("connected"),
        stage: "requesting-peer-scan",
        active: true,
        peerId: passivePeer.deviceId
      });
    }
    this.scheduleSync(0, false);
  }

  private fullRescanIntervalMs(): number {
    return Math.min(
      MAX_FULL_RESCAN_INTERVAL_MS,
      Math.max(MIN_FULL_RESCAN_INTERVAL_MS, this.settings().checkIntervalSeconds * 10_000)
    );
  }

  private lastFullScanStorageKey(): string {
    return `ntfy.lan-sync.last-full-scan.v1.${this.identity?.vaultId ?? "unknown"}`;
  }

  private loadLastFullScanAt(): number {
    const parsed = Number(this.localStore()?.getItem(this.lastFullScanStorageKey()) ?? 0);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  private recordFullScan(): void {
    this.lastFullScanAt = this.now();
    try {
      this.localStore()?.setItem(this.lastFullScanStorageKey(), String(this.lastFullScanAt));
    } catch {
      // The next launch may conservatively run a full scan again.
    }
  }

  private isPeriodicInitiator(peers = this.activePeers()): boolean {
    if (!peers.length) return false;
    const participants = [...new Set([this.deviceId, ...peers.map((peer) => peer.deviceId)])]
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right));
    if (!participants.length) return false;
    const intervalMs = Math.max(1_000, this.settings().checkIntervalSeconds * 1000);
    const slot = Math.floor(this.now() / intervalMs) % participants.length;
    return participants[slot] === this.deviceId;
  }

  private settings(): LanSyncRuntimeSettings {
    const raw = this.options.getSettings();
    return {
      enabled: raw.enabled === true,
      autoDiscovery: raw.autoDiscovery === true,
      checkIntervalSeconds: normalizedCheckIntervalSeconds(raw.checkIntervalSeconds),
      mode: normalizedMode(raw.mode),
      conflictRule: normalizedConflictRule(raw.conflictRule),
      syncConfigFolder: raw.syncConfigFolder === true,
      configDir: normalizedConfigDir(raw.configDir),
      port: normalizedPort(raw.port),
      maxFileBytes: normalizedMaxFileBytes(raw.maxFileBytes),
      inboxRetentionHours: normalizedInboxRetentionHours(raw.inboxRetentionHours),
      manualPeers: Array.isArray(raw.manualPeers) ? raw.manualPeers.map(String).slice(0, 32) : []
    };
  }

  private policy(): LanSyncPolicy {
    const settings = this.settings();
    return {
      incrementalPush: settings.mode === "bidirectional" || settings.mode === "incremental-push" || settings.mode === "delete-push",
      incrementalPull: settings.mode === "bidirectional" || settings.mode === "incremental-pull" || settings.mode === "delete-pull",
      deletePush: settings.mode === "delete-push",
      deletePull: settings.mode === "delete-pull",
      syncConfigFolder: settings.syncConfigFolder,
      deleteProtocol: true,
      conflictRule: settings.conflictRule
    };
  }

  private pathOptions(syncConfigFolder = this.settings().syncConfigFolder): LanSyncPathOptions {
    return {
      syncConfigFolder,
      configDir: this.settings().configDir,
      identityRoot: this.options.storage.identityRoot
    };
  }

  private normalizePath(value: unknown, syncConfigFolder = this.settings().syncConfigFolder): string | null {
    return normalizeLanSyncPath(value, this.pathOptions(syncConfigFolder));
  }

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }

  private emptyScanActivity(): LanSyncScanActivity {
    return {
      id: "",
      phase: "idle",
      completed: 0,
      total: 0,
      cached: 0,
      hashed: 0,
      skipped: 0,
      error: "",
      files: []
    };
  }

  private hashCacheKey(): string {
    return `${HASH_CACHE_STORAGE_PREFIX}.${this.identity?.vaultId ?? "unknown"}`;
  }

  private loadHashCache(): void {
    if (this.hashCacheLoaded) return;
    this.hashCacheLoaded = true;
    try {
      const raw = this.localStore()?.getItem(this.hashCacheKey());
      if (!raw) return;
      const parsed = safeJsonObject(raw);
      if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.entries)) return;
      for (const item of parsed.entries.slice(-MAX_MANIFEST_FILES)) {
        if (!Array.isArray(item) || item.length !== 3) continue;
        const path = this.normalizePath(item[0], true);
        const signature = typeof item[1] === "string" ? item[1] : "";
        const hash = typeof item[2] === "string" ? item[2] : "";
        if (path && /^\d+(?:\.\d+)?:\d+$/.test(signature) && /^[A-Za-z0-9_-]{32,64}$/.test(hash)) {
          this.hashCache.set(path, { signature, hash });
        }
      }
    } catch {
      this.hashCache.clear();
    }
  }

  private queueHashCacheSave(): void {
    if (this.hashSaveTimer) clearTimeout(this.hashSaveTimer);
    this.hashSaveTimer = setTimeout(() => {
      this.hashSaveTimer = null;
      this.saveHashCache();
    }, 250);
  }

  private saveHashCache(): void {
    try {
      const entries = [...this.hashCache.entries()].slice(-MAX_MANIFEST_FILES).map(([path, value]) => [path, value.signature, value.hash]);
      this.localStore()?.setItem(this.hashCacheKey(), JSON.stringify({ schemaVersion: 1, entries }));
    } catch {
      // A memory-only cache is slower after reload but does not affect correctness.
    }
  }

  private parseAttachment(value: unknown): LanSyncAttachment {
    if (!isRecord(value)) throw new LanSyncProtocolError("invalid_message_attachment");
    const path = normalizeLanInboxAttachmentPath(value.path);
    const name = safeLanInboxName(value.name);
    const type = typeof value.type === "string" ? value.type.slice(0, 128) : "application/octet-stream";
    const size = Number(value.size);
    const hash = typeof value.hash === "string" ? value.hash : "";
    const expiresAtDate = new Date(typeof value.expiresAt === "string" ? value.expiresAt : 0);
    if (!path || path.split("/").pop() !== name || !Number.isFinite(size) || size < 0 || size > this.settings().maxFileBytes || !/^[A-Za-z0-9_-]{32,64}$/.test(hash) || !Number.isFinite(expiresAtDate.getTime())) {
      throw new LanSyncProtocolError("invalid_message_attachment");
    }
    return { name, type, path, size, hash, temporary: true, expiresAt: expiresAtDate.toISOString() };
  }

  private localStore(): Pick<Storage, "getItem" | "setItem" | "removeItem"> | null {
    if (this.options.localStore !== undefined) return this.options.localStore;
    try {
      return globalThis.localStorage;
    } catch {
      return null;
    }
  }

  private outboundMessageStorageKey(): string {
    return `${OUTBOUND_MESSAGE_STORAGE_PREFIX}.${this.identity?.vaultId ?? "unknown"}`;
  }

  private loadPendingMessages(): void {
    this.pendingMessages.clear();
    try {
      const raw = this.localStore()?.getItem(this.outboundMessageStorageKey());
      if (!raw) return;
      const parsed = safeJsonObject(raw);
      if (parsed.schemaVersion !== 1 || !isRecord(parsed.peers)) return;
      for (const [deviceId, value] of Object.entries(parsed.peers)) {
        if (!/^[A-Za-z0-9_-]{16,64}$/.test(deviceId) || !Array.isArray(value)) continue;
        const messages: LanSyncIncomingMessage[] = [];
        for (const item of value.slice(-MAX_QUEUED_MESSAGES_PER_PEER)) {
          try {
            messages.push(this.normalizeMessagePayload(item, this.deviceId));
          } catch {
            // Ignore only the malformed queued item.
          }
        }
        if (messages.length) this.pendingMessages.set(deviceId, messages);
      }
    } catch {
      this.pendingMessages.clear();
    }
  }

  private savePendingMessages(): void {
    try {
      const peers = Object.fromEntries(
        [...this.pendingMessages.entries()]
          .filter(([, messages]) => messages.length)
          .map(([deviceId, messages]) => [deviceId, messages.slice(-MAX_QUEUED_MESSAGES_PER_PEER)])
      );
      this.localStore()?.setItem(this.outboundMessageStorageKey(), JSON.stringify({ schemaVersion: 1, peers }));
    } catch {
      // Keep the current process queue available even if storage is full.
    }
  }

  private outboundAttachmentPath(deviceId: string, attachmentPath: string): string | null {
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(deviceId)) return null;
    const remotePath = normalizeLanInboxAttachmentPath(attachmentPath);
    if (!remotePath) return null;
    const relative = remotePath.slice(`${LAN_INBOX_ROOT}/`.length);
    return `${this.options.storage.identityRoot.replace(/\/+$/, "")}/outbox/${deviceId}/${relative}`;
  }

  private pendingMessagesFor(deviceId: string): LanSyncIncomingMessage[] {
    return (this.pendingMessages.get(deviceId) ?? []).slice(0, MAX_PING_MESSAGES).map((message) => ({
      ...message,
      attachments: message.attachments.map((attachment) => ({ ...attachment }))
    }));
  }

  private emit(progress: LanSyncProgress): void {
    this.progressValue = { ...progress, peerCount: this.activePeers().length };
    try {
      this.options.onProgress({ ...this.progressValue });
    } catch {
      // UI reporting must never interrupt synchronization.
    }
  }

  private async loadOrCreateIdentity(): Promise<LanSyncIdentity> {
    const root = this.options.storage.identityRoot.replace(/\/+$/, "");
    const path = `${root}/identity.json`;
    await this.options.storage.ensureFolder(root);
    if (await this.options.storage.exists(path)) {
      const identity = identityFromRaw(safeJsonObject(await this.options.storage.readText(path)));
      if (!identity) throw new Error("invalid_lan_identity");
      return identity;
    }
    const identity: LanSyncIdentity = {
      schemaVersion: 1,
      vaultId: randomId(18),
      secret: randomId(32),
      createdAt: new Date(this.now()).toISOString()
    };
    await this.options.storage.writeText(path, `${JSON.stringify(identity, null, 2)}\n`);
    const verified = identityFromRaw(safeJsonObject(await this.options.storage.readText(path)));
    if (!verified) throw new Error("lan_identity_write_failed");
    return verified;
  }

  private async refreshIdentityIfChanged(): Promise<void> {
    if (!this.identity) return;
    const path = `${this.options.storage.identityRoot.replace(/\/+$/, "")}/identity.json`;
    try {
      const next = identityFromRaw(safeJsonObject(await this.options.storage.readText(path)));
      if (!next || (next.vaultId === this.identity.vaultId && next.secret === this.identity.secret)) return;
      this.identity = next;
      this.peers.clear();
      this.replayCache.clear();
      this.rateByClient.clear();
      if (this.options.desktop) await this.publishPeerDescriptor();
      await this.loadRememberedPeers();
      this.announce();
      this.emit({ ...defaultProgress("discovering"), active: false });
    } catch {
      // Keep the last valid identity until the synchronized file is complete.
    }
  }

  private loadOrCreateDeviceId(): string {
    const store = this.localStore();
    const current = store?.getItem(DEVICE_ID_STORAGE_KEY) ?? "";
    if (/^[A-Za-z0-9_-]{16,64}$/.test(current)) return current;
    const next = randomId(18);
    try {
      store?.setItem(DEVICE_ID_STORAGE_KEY, next);
    } catch {
      // The current process still keeps a stable ID until reload.
    }
    return next;
  }

  private localInterfaces(): LanNetworkInterface[] {
    const os = nodeRequire<NodeOs>("node:os") ?? nodeRequire<NodeOs>("os");
    if (!os) return [];
    const interfaces: LanNetworkInterface[] = [];
    for (const [name, rows] of Object.entries(os.networkInterfaces())) {
      for (const row of rows ?? []) {
        if (row.family !== "IPv4" || row.internal || !isPrivateLanAddress(row.address) || row.address === "127.0.0.1") continue;
        interfaces.push({
          name,
          address: row.address,
          netmask: row.netmask,
          broadcast: ipv4BroadcastAddress(row.address, row.netmask) ?? "255.255.255.255",
          linkType: classifyLanLinkType(name, row.address)
        });
      }
    }
    return interfaces.sort((left, right) => left.address.localeCompare(right.address));
  }

  private localAddresses(): string[] {
    return [...new Set(this.localInterfaces().map((item) => item.address))];
  }

  private linkTypeForAddress(address: string, interfaces = this.localInterfaces()): LanLinkType {
    const addressParts = address.split(".").map(Number);
    for (const item of interfaces) {
      const localParts = item.address.split(".").map(Number);
      const maskParts = item.netmask.split(".").map(Number);
      if (addressParts.length === 4 && maskParts.length === 4 && addressParts.every((part, index) => (part & maskParts[index]) === (localParts[index] & maskParts[index]))) {
        return item.linkType;
      }
    }
    return "lan";
  }

  private refreshManualPeers(): void {
    const configured = new Set<string>();
    for (const value of this.settings().manualPeers) {
      const endpoint = normalizeManualLanPeer(value, this.settings().port);
      if (!endpoint) continue;
      const endpointKey = `${endpoint.address}:${endpoint.port}`;
      configured.add(endpointKey);
      const existing = [...this.peers.values()].find((peer) => peer.manual && peer.port === endpoint.port && peer.addresses.has(endpoint.address));
      if (existing) continue;
      const key = `manual:${endpoint.address}:${endpoint.port}`;
      const peer = this.upsertPeer(key, endpoint.port, [endpoint.address], 0, true, true);
      peer.manual = true;
    }
    for (const [key, peer] of this.peers) {
      if (peer.manual && ![...peer.addresses].some((address) => configured.has(`${address}:${peer.port}`))) this.peers.delete(key);
    }
  }

  private emitPeersChanged(): void {
    const peers = this.listPeers();
    // Heartbeats refresh timestamps frequently; those are liveness details,
    // not contact-list changes that should rebuild an active chat composer.
    const fingerprint = JSON.stringify(peers.map((peer) => ({
      deviceId: peer.deviceId,
      address: peer.address,
      port: peer.port,
      linkType: peer.linkType,
      verified: peer.verified
    })));
    if (fingerprint === this.lastPeerFingerprint) return;
    this.lastPeerFingerprint = fingerprint;
    try {
      this.options.onPeersChanged?.(peers);
    } catch {
      // Peer UI updates must not interrupt discovery.
    }
  }

  private async publishPeerDescriptor(): Promise<void> {
    if (!this.identity || !this.boundPort) return;
    const addresses = this.localAddresses();
    if (!addresses.length) return;
    const folder = `${this.options.storage.identityRoot.replace(/\/+$/, "")}/peers`;
    const path = `${folder}/${this.deviceId}.json`;
    await this.options.storage.ensureFolder(folder);
    let previous: LanSyncPeerDescriptor | null = null;
    if (await this.options.storage.exists(path)) {
      try {
        previous = descriptorFromRaw(safeJsonObject(await this.options.storage.readText(path)));
      } catch {
        previous = null;
      }
    }
    const previousAge = previous?.updatedAt ? this.now() - Date.parse(previous.updatedAt) : Number.POSITIVE_INFINITY;
    if (previous
      && previous.vaultId === this.identity.vaultId
      && previous.port === this.boundPort
      && JSON.stringify(previous.addresses) === JSON.stringify(addresses)
      && previousAge >= 0
      && previousAge < 24 * 60 * 60_000) return;
    const descriptor: LanSyncPeerDescriptor = {
      schemaVersion: 1,
      protocolVersion: 1,
      vaultId: this.identity.vaultId,
      deviceId: this.deviceId,
      port: this.boundPort,
      addresses,
      updatedAt: new Date(this.now()).toISOString()
    };
    await this.options.storage.writeText(path, `${JSON.stringify(descriptor, null, 2)}\n`);
  }

  private async loadRememberedPeers(): Promise<void> {
    if (!this.identity) return;
    const folder = `${this.options.storage.identityRoot.replace(/\/+$/, "")}/peers`;
    if (!await this.options.storage.exists(folder)) return;
    let files: string[] = [];
    try {
      files = await this.options.storage.listDirectory(folder);
    } catch {
      return;
    }
    for (const path of files.slice(0, 100)) {
      if (!path.toLowerCase().endsWith(".json")) continue;
      try {
        const descriptor = descriptorFromRaw(safeJsonObject(await this.options.storage.readText(path)));
        if (!descriptor || descriptor.vaultId !== this.identity.vaultId || descriptor.deviceId === this.deviceId) continue;
        const updatedAt = Date.parse(descriptor.updatedAt);
        if (!Number.isFinite(updatedAt) || this.now() - updatedAt > REMEMBERED_PEER_MAX_AGE_MS) continue;
        this.upsertPeer(descriptor.deviceId, descriptor.port, descriptor.addresses, 0, true, false);
      } catch {
        // Ignore malformed/stale descriptors without changing them.
      }
    }
  }

  private async startServer(): Promise<void> {
    const http = nodeRequire<NodeHttp>("node:http") ?? nodeRequire<NodeHttp>("http");
    if (!http) throw new Error("node_http_unavailable");
    let latestError: unknown = null;
    for (let offset = 0; offset <= 8; offset += 1) {
      const port = this.settings().port + offset;
      try {
        const server = http.createServer((request, response) => void this.handleServerRequest(request, response));
        server.requestTimeout = 10 * 60_000;
        server.headersTimeout = 10_000;
        server.keepAliveTimeout = 5000;
        await new Promise<void>((resolve, reject) => {
          const onError = (error: Error): void => reject(error);
          server.once("error", onError);
          server.listen(port, "0.0.0.0", () => {
            server.off("error", onError);
            resolve();
          });
        });
        this.server = server;
        this.boundPort = port;
        return;
      } catch (error) {
        latestError = error;
      }
    }
    throw new Error(`lan_server_bind_failed:${safeErrorCode(latestError)}`);
  }

  private async startDiscoverySocket(): Promise<void> {
    const dgram = nodeRequire<NodeDgram>("node:dgram") ?? nodeRequire<NodeDgram>("dgram");
    if (!dgram) return;
    const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
    socket.on("message", (message, remote) => this.handleAnnouncement(message, remote));
    socket.on("error", () => {
      if (this.socket === socket) {
        try {
          socket.close();
        } catch {
          // Already closed.
        }
        this.socket = null;
      }
    });
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error): void => reject(error);
      socket.once("error", onError);
      socket.bind(DISCOVERY_PORT, "0.0.0.0", () => {
        socket.off("error", onError);
        try {
          socket.addMembership(MULTICAST_ADDRESS);
          socket.setMulticastTTL(1);
          socket.setBroadcast(true);
        } catch {
          // Limited networks can still use remembered peer descriptors.
        }
        resolve();
      });
    });
    this.socket = socket;
  }

  private announce(): void {
    if (!this.runningValue || !this.socket || !this.identity || !this.boundPort) return;
    const packet = Buffer.from(JSON.stringify({
      protocol: PROTOCOL_NAME,
      version: PROTOCOL_VERSION,
      vaultId: this.identity.vaultId,
      deviceId: this.deviceId,
      port: this.boundPort,
      timestamp: this.now()
    }), "utf8");
    if (packet.byteLength > 1024) return;
    this.socket.send(packet, DISCOVERY_PORT, MULTICAST_ADDRESS, () => undefined);
    this.socket.send(packet, DISCOVERY_PORT, "255.255.255.255", () => undefined);
    for (const broadcast of new Set(this.localInterfaces().map((item) => item.broadcast))) {
      if (broadcast !== "255.255.255.255") this.socket.send(packet, DISCOVERY_PORT, broadcast, () => undefined);
    }
  }

  private handleAnnouncement(message: Buffer, remote: RemoteInfo): void {
    if (!this.identity || message.byteLength > 1024) return;
    try {
      const raw = safeJsonObject(message.toString("utf8"));
      if (raw.protocol !== PROTOCOL_NAME || raw.version !== PROTOCOL_VERSION || raw.vaultId !== this.identity.vaultId) return;
      if (typeof raw.deviceId !== "string" || !/^[A-Za-z0-9_-]{16,64}$/.test(raw.deviceId) || raw.deviceId === this.deviceId) return;
      const port = normalizedPort(raw.port, 0);
      const address = normalizeRemoteAddress(remote.address);
      if (!port || !isPrivateLanAddress(address)) return;
      const peer = this.upsertPeer(raw.deviceId, port, [address], this.now(), true, false);
      void this.verifyPeer(peer);
    } catch {
      // Discovery packets are untrusted and intentionally ignored on failure.
    }
  }

  private upsertPeer(deviceId: string, port: number, addresses: string[], seenAt: number, canHost: boolean, manual = false): LanSyncPeer {
    let peer = this.peers.get(deviceId);
    if (!peer) {
      peer = {
        deviceId,
        port,
        addresses: new Set(),
        canHost,
        lastSeenAt: seenAt,
        verifiedAt: 0,
        lastProbeAt: 0,
        lastSyncAt: 0,
        consecutiveFailures: 0,
        lastFailureAt: 0,
        probing: false,
        manual,
        lastRemoteSyncRequestId: "",
        remoteFullSyncRequestId: "",
        remoteDirtyPaths: new Map(),
        policy: passivePeerPolicy(),
        capabilities: new Set(),
        compatibilityPendingSince: 0
      };
      this.peers.set(deviceId, peer);
    }
    peer.port = normalizedPort(port);
    peer.canHost = peer.canHost || canHost;
    peer.manual = peer.manual || manual;
    peer.lastSeenAt = Math.max(peer.lastSeenAt, seenAt);
    const nextAddresses = addresses
      .map(normalizeRemoteAddress)
      .filter((address) => isPrivateLanAddress(address));
    peer.addresses = new Set([...nextAddresses, ...peer.addresses].slice(0, PEER_MAX_ADDRESS_HISTORY));
    return peer;
  }

  private markInboundPeer(deviceId: string, address: string, route: string): void {
    if (deviceId === this.deviceId) return;
    const peer = this.upsertPeer(
      deviceId,
      this.peers.get(deviceId)?.port ?? this.settings().port,
      isPrivateLanAddress(address) ? [address] : [],
      this.now(),
      this.peers.get(deviceId)?.canHost === true,
      false
    );
    const firstVerifiedConnection = peer.verifiedAt <= 0;
    peer.verifiedAt = this.now();
    peer.consecutiveFailures = 0;
    peer.lastFailureAt = 0;
    if (route.startsWith(`${API_PREFIX}${METADATA_ROUTE_PREFIX}/`)) {
      peer.capabilities.add(METADATA_LEDGER_CAPABILITY);
      peer.compatibilityPendingSince = 0;
      if (this.lastErrorValue === "peer_upgrade_required") this.lastErrorValue = "";
    }
    if (firstVerifiedConnection && route.endsWith("/ping")) this.syncRequestId = randomId(18);
    const transfer = route.includes("/file/") || route.includes("/attachment/");
    if (transfer) this.lastTransferAt = this.now();
    if (!transfer && this.progressValue.phase !== "scanning" && this.progressValue.phase !== "syncing" && this.progressValue.phase !== "complete") {
      this.emit({
        ...defaultProgress("connected"),
        stage: peer.capabilities.has(METADATA_LEDGER_CAPABILITY) ? "waiting-peer-scan" : "checking-peer",
        active: true,
        peerId: deviceId
      });
    }
    this.emitPeersChanged();
  }

  private beginInboundFileActivity(deviceId: string, route: string, payload: Record<string, unknown>): number | null {
    if (!route.includes("/file/") && !route.includes("/attachment/")) return null;
    const attachmentPath = route.endsWith("/attachment/write")
      ? normalizeLanInboxAttachmentPath(`${LAN_INBOX_ROOT}/${String(payload.attachmentId || "")}/${safeLanInboxName(payload.name)}`)
      : null;
    const path = attachmentPath || this.normalizePath(payload.path);
    if (!path) return null;
    const now = this.now();
    const sessionId = typeof payload.sessionId === "string" ? payload.sessionId : "";
    if (sessionId && this.inboundSession?.id === sessionId && this.inboundSession.deviceId === deviceId) {
      const index = this.activityFiles.findIndex((file) => file.path === path && (file.state === "pending" || file.state === "syncing"));
      if (index < 0) return null;
      this.activityFiles[index].state = "syncing";
      this.activityUpdatedAt = now;
      this.emitInboundFileProgress(deviceId);
      return index;
    }
    if (this.progressValue.peerId !== deviceId || now - this.activityUpdatedAt > 1500) this.activityFiles = [];
    const action: LanSyncFileAction = route.endsWith("/read")
      ? "push"
      : route.endsWith("/delete")
        ? "delete-local"
        : "pull";
    const encodedLength = typeof payload.data === "string" ? payload.data.length : 0;
    const index = this.activityFiles.push({
      path,
      action,
      state: "syncing",
      size: encodedLength ? Math.floor(encodedLength * 0.75) : 0
    }) - 1;
    this.activityUpdatedAt = now;
    this.emitInboundFileProgress(deviceId);
    return index;
  }

  private finishInboundFileActivity(deviceId: string, index: number | null, success: boolean): void {
    if (index === null || !this.activityFiles[index]) return;
    this.activityFiles[index].state = success ? "complete" : "error";
    this.activityUpdatedAt = this.now();
    this.emitInboundFileProgress(deviceId, success ? "syncing" : "error");
  }

  private emitInboundFileProgress(deviceId: string, phase: LanSyncProgressPhase = "syncing"): void {
    const completed = this.activityFiles.filter((file) => file.state === "complete").length;
    const uploads = this.activityFiles.filter((file) => file.action === "push").length;
    const uploadCompleted = this.activityFiles.filter((file) => file.action === "push" && file.state === "complete").length;
    const downloads = this.activityFiles.filter((file) => file.action === "pull").length;
    const downloadCompleted = this.activityFiles.filter((file) => file.action === "pull" && file.state === "complete").length;
    const bytesTransferred = this.activityFiles
      .filter((file) => file.state === "complete")
      .reduce((sum, file) => sum + file.size, 0);
    this.emit({
      ...defaultProgress(phase),
      active: true,
      peerId: deviceId,
      completed,
      total: this.activityFiles.length,
      bytesTransferred,
      bytesTotal: this.activityFiles.reduce((sum, file) => sum + file.size, 0),
      changed: completed,
      uploads,
      uploadCompleted,
      downloads,
      downloadCompleted,
      error: phase === "error" ? "inbound_transfer_failed" : ""
    });
  }

  private normalizeMessagePayload(value: unknown, deviceId: string): LanSyncIncomingMessage {
    const raw = isRecord(value) ? value : {};
    const id = typeof raw.id === "string" && /^[A-Za-z0-9_-]{12,96}$/.test(raw.id) ? raw.id : randomId(18);
    const text = typeof raw.text === "string" ? raw.text.trim().slice(0, MAX_MESSAGE_TEXT_LENGTH) : "";
    const sentAtDate = new Date(typeof raw.sentAt === "string" ? raw.sentAt : this.now());
    const sentAt = Number.isFinite(sentAtDate.getTime()) ? sentAtDate.toISOString() : new Date(this.now()).toISOString();
    const attachments = (Array.isArray(raw.attachments) ? raw.attachments : []).slice(0, MAX_MESSAGE_ATTACHMENTS).map((item) => {
      if (!isRecord(item)) throw new LanSyncProtocolError("invalid_message_attachment");
      const inboxPath = normalizeLanInboxAttachmentPath(item.path);
      const path = inboxPath || this.normalizePath(item.path, false);
      const hash = typeof item.hash === "string" ? item.hash : "";
      const size = Number(item.size);
      if (!path || !/^[A-Za-z0-9_-]{32,64}$/.test(hash) || !Number.isFinite(size) || size < 0 || size > this.settings().maxFileBytes) {
        throw new LanSyncProtocolError("invalid_message_attachment");
      }
      const expiresAtDate = new Date(typeof item.expiresAt === "string" ? item.expiresAt : 0);
      return {
        name: safeLanInboxName(item.name || path.split("/").pop() || "attachment"),
        type: String(item.type || "application/octet-stream").slice(0, 128),
        path,
        size,
        hash,
        temporary: Boolean(inboxPath),
        expiresAt: inboxPath && Number.isFinite(expiresAtDate.getTime()) ? expiresAtDate.toISOString() : ""
      };
    });
    if (!text && !attachments.length) throw new LanSyncProtocolError("empty_message");
    return { id, deviceId, text, sentAt, attachments };
  }

  private async handleIncomingMessage(deviceId: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const message = this.normalizeMessagePayload(payload, deviceId);
    for (const attachment of message.attachments) {
      const stat = await this.options.storage.statFile(attachment.path);
      if (!stat || stat.size !== attachment.size || stat.size > this.settings().maxFileBytes) throw new LanSyncProtocolError("message_attachment_unavailable", 409);
      const hash = await sha256Bytes(await this.options.storage.readBinary(attachment.path));
      if (hash !== attachment.hash) throw new LanSyncProtocolError("message_attachment_mismatch", 409);
    }
    await this.options.onMessage?.(message);
    return { ok: true, id: message.id };
  }

  private async receiveQueuedMessages(peer: LanSyncPeer, value: unknown): Promise<void> {
    if (!Array.isArray(value) || value.length > MAX_PING_MESSAGES) return;
    for (const item of value) {
      try {
        const message = this.normalizeMessagePayload(item, peer.deviceId);
        for (const attachment of message.attachments) {
          const existing = await this.options.storage.statFile(attachment.path);
          if (existing) {
            if (existing.size !== attachment.size) throw new LanSyncProtocolError("attachment_exists", 409);
            const existingHash = await sha256Bytes(await this.options.storage.readBinary(attachment.path));
            if (existingHash !== attachment.hash) throw new LanSyncProtocolError("attachment_exists", 409);
            continue;
          }
          const response = await this.callPeer(peer, "/attachment/read", {
            messageId: message.id,
            path: attachment.path,
            expectedHash: attachment.hash
          }, fileTransferTimeoutMs(attachment.size));
          const received = this.parseAttachment(response.attachment);
          const encoded = typeof response.data === "string" ? response.data : "";
          const bytes = base64UrlToBytes(encoded);
          if (received.path !== attachment.path || received.hash !== attachment.hash || bytes.byteLength !== attachment.size || await sha256Bytes(bytes) !== attachment.hash) {
            throw new LanSyncProtocolError("invalid_file_response");
          }
          await this.options.storage.ensureFolder(attachment.path.split("/").slice(0, -1).join("/"));
          await this.options.storage.writeBinary(attachment.path, arrayBuffer(bytes));
          const written = await this.options.storage.statFile(attachment.path);
          if (!written || written.size !== bytes.byteLength) throw new Error("write_verification_failed");
        }
        if (!this.receivedMessageIds.has(message.id)) {
          await this.options.onMessage?.(message);
          this.receivedMessageIds.add(message.id);
          if (this.receivedMessageIds.size > 5000) this.receivedMessageIds.delete(this.receivedMessageIds.values().next().value ?? "");
        }
        await this.callPeer(peer, "/message/ack", { ids: [message.id] });
      } catch (error) {
        this.lastErrorValue = safeErrorCode(error);
      }
    }
  }

  private async handleReadQueuedAttachment(deviceId: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const messageId = typeof payload.messageId === "string" ? payload.messageId : "";
    const path = normalizeLanInboxAttachmentPath(payload.path);
    const expectedHash = typeof payload.expectedHash === "string" ? payload.expectedHash : "";
    const message = (this.pendingMessages.get(deviceId) ?? []).find((item) => item.id === messageId);
    const attachment = message?.attachments.find((item) => item.path === path && item.hash === expectedHash);
    const sourcePath = attachment && path ? this.outboundAttachmentPath(deviceId, path) : null;
    if (!message || !attachment || !sourcePath) throw new LanSyncProtocolError("file_unavailable", 404);
    const stat = await this.options.storage.statFile(sourcePath);
    if (!stat || stat.size !== attachment.size) throw new LanSyncProtocolError("file_unavailable", 404);
    const bytes = new Uint8Array(await this.options.storage.readBinary(sourcePath));
    if (bytes.byteLength !== attachment.size || await sha256Bytes(bytes) !== attachment.hash) throw new LanSyncProtocolError("precondition_failed", 409);
    return { attachment, data: bytesToBase64Url(bytes) };
  }

  private async handleMessageAcknowledgement(deviceId: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const ids = Array.isArray(payload.ids)
      ? payload.ids.filter((value): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{12,96}$/.test(value)).slice(0, MAX_PING_MESSAGES)
      : [];
    const idSet = new Set(ids);
    const queue = this.pendingMessages.get(deviceId) ?? [];
    const removed = queue.filter((message) => idSet.has(message.id));
    const remaining = queue.filter((message) => !idSet.has(message.id));
    if (remaining.length) this.pendingMessages.set(deviceId, remaining);
    else this.pendingMessages.delete(deviceId);
    this.savePendingMessages();
    for (const message of removed) {
      for (const attachment of message.attachments) {
        const sourcePath = this.outboundAttachmentPath(deviceId, attachment.path);
        if (sourcePath && await this.options.storage.exists(sourcePath)) await this.options.storage.deleteFile(sourcePath).catch(() => undefined);
      }
    }
    return { ok: true, acked: removed.map((message) => message.id) };
  }

  private dirtySnapshot(): LanSyncDirtyPath[] {
    return [...this.dirtyPaths.entries()]
      .slice(-MAX_DIRTY_PATHS)
      .map(([path, generation]) => ({ path, generation }));
  }

  private parseDirtyPaths(value: unknown): Map<string, number> {
    const paths = new Map<string, number>();
    if (!Array.isArray(value) || value.length > MAX_DIRTY_PATHS) return paths;
    for (const item of value) {
      if (!isRecord(item)) continue;
      const path = this.normalizePath(item.path, true);
      const generation = Number(item.generation);
      if (!path || !Number.isSafeInteger(generation) || generation <= 0) continue;
      paths.set(path, generation);
    }
    return paths;
  }

  private syncSignalPayload(): Record<string, unknown> {
    return {
      capabilities: [METADATA_LEDGER_CAPABILITY],
      syncRequestId: this.syncRequestId,
      fullSyncRequestId: this.fullSyncRequested ? this.fullSyncRequestId : "",
      dirtyPaths: this.dirtySnapshot()
    };
  }

  private applyRemoteSyncSignal(peer: LanSyncPeer, payload: Record<string, unknown>): boolean {
    const capabilities = (Array.isArray(payload.capabilities) ? payload.capabilities : [])
      .filter((value): value is string => typeof value === "string" && value.length <= 64);
    if (capabilities.includes(METADATA_LEDGER_CAPABILITY)) {
      peer.capabilities.add(METADATA_LEDGER_CAPABILITY);
      peer.compatibilityPendingSince = 0;
      if (this.lastErrorValue === "peer_upgrade_required") this.lastErrorValue = "";
    } else if (!peer.capabilities.has(METADATA_LEDGER_CAPABILITY) && peer.compatibilityPendingSince <= 0) {
      peer.compatibilityPendingSince = this.now();
    }
    const requestId = typeof payload.syncRequestId === "string" && /^[A-Za-z0-9_-]{12,96}$/.test(payload.syncRequestId)
      ? payload.syncRequestId
      : "";
    const requested = Boolean(requestId && requestId !== peer.lastRemoteSyncRequestId);
    if (requestId) peer.lastRemoteSyncRequestId = requestId;
    peer.remoteFullSyncRequestId = typeof payload.fullSyncRequestId === "string" && /^[A-Za-z0-9_-]{12,96}$/.test(payload.fullSyncRequestId)
      ? payload.fullSyncRequestId
      : "";
    peer.remoteDirtyPaths = this.parseDirtyPaths(payload.dirtyPaths);
    return requested;
  }

  private emitPeerConnectionStage(peer: LanSyncPeer): void {
    if (this.progressValue.phase === "scanning" || this.progressValue.phase === "syncing" || this.inboundSession) return;
    const hasPendingWork = this.fullSyncRequested || Boolean(peer.remoteFullSyncRequestId) || (peer.remoteDirtyPaths?.size ?? 0) > 0;
    if (this.progressValue.phase === "complete" && !hasPendingWork) return;
    const compatible = peer.capabilities.has(METADATA_LEDGER_CAPABILITY);
    const compatibilityExpired = !compatible
      && peer.compatibilityPendingSince > 0
      && this.now() - peer.compatibilityPendingSince >= 2_000;
    const stage: LanSyncProgressStage = compatibilityExpired
      ? "peer-upgrade-required"
      : !compatible
        ? "checking-peer"
        : this.fullSyncRequested
          ? "requesting-peer-scan"
          : "waiting-peer-scan";
    const error = compatibilityExpired ? "peer_upgrade_required" : "";
    if (error) this.lastErrorValue = error;
    this.emit({
      ...defaultProgress("connected"),
      stage,
      active: true,
      peerId: peer.deviceId,
      error
    });
  }

  private async verifyPeer(peer: LanSyncPeer): Promise<void> {
    const now = this.now();
    const minimumProbeInterval = Math.max(300, PEER_PROBE_INTERVAL_MS - 100);
    if (!this.runningValue || !peer.canHost || peer.probing || now - peer.lastProbeAt < minimumProbeInterval || !peer.addresses.size) return;
    peer.probing = true;
    peer.lastProbeAt = now;
    const firstVerifiedConnection = peer.verifiedAt <= 0;
    try {
      const response = await this.callPeer(peer, "/ping", this.syncSignalPayload());
      const responseDeviceId = typeof response.deviceId === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(response.deviceId) ? response.deviceId : "";
      if (response.protocolVersion !== PROTOCOL_VERSION || !responseDeviceId) throw new Error("peer_identity_mismatch");
      if (responseDeviceId !== peer.deviceId) {
        if (!peer.manual) throw new Error("peer_identity_mismatch");
        const oldKey = [...this.peers.entries()].find(([, candidate]) => candidate === peer)?.[0] ?? "";
        const existing = this.peers.get(responseDeviceId);
        if (existing && existing !== peer) {
          for (const address of peer.addresses) existing.addresses.add(address);
          existing.port = peer.port;
          existing.manual = true;
          peer = existing;
        } else {
          peer.deviceId = responseDeviceId;
          this.peers.set(responseDeviceId, peer);
        }
        if (oldKey && oldKey !== responseDeviceId) this.peers.delete(oldKey);
      }
      peer.policy = policyFromRaw(response.policy);
      peer.capabilities = new Set(
        (Array.isArray(response.capabilities) ? response.capabilities : [])
          .filter((value): value is string => typeof value === "string" && value.length <= 64)
      );
      const remoteRequestedSync = this.applyRemoteSyncSignal(peer, response);
      peer.verifiedAt = this.now();
      peer.lastSeenAt = Math.max(peer.lastSeenAt, peer.verifiedAt);
      peer.consecutiveFailures = 0;
      peer.lastFailureAt = 0;
      this.lastErrorValue = "";
      if (this.progressValue.phase !== "scanning" && this.progressValue.phase !== "syncing" && this.progressValue.phase !== "complete") {
        this.emit({ ...defaultProgress("connected"), stage: "waiting-peer-scan", active: true, peerId: peer.deviceId });
      }
      this.emitPeersChanged();
      await this.receiveQueuedMessages(peer, response.messages);
      if (firstVerifiedConnection || remoteRequestedSync) this.scheduleSync(remoteRequestedSync ? 0 : 20, true);
    } catch {
      peer.consecutiveFailures = Math.min(100, peer.consecutiveFailures + 1);
      peer.lastFailureAt = this.now();
      // Keep an authenticated peer visible through short network jitter. The
      // stable grace window below decides when it is genuinely offline.
    } finally {
      peer.probing = false;
    }
  }

  private async probePeers(): Promise<void> {
    if (!this.runningValue) return;
    await this.refreshIdentityIfChanged();
    this.refreshManualPeers();
    await Promise.all([...this.peers.values()].slice(0, 16).map(async (peer) => await this.verifyPeer(peer)));
    this.emitPeersChanged();
  }

  private activePeers(): LanSyncPeer[] {
    const now = this.now();
    return [...this.peers.values()]
      .filter((peer) => this.isPeerActive(peer, now))
      .sort((left, right) => left.deviceId.localeCompare(right.deviceId));
  }

  private isPeerActive(peer: LanSyncPeer, now = this.now()): boolean {
    if (peer.verifiedAt <= 0) return false;
    const stableGraceMs = Math.max(PEER_MIN_STABLE_GRACE_MS, PEER_PROBE_INTERVAL_MS * 12);
    return now - peer.verifiedAt <= stableGraceMs;
  }

  private sweepPeers(): void {
    const active = this.activePeers();
    if (!active.length) {
      if (this.progressValue.active) this.emit({ ...defaultProgress("discovering"), active: false });
      this.emitPeersChanged();
      return;
    }
    const hasActiveTransfer = this.activityFiles.some((file) => file.state === "syncing");
    if (this.progressValue.phase === "syncing" && !this.syncRunning && !this.inboundSession && !hasActiveTransfer && this.now() - this.lastTransferAt > 500) {
      this.emit({ ...defaultProgress("connected"), active: true, peerId: active[0].deviceId });
    }
  }

  private scheduleSync(delay: number, force = false): void {
    if (!this.runningValue || !this.syncTargets().length) return;
    if (!force && !this.settings().autoDiscovery) return;
    if (force) this.syncForced = true;
    if (this.syncRunning) {
      this.syncQueued = true;
      return;
    }
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => {
      this.syncTimer = null;
      void this.syncActivePeers();
    }, Math.max(0, delay));
  }

  private isCoordinator(): boolean {
    if (!this.options.desktop) return true;
    return this.syncTargets().every((peer) => this.deviceId.localeCompare(peer.deviceId) < 0);
  }

  private syncTargets(): LanSyncPeer[] {
    return this.activePeers().filter((peer) => peer.canHost);
  }

  private async syncActivePeers(): Promise<void> {
    const forced = this.syncForced;
    this.syncForced = false;
    if (!this.runningValue || this.syncRunning || !this.isCoordinator()) return;
    const peers = this.syncTargets();
    if (!peers.length) return;
    const localDirty = new Map(this.dirtyPaths);
    const localFullSyncRequestId = this.fullSyncRequested ? this.fullSyncRequestId : "";
    this.syncRunning = true;
    try {
      let settledAcrossPeers: Set<string> | null = null;
      let fullSyncCompletedEverywhere = Boolean(localFullSyncRequestId);
      let synchronizedPeers = 0;
      for (const peer of peers) {
        if (!this.runningValue) break;
        if (this.now() - peer.lastSyncAt < SYNC_MIN_INTERVAL_MS && !this.syncQueued && !forced) continue;
        const result = await this.syncPeer(peer, localDirty, localFullSyncRequestId);
        if (result.fullSyncComplete) this.recordFullScan();
        settledAcrossPeers = settledAcrossPeers === null
          ? new Set(result.settledLocalPaths)
          : new Set([...settledAcrossPeers].filter((path) => result.settledLocalPaths.has(path)));
        if (localFullSyncRequestId) fullSyncCompletedEverywhere = fullSyncCompletedEverywhere && result.fullSyncComplete;
        peer.lastSyncAt = this.now();
        synchronizedPeers += 1;
      }
      if (synchronizedPeers === peers.length) {
        for (const path of settledAcrossPeers ?? []) {
          const generation = localDirty.get(path);
          if (generation !== undefined && (this.dirtyPaths.get(path) ?? 0) <= generation) this.dirtyPaths.delete(path);
        }
        if (localFullSyncRequestId && fullSyncCompletedEverywhere && this.fullSyncRequestId === localFullSyncRequestId) {
          this.fullSyncRequested = false;
        }
      }
    } catch (error) {
      this.lastErrorValue = safeErrorCode(error);
      this.syncQueued = true;
      const peer = peers[0];
      this.emit({
        ...defaultProgress("error"),
        stage: this.lastErrorValue === "peer_upgrade_required" ? "peer-upgrade-required" : "error",
        active: Boolean(peer),
        peerId: peer?.deviceId ?? "",
        error: this.lastErrorValue
      });
    } finally {
      this.syncRunning = false;
      if (this.syncQueued) {
        this.syncQueued = false;
        this.scheduleSync(QUEUED_SYNC_DELAY_MS, true);
      }
    }
  }

  private async syncPeer(
    peer: LanSyncPeer,
    localDirty = new Map(this.dirtyPaths),
    localFullSyncRequestId = this.fullSyncRequested ? this.fullSyncRequestId : ""
  ): Promise<LanSyncPeerResult> {
    if (!peer.capabilities?.has(METADATA_LEDGER_CAPABILITY)) throw new LanSyncProtocolError("peer_upgrade_required", 426);
    const remoteDirty = new Map(peer.remoteDirtyPaths ?? []);
    const remoteFullSyncRequestId = peer.remoteFullSyncRequestId ?? "";
    const fullSync = Boolean(localFullSyncRequestId || remoteFullSyncRequestId);
    const paths = new Set([...localDirty.keys(), ...remoteDirty.keys()]);
    if (!fullSync && !paths.size) return { settledLocalPaths: new Set(), fullSyncComplete: false };
    return await this.syncPeerMetadata(peer, {
      fullSync,
      paths,
      localDirty,
      remoteDirty,
      localFullSyncRequestId,
      remoteFullSyncRequestId
    });
  }

  private async syncPeerMetadata(peer: LanSyncPeer, request: {
    fullSync: boolean;
    paths: Set<string>;
    localDirty: Map<string, number>;
    remoteDirty: Map<string, number>;
    localFullSyncRequestId: string;
    remoteFullSyncRequestId: string;
  }): Promise<LanSyncPeerResult> {
    this.activityFiles = [];
    this.activityUpdatedAt = this.now();
    this.emit({ ...defaultProgress("scanning"), active: true, peerId: peer.deviceId });
    const localPolicy = this.policy();
    const requestedPaths = [...request.paths].sort((left, right) => left.localeCompare(right));
    const [localEntries, remoteResponse, ledger] = await Promise.all([
      request.fullSync
        ? this.buildMetadataManifest(localPolicy.syncConfigFolder)
        : this.buildMetadataManifestForPaths(requestedPaths, localPolicy.syncConfigFolder),
      this.callPeer(
        peer,
        request.fullSync ? `${METADATA_ROUTE_PREFIX}/manifest` : `${METADATA_ROUTE_PREFIX}/manifest/paths`,
        request.fullSync
          ? { syncConfigFolder: localPolicy.syncConfigFolder }
          : { syncConfigFolder: localPolicy.syncConfigFolder, paths: requestedPaths }
      ),
      Promise.resolve(this.loadMetadataLedger(peer.deviceId))
    ]);
    const remotePolicy = policyFromRaw(remoteResponse.policy);
    peer.policy = remotePolicy;
    const shareConfig = localPolicy.syncConfigFolder && remotePolicy.syncConfigFolder;
    const filteredLocalEntries = shareConfig
      ? localEntries
      : localEntries.filter((entry) => !isConfigPath(entry.path, this.settings().configDir));
    const remoteEntries = this.parseMetadataManifest(remoteResponse.files, shareConfig);
    const localMap = new Map(filteredLocalEntries.map((entry) => [entry.path, entry]));
    const remoteMap = new Map(remoteEntries.map((entry) => [entry.path, entry]));
    const selectedPaths = new Set(
      (request.fullSync
        ? [...localMap.keys(), ...remoteMap.keys(), ...request.paths]
        : requestedPaths)
        .filter((path) => shareConfig || !isConfigPath(path, this.settings().configDir))
    );
    if (request.fullSync) {
      for (const path of Object.keys(ledger.entries)) {
        if (!localMap.has(path) && !remoteMap.has(path)) delete ledger.entries[path];
      }
    }
    for (const path of [...new Set([...localMap.keys(), ...remoteMap.keys()])]) {
      const local = localMap.get(path);
      const remote = remoteMap.get(path);
      if (local && remote && (metadataMatches(local, remote) || (!ledger.entries[path] && metadataBootstrapEquivalent(local, remote)))) {
        ledger.entries[path] = { local: metadataSnapshot(local), remote: metadataSnapshot(remote) };
      }
    }
    const bootstrapCandidates = [...localMap.keys()]
      .map((path) => ({ path, local: localMap.get(path), remote: remoteMap.get(path) }))
      .filter((item): item is { path: string; local: LanSyncMetadataEntry; remote: LanSyncMetadataEntry } => Boolean(
        !ledger.entries[item.path]
        && item.local
        && item.remote
        && item.local.size === item.remote.size
      ));
    if (bootstrapCandidates.length) {
      const scan = this.scanValue;
      const scanFiles = new Map(scan.files.map((file) => [file.path, file]));
      const completedBeforeHashes = scan.completed;
      scan.phase = "scanning";
      scan.total += bootstrapCandidates.length;
      for (const candidate of bootstrapCandidates) {
        const activity = scanFiles.get(candidate.path);
        if (activity) {
          activity.state = "hashing";
          activity.reason = "fingerprint";
        }
      }
      this.emit({
        ...defaultProgress("scanning"),
        stage: "fingerprinting",
        active: true,
        peerId: peer.deviceId,
        completed: scan.completed,
        total: scan.total
      });
      let verified = 0;
      let lastBootstrapProgressAt = 0;
      const localHashesPromise = this.buildMetadataHashManifest(
        bootstrapCandidates.map((item) => item.local),
        shareConfig,
        (path, cached) => {
          verified += 1;
          scan.completed = completedBeforeHashes + verified;
          if (cached) scan.cached += 1;
          else scan.hashed += 1;
          const activity = scanFiles.get(path);
          if (activity) {
            activity.state = cached ? "cached" : "complete";
            activity.reason = cached ? "fingerprint-cache" : "fingerprint";
          }
          const now = this.now();
          if (verified < bootstrapCandidates.length && now - lastBootstrapProgressAt < 40) return;
          lastBootstrapProgressAt = now;
          this.emit({
            ...defaultProgress("scanning"),
            stage: "fingerprinting",
            active: true,
            peerId: peer.deviceId,
            completed: scan.completed,
            total: scan.total
          });
        }
      );
      const remoteHashesPromise = this.callPeer(peer, `${METADATA_ROUTE_PREFIX}/bootstrap/hashes`, {
        syncConfigFolder: localPolicy.syncConfigFolder,
        files: bootstrapCandidates.map((item) => item.remote)
      }, 10 * 60_000);
      const [localHashes, remoteHashesResponse] = await Promise.all([localHashesPromise, remoteHashesPromise]);
      const localHashMap = new Map(localHashes.map((entry) => [entry.path, entry]));
      const remoteHashMap = new Map(this.parseManifest(remoteHashesResponse.files, shareConfig).map((entry) => [entry.path, entry]));
      for (const item of bootstrapCandidates) {
        const localHash = localHashMap.get(item.path);
        const remoteHash = remoteHashMap.get(item.path);
        if (!localHash || !remoteHash || localHash.hash !== remoteHash.hash) continue;
        if (!metadataMatches(localHash, item.local) || !metadataMatches(remoteHash, item.remote)) continue;
        ledger.entries[item.path] = { local: metadataSnapshot(item.local), remote: metadataSnapshot(item.remote) };
      }
      scan.phase = "complete";
      scan.completed = scan.total;
    }
    this.emit({
      ...defaultProgress("scanning"),
      stage: "planning",
      active: true,
      peerId: peer.deviceId,
      completed: this.scanValue.completed,
      total: this.scanValue.total
    });
    const actions = planLanSyncMetadataReconciliation(filteredLocalEntries, remoteEntries, ledger.entries, localPolicy, remotePolicy);
    const actionPaths = new Set(actions.map((action) => action.path));
    const settledPaths = new Set([...selectedPaths].filter((path) => !actionPaths.has(path)));
    const commits: LanSyncMetadataCommit[] = [];
    for (const path of settledPaths) {
      const local = localMap.get(path);
      const remote = remoteMap.get(path);
      const baseline = ledger.entries[path];
      if (local && remote && (metadataMatches(local, remote) || (baseline && metadataMatches(local, baseline.local) && metadataMatches(remote, baseline.remote)))) {
        commits.push({ path, coordinator: metadataSnapshot(local), peer: metadataSnapshot(remote) });
      } else if (!local && !remote) {
        commits.push({ path, coordinator: null, peer: null });
      }
    }
    const transferSize = (action: LanSyncMetadataReconcileAction): number => action.kind === "push"
      ? action.local?.size ?? 0
      : action.kind === "pull"
        ? action.remote?.size ?? 0
        : 0;
    const bytesTotal = actions.reduce((sum, action) => sum + transferSize(action), 0);
    const uploads = actions.filter((action) => action.kind === "push").length;
    const downloads = actions.filter((action) => action.kind === "pull").length;
    this.activityFiles = actions.map((action) => ({
      path: action.path,
      action: action.kind,
      state: "pending",
      size: transferSize(action)
    }));
    this.activityUpdatedAt = this.now();
    const sessionId = randomId(18);
    await this.callPeer(peer, `${METADATA_ROUTE_PREFIX}/session/start`, {
      sessionId,
      total: actions.length,
      bytesTotal,
      uploads,
      downloads,
      files: this.activityFiles.map((file) => ({ path: file.path, action: file.action, size: file.size }))
    });
    let completed = 0;
    let uploadCompleted = 0;
    let downloadCompleted = 0;
    let bytesTransferred = 0;
    let changed = 0;
    let conflicts = 0;
    this.emit({
      ...defaultProgress(actions.length ? "syncing" : "complete"),
      active: true,
      peerId: peer.deviceId,
      total: actions.length,
      bytesTotal,
      uploads,
      uploadCompleted,
      downloads,
      downloadCompleted
    });
    let cursor = 0;
    let failure: unknown = null;
    const retryPaths = new Set<string>();
    const transferWorker = async (): Promise<void> => {
      while (this.runningValue && failure === null && cursor < actions.length) {
        const index = cursor;
        cursor += 1;
        const activity = this.activityFiles[index];
        if (activity) {
          activity.state = "syncing";
          this.activityUpdatedAt = this.now();
          this.emit({
            ...defaultProgress("syncing"),
            active: true,
            peerId: peer.deviceId,
            completed,
            total: actions.length,
            bytesTransferred,
            bytesTotal,
            changed,
            conflicts,
            uploads,
            uploadCompleted,
            downloads,
            downloadCompleted
          });
        }
        try {
          const result = await this.executeMetadataAction(peer, actions[index], ledger, sessionId);
          if (activity) activity.state = "complete";
          settledPaths.add(actions[index].path);
          if (result.commit) commits.push(result.commit);
          completed += 1;
          if (actions[index].kind === "push") uploadCompleted += 1;
          else if (actions[index].kind === "pull") downloadCompleted += 1;
          bytesTransferred += result.bytes;
          changed += result.changed ? 1 : 0;
          conflicts += result.conflict ? 1 : 0;
          this.lastTransferAt = this.now();
          this.activityUpdatedAt = this.lastTransferAt;
          this.emit({
            ...defaultProgress("syncing"),
            active: true,
            peerId: peer.deviceId,
            completed,
            total: actions.length,
            bytesTransferred,
            bytesTotal,
            changed,
            conflicts,
            uploads,
            uploadCompleted,
            downloads,
            downloadCompleted
          });
        } catch (error) {
          if (safeErrorCode(error) === "precondition_failed") {
            if (activity) activity.state = "deferred";
            retryPaths.add(actions[index].path);
            completed += 1;
            this.activityUpdatedAt = this.now();
            this.emit({
              ...defaultProgress("syncing"),
              active: true,
              peerId: peer.deviceId,
              completed,
              total: actions.length,
              bytesTransferred,
              bytesTotal,
              changed,
              conflicts,
              uploads,
              uploadCompleted,
              downloads,
              downloadCompleted
            });
            continue;
          }
          if (activity) activity.state = "error";
          this.activityUpdatedAt = this.now();
          failure = error;
        }
      }
    };
    await Promise.all(Array.from({ length: adaptiveTransferConcurrency(this.activityFiles) }, transferWorker));
    this.saveMetadataLedger(peer.deviceId, ledger);
    const success = failure === null;
    const acknowledgedRemoteDirty = [...request.remoteDirty.entries()]
      .filter(([path]) => settledPaths.has(path))
      .map(([path, generation]) => ({ path, generation }));
    let finishFailure: unknown = null;
    try {
      await this.callPeer(peer, `${METADATA_ROUTE_PREFIX}/session/finish`, {
        sessionId,
        success,
        commits,
        retryPaths: [...retryPaths],
        acknowledgedDirtyPaths: acknowledgedRemoteDirty,
        acknowledgedFullSyncRequestId: success ? request.remoteFullSyncRequestId : ""
      });
    } catch (error) {
      finishFailure = error;
    }
    if (success && finishFailure === null) {
      for (const { path, generation } of acknowledgedRemoteDirty) {
        if ((peer.remoteDirtyPaths?.get(path) ?? 0) <= generation) peer.remoteDirtyPaths?.delete(path);
      }
      if (request.remoteFullSyncRequestId && peer.remoteFullSyncRequestId === request.remoteFullSyncRequestId) peer.remoteFullSyncRequestId = "";
      for (const path of retryPaths) this.markDirtyPath(path, QUEUED_SYNC_DELAY_MS);
    }
    if (failure !== null) throw failure;
    if (finishFailure !== null) throw finishFailure;
    peer.verifiedAt = this.now();
    peer.consecutiveFailures = 0;
    peer.lastFailureAt = 0;
    this.lastErrorValue = "";
    this.emit({
      ...defaultProgress("complete"),
      active: true,
      peerId: peer.deviceId,
      completed,
      total: actions.length,
      bytesTransferred,
      bytesTotal,
      changed,
      conflicts,
      uploads,
      uploadCompleted,
      downloads,
      downloadCompleted
    });
    return {
      settledLocalPaths: new Set([...request.localDirty.keys()].filter((path) => settledPaths.has(path))),
      fullSyncComplete: Boolean(request.fullSync && success)
    };
  }

  private async syncPeerHashed(peer: LanSyncPeer): Promise<void> {
    this.activityFiles = [];
    this.activityUpdatedAt = this.now();
    this.emit({ ...defaultProgress("scanning"), active: true, peerId: peer.deviceId });
    const localPolicy = this.policy();
    const [localEntries, remoteResponse, ledger] = await Promise.all([
      this.buildManifest(localPolicy.syncConfigFolder),
      this.callPeer(peer, "/manifest", { syncConfigFolder: localPolicy.syncConfigFolder }),
      Promise.resolve(this.loadLedger(peer.deviceId))
    ]);
    const remotePolicy = policyFromRaw(remoteResponse.policy);
    peer.policy = remotePolicy;
    const shareConfig = localPolicy.syncConfigFolder && remotePolicy.syncConfigFolder;
    const filteredLocalEntries = shareConfig
      ? localEntries
      : localEntries.filter((entry) => !isConfigPath(entry.path, this.settings().configDir));
    const remoteEntries = this.parseManifest(remoteResponse.files, shareConfig);
    const localMap = new Map(filteredLocalEntries.map((entry) => [entry.path, entry]));
    const remoteMap = new Map(remoteEntries.map((entry) => [entry.path, entry]));
    for (const path of Object.keys(ledger.entries)) {
      if (!localMap.has(path) && !remoteMap.has(path)) delete ledger.entries[path];
    }
    for (const path of [...new Set([...localMap.keys(), ...remoteMap.keys()])]) {
      const local = localMap.get(path);
      const remote = remoteMap.get(path);
      if (local && remote && local.hash === remote.hash) ledger.entries[path] = local.hash;
    }
    const actions = planLanSyncReconciliation(filteredLocalEntries, remoteEntries, ledger.entries, localPolicy, remotePolicy);
    const bytesTotal = actions.reduce((sum, action) => sum + Math.max(action.local?.size ?? 0, action.remote?.size ?? 0), 0);
    this.activityFiles = actions.map((action) => ({
      path: action.path,
      action: action.kind,
      state: "pending",
      size: Math.max(action.local?.size ?? 0, action.remote?.size ?? 0)
    }));
    this.activityUpdatedAt = this.now();
    const uploads = actions.filter((action) => action.kind === "push").length;
    const downloads = actions.filter((action) => action.kind === "pull").length;
    let completed = 0;
    let uploadCompleted = 0;
    let downloadCompleted = 0;
    let bytesTransferred = 0;
    let changed = 0;
    let conflicts = 0;
    this.emit({
      ...defaultProgress(actions.length ? "syncing" : "complete"),
      active: true,
      peerId: peer.deviceId,
      total: actions.length,
      bytesTotal,
      uploads,
      uploadCompleted,
      downloads,
      downloadCompleted
    });
    let cursor = 0;
    let failure: unknown = null;
    const transferWorker = async (): Promise<void> => {
      while (this.runningValue && failure === null && cursor < actions.length) {
        const index = cursor;
        cursor += 1;
        const activity = this.activityFiles[index];
        if (activity) {
          activity.state = "syncing";
          this.activityUpdatedAt = this.now();
          this.emit({
            ...defaultProgress("syncing"),
            active: true,
            peerId: peer.deviceId,
            completed,
            total: actions.length,
            bytesTransferred,
            bytesTotal,
            changed,
            conflicts,
            uploads,
            uploadCompleted,
            downloads,
            downloadCompleted
          });
        }
        try {
          const result = await this.executeAction(peer, actions[index], ledger);
          if (activity) activity.state = "complete";
          completed += 1;
          if (actions[index].kind === "push") uploadCompleted += 1;
          else if (actions[index].kind === "pull") downloadCompleted += 1;
          bytesTransferred += result.bytes;
          changed += result.changed ? 1 : 0;
          conflicts += result.conflict ? 1 : 0;
          this.lastTransferAt = this.now();
          this.activityUpdatedAt = this.lastTransferAt;
          this.emit({
            ...defaultProgress("syncing"),
            active: true,
            peerId: peer.deviceId,
            completed,
            total: actions.length,
            bytesTransferred,
            bytesTotal,
            changed,
            conflicts,
            uploads,
            uploadCompleted,
            downloads,
            downloadCompleted
          });
        } catch (error) {
          if (activity) activity.state = "error";
          this.activityUpdatedAt = this.now();
          failure = error;
        }
      }
    };
    await Promise.all(Array.from({ length: adaptiveTransferConcurrency(this.activityFiles) }, transferWorker));
    if (failure !== null) throw failure;
    this.saveLedger(peer.deviceId, ledger);
    peer.verifiedAt = this.now();
    peer.consecutiveFailures = 0;
    peer.lastFailureAt = 0;
    this.lastErrorValue = "";
    this.emit({
      ...defaultProgress("complete"),
      active: true,
      peerId: peer.deviceId,
      completed,
      total: actions.length,
      bytesTransferred,
      bytesTotal,
      changed,
      conflicts,
      uploads,
      uploadCompleted,
      downloads,
      downloadCompleted
    });
  }

  private async executeMetadataAction(
    peer: LanSyncPeer,
    action: LanSyncMetadataReconcileAction,
    ledger: LanSyncMetadataLedger,
    sessionId: string
  ): Promise<LanSyncMetadataActionResult> {
    if (action.kind === "push" && action.local) {
      const local = await this.readLocalMetadataVerified(action.local.path, metadataSnapshot(action.local));
      const remote = await this.writeRemoteMetadata(peer, action.path, local.bytes, action.remote ? metadataSnapshot(action.remote) : null, local.metadata, false, sessionId);
      ledger.entries[action.path] = { local: local.metadata, remote };
      return { bytes: local.bytes.byteLength, changed: true, conflict: false, commit: { path: action.path, coordinator: local.metadata, peer: remote } };
    }
    if (action.kind === "pull" && action.remote) {
      const remote = await this.readRemoteMetadata(peer, action.remote, sessionId);
      const local = await this.writeLocalMetadata(action.path, remote.bytes, action.local ? metadataSnapshot(action.local) : null, remote.metadata);
      ledger.entries[action.path] = { local, remote: remote.metadata };
      return { bytes: remote.bytes.byteLength, changed: true, conflict: false, commit: { path: action.path, coordinator: local, peer: remote.metadata } };
    }
    if (action.kind === "delete-local" && action.local) {
      await this.deleteLocalMetadata(action.path, metadataSnapshot(action.local));
      delete ledger.entries[action.path];
      return { bytes: 0, changed: true, conflict: false, commit: { path: action.path, coordinator: null, peer: null } };
    }
    if (action.kind === "delete-remote" && action.remote) {
      await this.deleteRemoteMetadata(peer, action.path, metadataSnapshot(action.remote), sessionId);
      delete ledger.entries[action.path];
      return { bytes: 0, changed: true, conflict: false, commit: { path: action.path, coordinator: null, peer: null } };
    }
    return { bytes: 0, changed: false, conflict: false, commit: null };
  }

  private async executeAction(peer: LanSyncPeer, action: LanSyncReconcileAction, ledger: LanSyncLedger): Promise<{ bytes: number; changed: boolean; conflict: boolean }> {
    if (action.kind === "push" && action.local) {
      const bytes = await this.readLocalVerified(action.local.path, action.local.hash);
      await this.writeRemote(peer, action.path, bytes, action.remote?.hash ?? null, action.local.hash);
      ledger.entries[action.path] = action.local.hash;
      return { bytes: bytes.byteLength, changed: true, conflict: false };
    }
    if (action.kind === "pull" && action.remote) {
      const bytes = await this.readRemote(peer, action.remote);
      await this.writeLocal(action.path, bytes, action.local?.hash ?? null, action.remote.hash, true);
      ledger.entries[action.path] = action.remote.hash;
      return { bytes: bytes.byteLength, changed: true, conflict: false };
    }
    if (action.kind === "delete-local" && action.local) {
      await this.deleteLocal(action.path, action.local.hash);
      delete ledger.entries[action.path];
      return { bytes: 0, changed: true, conflict: false };
    }
    if (action.kind === "delete-remote" && action.remote) {
      await this.deleteRemote(peer, action.path, action.remote.hash);
      delete ledger.entries[action.path];
      return { bytes: 0, changed: true, conflict: false };
    }
    return { bytes: 0, changed: false, conflict: false };
  }

  private async buildMetadataHashManifest(
    expectedEntries: LanSyncMetadataEntry[],
    includeConfigFolder: boolean,
    onProgress?: (path: string, cached: boolean) => void
  ): Promise<LanSyncManifestEntry[]> {
    const entries = await mapWithConcurrency(expectedEntries.slice(0, MAX_MANIFEST_FILES), HASH_CONCURRENCY, async (expected) => {
      if (!this.runningValue) {
        onProgress?.(expected.path, false);
        return null;
      }
      const path = this.normalizePath(expected.path, includeConfigFolder);
      if (!path) {
        onProgress?.(expected.path, false);
        return null;
      }
      const before = await this.options.storage.statFile(path);
      if (!before || !metadataMatches(before, expected) || before.size > this.settings().maxFileBytes) {
        onProgress?.(path, false);
        return null;
      }
      const signature = `${before.mtime}:${before.size}`;
      const cachedHash = this.hashCache.get(path);
      if (cachedHash?.signature === signature) {
        onProgress?.(path, true);
        return { path, size: before.size, mtime: before.mtime, hash: cachedHash.hash };
      }
      const bytes = new Uint8Array(await this.options.storage.readBinary(path));
      const after = await this.options.storage.statFile(path);
      if (!after || !metadataMatches(after, expected) || bytes.byteLength !== after.size) {
        onProgress?.(path, false);
        return null;
      }
      const hash = await sha256Bytes(bytes);
      this.hashCache.set(path, { signature, hash });
      onProgress?.(path, false);
      return { path, size: after.size, mtime: after.mtime, hash };
    });
    this.queueHashCacheSave();
    return entries.filter((entry): entry is LanSyncManifestEntry => entry !== null);
  }

  private async buildInboundMetadataHashManifest(
    expectedEntries: LanSyncMetadataEntry[],
    includeConfigFolder: boolean,
    peerId: string
  ): Promise<LanSyncManifestEntry[]> {
    const scan = this.scanValue;
    const scanFiles = new Map(scan.files.map((file) => [file.path, file]));
    const completedBeforeHashes = scan.completed;
    scan.phase = "scanning";
    scan.total += expectedEntries.length;
    for (const expected of expectedEntries) {
      const activity = scanFiles.get(expected.path);
      if (activity) {
        activity.state = "hashing";
        activity.reason = "fingerprint";
      }
    }
    this.emit({
      ...defaultProgress("scanning"),
      stage: "fingerprinting",
      active: true,
      peerId,
      completed: scan.completed,
      total: scan.total
    });
    let verified = 0;
    let lastReportedAt = 0;
    const entries = await this.buildMetadataHashManifest(expectedEntries, includeConfigFolder, (path, cached) => {
      verified += 1;
      scan.completed = completedBeforeHashes + verified;
      if (cached) scan.cached += 1;
      else scan.hashed += 1;
      const activity = scanFiles.get(path);
      if (activity) {
        activity.state = cached ? "cached" : "complete";
        activity.reason = cached ? "fingerprint-cache" : "fingerprint";
      }
      const now = this.now();
      if (verified < expectedEntries.length && now - lastReportedAt < 40) return;
      lastReportedAt = now;
      this.emit({
        ...defaultProgress("scanning"),
        stage: "fingerprinting",
        active: true,
        peerId,
        completed: scan.completed,
        total: scan.total
      });
    });
    scan.phase = "complete";
    scan.completed = scan.total;
    this.emit({
      ...defaultProgress("scanning"),
      stage: "planning",
      active: true,
      peerId,
      completed: scan.completed,
      total: scan.total
    });
    return entries;
  }

  private async buildMetadataManifestForPaths(
    paths: string[],
    includeConfigFolder = this.settings().syncConfigFolder
  ): Promise<LanSyncMetadataEntry[]> {
    const unique = [...new Set(paths)].slice(0, MAX_DIRTY_PATHS);
    const scan: LanSyncScanActivity = {
      id: randomId(12),
      phase: "scanning",
      completed: 0,
      total: unique.length,
      cached: 0,
      hashed: 0,
      skipped: 0,
      error: "",
      files: unique.map((path) => ({ path, state: "pending", size: 0, reason: "" }))
    };
    this.scanValue = scan;
    const report = (): void => {
      if (this.scanValue !== scan || this.progressValue.phase === "syncing") return;
      this.emit({
        ...defaultProgress("scanning"),
        active: this.progressValue.active || this.activePeers().length > 0,
        peerId: this.progressValue.peerId || this.activePeers()[0]?.deviceId || "",
        completed: scan.completed,
        total: scan.total
      });
    };
    report();
    try {
      const results = await mapWithConcurrency(unique.map((path, index) => ({ path, index })), HASH_CONCURRENCY, async ({ path: rawPath, index }) => {
        const activity = scan.files[index];
        const path = this.normalizePath(rawPath, includeConfigFolder);
        if (!path) {
          activity.state = "skipped";
          activity.reason = "unsafe-path";
          scan.skipped += 1;
          scan.completed += 1;
          report();
          return null;
        }
        const stat = await this.options.storage.statFile(path);
        if (!stat) {
          activity.path = path;
          activity.state = "complete";
          activity.reason = "missing";
          scan.completed += 1;
          report();
          return null;
        }
        activity.path = path;
        activity.size = stat.size;
        if (!Number.isFinite(stat.size) || stat.size < 0 || stat.size > this.settings().maxFileBytes || !Number.isFinite(stat.mtime) || stat.mtime < 0) {
          activity.state = "skipped";
          activity.reason = stat.size > this.settings().maxFileBytes ? "too-large" : "invalid-metadata";
          scan.skipped += 1;
          scan.completed += 1;
          report();
          return null;
        }
        activity.state = "cached";
        activity.reason = "metadata";
        scan.cached += 1;
        scan.completed += 1;
        report();
        return { path, size: stat.size, mtime: stat.mtime };
      });
      scan.phase = "complete";
      scan.completed = scan.total;
      report();
      return results.filter((entry): entry is LanSyncMetadataEntry => entry !== null);
    } catch (error) {
      scan.phase = "error";
      scan.error = safeErrorCode(error);
      report();
      throw error;
    }
  }

  private async buildMetadataManifest(
    includeConfigFolder = this.settings().syncConfigFolder,
    onProgress?: (completed: number, total: number) => void
  ): Promise<LanSyncMetadataEntry[]> {
    if (this.metadataManifestBuild?.includeConfigFolder === includeConfigFolder) {
      const existing = await this.metadataManifestBuild.promise;
      onProgress?.(this.scanValue.completed, this.scanValue.total);
      return existing.map((entry) => ({ ...entry }));
    }
    const promise = this.buildMetadataManifestOnce(includeConfigFolder, onProgress);
    this.metadataManifestBuild = { includeConfigFolder, promise };
    try {
      return await promise;
    } finally {
      if (this.metadataManifestBuild?.promise === promise) this.metadataManifestBuild = null;
    }
  }

  private async buildMetadataManifestOnce(
    includeConfigFolder: boolean,
    onProgress?: (completed: number, total: number) => void
  ): Promise<LanSyncMetadataEntry[]> {
    const maxFileBytes = this.settings().maxFileBytes;
    const rawFiles = (await this.options.storage.listFiles(includeConfigFolder))
      .map((file) => ({ ...file, originalPath: String(file.path || ""), path: this.normalizePath(file.path, includeConfigFolder) }))
      .sort((left, right) => left.originalPath.localeCompare(right.originalPath));
    const scanFiles: LanSyncScanFileActivity[] = [];
    const candidates: Array<Omit<LanSyncFileStat, "path"> & { path: string; scanIndex: number }> = [];
    for (const file of rawFiles) {
      let reason = "";
      if (!file.path || !Number.isFinite(file.size) || file.size < 0 || !Number.isFinite(file.mtime) || file.mtime < 0) reason = "unsafe-path";
      else if (file.size > maxFileBytes) reason = "too-large";
      else if (candidates.length >= MAX_MANIFEST_FILES) reason = "manifest-limit";
      const scanIndex = scanFiles.push({
        path: file.path || file.originalPath,
        state: reason ? "skipped" : "pending",
        size: Math.max(0, Number(file.size) || 0),
        reason
      }) - 1;
      if (!reason && file.path) candidates.push({ path: file.path, size: file.size, mtime: file.mtime, scanIndex });
    }
    const skipped = scanFiles.filter((file) => file.state === "skipped").length;
    const scan: LanSyncScanActivity = {
      id: randomId(12),
      phase: "scanning",
      completed: skipped,
      total: scanFiles.length,
      cached: 0,
      hashed: 0,
      skipped,
      error: "",
      files: scanFiles
    };
    this.scanValue = scan;
    let lastReportedAt = 0;
    const report = (force = false): void => {
      const now = this.now();
      if (!force && scan.completed !== scan.total && now - lastReportedAt < 40) return;
      lastReportedAt = now;
      onProgress?.(scan.completed, scan.total);
      if (this.scanValue === scan && this.progressValue.phase !== "syncing") {
        this.emit({
          ...defaultProgress("scanning"),
          active: this.progressValue.active || this.activePeers().length > 0,
          peerId: this.progressValue.peerId || this.activePeers()[0]?.deviceId || "",
          completed: scan.completed,
          total: scan.total
        });
      }
    };
    report(true);
    try {
      const entries: LanSyncMetadataEntry[] = [];
      for (let index = 0; index < candidates.length; index += 1) {
        const file = candidates[index];
        const activity = scan.files[file.scanIndex];
        activity.state = "cached";
        activity.reason = "metadata";
        scan.cached += 1;
        scan.completed += 1;
        entries.push({ path: file.path, size: file.size, mtime: file.mtime });
        report();
        if ((index + 1) % 512 === 0 && index + 1 < candidates.length) {
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
      }
      scan.phase = "complete";
      scan.completed = scan.total;
      report(true);
      return entries;
    } catch (error) {
      scan.phase = "error";
      scan.error = safeErrorCode(error);
      report(true);
      throw error;
    }
  }

  private parseMetadataSnapshot(value: unknown): LanSyncMetadataSnapshot | null {
    if (!isRecord(value)) return null;
    const size = Number(value.size);
    const mtime = Number(value.mtime);
    if (!Number.isFinite(size) || !Number.isInteger(size) || size < 0 || size > this.settings().maxFileBytes || !Number.isFinite(mtime) || mtime < 0) return null;
    return { size, mtime };
  }

  private parseMetadataManifest(value: unknown, includeConfigFolder: boolean): LanSyncMetadataEntry[] {
    if (!Array.isArray(value) || value.length > MAX_MANIFEST_FILES) throw new LanSyncProtocolError("invalid_metadata_manifest");
    const entries: LanSyncMetadataEntry[] = [];
    for (const item of value) {
      if (!isRecord(item)) throw new LanSyncProtocolError("invalid_metadata_manifest");
      const path = this.normalizePath(item.path, includeConfigFolder);
      const metadata = this.parseMetadataSnapshot(item);
      if (!path || !metadata) throw new LanSyncProtocolError("invalid_metadata_manifest");
      entries.push({ path, ...metadata });
    }
    return entries;
  }

  private metadataLedgerKey(peerId: string): string {
    return `ntfy.lan-sync.metadata-ledger.v3.${this.identity?.vaultId ?? "unknown"}.${peerId}`;
  }

  private loadMetadataLedger(peerId: string): LanSyncMetadataLedger {
    try {
      const raw = this.localStore()?.getItem(this.metadataLedgerKey(peerId));
      if (!raw) return { schemaVersion: 3, entries: {} };
      const parsed = safeJsonObject(raw);
      if (parsed.schemaVersion !== 3 || !isRecord(parsed.entries)) return { schemaVersion: 3, entries: {} };
      const entries: Record<string, LanSyncMetadataLedgerEntry> = {};
      for (const [path, value] of Object.entries(parsed.entries).slice(-MAX_LEDGER_ENTRIES)) {
        const normalized = this.normalizePath(path, true);
        if (!normalized || !isRecord(value)) continue;
        const local = this.parseMetadataSnapshot(value.local);
        const remote = this.parseMetadataSnapshot(value.remote);
        if (local && remote) entries[normalized] = { local, remote };
      }
      return { schemaVersion: 3, entries };
    } catch {
      return { schemaVersion: 3, entries: {} };
    }
  }

  private saveMetadataLedger(peerId: string, ledger: LanSyncMetadataLedger): void {
    const keys = Object.keys(ledger.entries);
    const trimmed = keys.length <= MAX_LEDGER_ENTRIES
      ? ledger.entries
      : Object.fromEntries(keys.slice(-MAX_LEDGER_ENTRIES).map((key) => [key, ledger.entries[key]]));
    try {
      this.localStore()?.setItem(this.metadataLedgerKey(peerId), JSON.stringify({ schemaVersion: 3, entries: trimmed }));
    } catch {
      try {
        const smaller = Object.fromEntries(Object.entries(trimmed).slice(-3000));
        this.localStore()?.setItem(this.metadataLedgerKey(peerId), JSON.stringify({ schemaVersion: 3, entries: smaller }));
      } catch {
        // A missing ledger causes a conservative first-run comparison next time.
      }
    }
  }

  private async readLocalMetadataVerified(path: string, expected: LanSyncMetadataSnapshot): Promise<{ bytes: Uint8Array; metadata: LanSyncMetadataSnapshot }> {
    const normalized = this.normalizePath(path);
    if (!normalized) throw new LanSyncProtocolError("unsafe_path");
    const before = await this.options.storage.statFile(normalized);
    if (!before || !metadataMatches(before, expected) || before.size > this.settings().maxFileBytes) throw new LanSyncProtocolError("precondition_failed", 409);
    const bytes = new Uint8Array(await this.options.storage.readBinary(normalized));
    const after = await this.options.storage.statFile(normalized);
    if (!after || !metadataMatches(after, expected) || bytes.byteLength !== after.size) throw new LanSyncProtocolError("precondition_failed", 409);
    return { bytes, metadata: metadataSnapshot(after) };
  }

  private async existingContentMatches(path: string, expected: LanSyncMetadataSnapshot, bytes: Uint8Array): Promise<LanSyncMetadataSnapshot | null> {
    const before = await this.options.storage.statFile(path);
    if (!before || before.size !== bytes.byteLength || before.size !== expected.size) return null;
    const current = new Uint8Array(await this.options.storage.readBinary(path));
    const after = await this.options.storage.statFile(path);
    if (!after || !metadataMatches(before, after) || current.byteLength !== bytes.byteLength) return null;
    for (let index = 0; index < bytes.byteLength; index += 1) {
      if (current[index] !== bytes[index]) return null;
    }
    return metadataSnapshot(after);
  }

  private async writeLocalMetadata(
    path: string,
    bytes: Uint8Array,
    expected: LanSyncMetadataSnapshot | null,
    source: LanSyncMetadataSnapshot,
    allowExistingSame = false
  ): Promise<LanSyncMetadataSnapshot> {
    const normalized = this.normalizePath(path);
    if (!normalized || bytes.byteLength !== source.size || bytes.byteLength > this.settings().maxFileBytes) throw new LanSyncProtocolError("unsafe_write");
    const current = await this.options.storage.statFile(normalized);
    if (expected === null) {
      if (current) {
        if (allowExistingSame) {
          const existing = await this.existingContentMatches(normalized, source, bytes);
          if (existing) return existing;
        }
        throw new LanSyncProtocolError("precondition_failed", 409);
      }
    } else if (!current || !metadataMatches(current, expected)) {
      throw new LanSyncProtocolError("precondition_failed", 409);
    }
    await this.options.storage.writeBinary(normalized, arrayBuffer(bytes), source.mtime);
    const written = await this.options.storage.statFile(normalized);
    if (!written || written.size !== bytes.byteLength) throw new Error("write_verification_failed");
    this.hashCache.delete(normalized);
    this.queueHashCacheSave();
    return metadataSnapshot(written);
  }

  private async deleteLocalMetadata(path: string, expected: LanSyncMetadataSnapshot): Promise<void> {
    const normalized = this.normalizePath(path);
    if (!normalized) throw new LanSyncProtocolError("unsafe_delete");
    const current = await this.options.storage.statFile(normalized);
    if (!current || !metadataMatches(current, expected)) throw new LanSyncProtocolError("precondition_failed", 409);
    await this.options.storage.deleteFile(normalized);
    this.hashCache.delete(normalized);
    this.queueHashCacheSave();
    if (await this.options.storage.statFile(normalized)) throw new Error("delete_verification_failed");
  }

  private async readRemoteMetadata(peer: LanSyncPeer, entry: LanSyncMetadataEntry, sessionId = ""): Promise<{ bytes: Uint8Array; metadata: LanSyncMetadataSnapshot }> {
    const expected = metadataSnapshot(entry);
    const response = await this.callPeer(peer, `${METADATA_ROUTE_PREFIX}/file/read`, { path: entry.path, expectedMetadata: expected, sessionId }, fileTransferTimeoutMs(entry.size));
    const metadata = this.parseMetadataSnapshot(response.metadata);
    if (response.path !== entry.path || !metadata || !metadataMatches(metadata, expected) || typeof response.data !== "string") throw new LanSyncProtocolError("invalid_file_response");
    const bytes = base64UrlToBytes(response.data);
    if (bytes.byteLength !== metadata.size || bytes.byteLength > this.settings().maxFileBytes) throw new LanSyncProtocolError("invalid_file_response");
    return { bytes, metadata };
  }

  private async writeRemoteMetadata(
    peer: LanSyncPeer,
    path: string,
    bytes: Uint8Array,
    expected: LanSyncMetadataSnapshot | null,
    source: LanSyncMetadataSnapshot,
    allowExistingSame = false,
    sessionId = ""
  ): Promise<LanSyncMetadataSnapshot> {
    const response = await this.callPeer(peer, `${METADATA_ROUTE_PREFIX}/file/write`, {
      path,
      expectedMetadata: expected,
      sourceMetadata: source,
      allowExistingSame,
      sessionId,
      data: bytesToBase64Url(bytes)
    }, fileTransferTimeoutMs(bytes.byteLength));
    const metadata = this.parseMetadataSnapshot(response.metadata);
    if (response.path !== path || !metadata || metadata.size !== bytes.byteLength) throw new Error("remote_write_verification_failed");
    return metadata;
  }

  private async deleteRemoteMetadata(peer: LanSyncPeer, path: string, expected: LanSyncMetadataSnapshot, sessionId = ""): Promise<void> {
    const response = await this.callPeer(peer, `${METADATA_ROUTE_PREFIX}/file/delete`, { path, expectedMetadata: expected, sessionId }, 45_000);
    const deletedMetadata = this.parseMetadataSnapshot(response.deletedMetadata);
    if (response.path !== path || response.deleted !== true || !deletedMetadata || !metadataMatches(deletedMetadata, expected)) {
      throw new Error("remote_delete_verification_failed");
    }
  }

  private async buildManifest(
    includeConfigFolder = this.settings().syncConfigFolder,
    onProgress?: (completed: number, total: number) => void
  ): Promise<LanSyncManifestEntry[]> {
    if (this.manifestBuild?.includeConfigFolder === includeConfigFolder) {
      const existing = await this.manifestBuild.promise;
      onProgress?.(this.scanValue.completed, this.scanValue.total);
      return existing.map((entry) => ({ ...entry }));
    }
    const promise = this.buildManifestOnce(includeConfigFolder, onProgress);
    this.manifestBuild = { includeConfigFolder, promise };
    try {
      return await promise;
    } finally {
      if (this.manifestBuild?.promise === promise) this.manifestBuild = null;
    }
  }

  private async buildManifestOnce(
    includeConfigFolder: boolean,
    onProgress?: (completed: number, total: number) => void
  ): Promise<LanSyncManifestEntry[]> {
    const maxFileBytes = this.settings().maxFileBytes;
    const rawFiles = (await this.options.storage.listFiles(includeConfigFolder))
      .map((file) => ({ ...file, originalPath: String(file.path || ""), path: this.normalizePath(file.path, includeConfigFolder) }))
      .sort((left, right) => left.originalPath.localeCompare(right.originalPath));
    const scanFiles: LanSyncScanFileActivity[] = [];
    const candidates: Array<Omit<LanSyncFileStat, "path"> & { path: string; scanIndex: number }> = [];
    for (const file of rawFiles) {
      let reason = "";
      if (!file.path || file.size < 0) reason = "unsafe-path";
      else if (file.size > maxFileBytes) reason = "too-large";
      else if (candidates.length >= MAX_MANIFEST_FILES) reason = "manifest-limit";
      const scanIndex = scanFiles.push({
        path: file.path || file.originalPath,
        state: reason ? "skipped" : "pending",
        size: Math.max(0, Number(file.size) || 0),
        reason
      }) - 1;
      if (!reason && file.path) candidates.push({ path: file.path, size: file.size, mtime: file.mtime, scanIndex });
    }
    this.scanValue = {
      id: randomId(12),
      phase: "scanning",
      completed: scanFiles.filter((file) => file.state === "skipped").length,
      total: scanFiles.length,
      cached: 0,
      hashed: 0,
      skipped: scanFiles.filter((file) => file.state === "skipped").length,
      error: "",
      files: scanFiles
    };
    let lastReportedAt = 0;
    const report = (force = false): void => {
      const now = this.now();
      if (!force && this.scanValue.completed !== this.scanValue.total && now - lastReportedAt < 60) return;
      lastReportedAt = now;
      onProgress?.(this.scanValue.completed, this.scanValue.total);
      if (this.progressValue.phase !== "syncing") {
        this.emit({
          ...defaultProgress("scanning"),
          active: this.progressValue.active || this.activePeers().length > 0,
          peerId: this.progressValue.peerId || this.activePeers()[0]?.deviceId || "",
          completed: this.scanValue.completed,
          total: this.scanValue.total
        });
      } else {
        this.emit({ ...this.progressValue });
      }
    };
    report(true);
    try {
      const entries = await mapWithConcurrency(candidates, HASH_CONCURRENCY, async (file) => {
        const activity = this.scanValue.files[file.scanIndex];
        const signature = `${file.mtime}:${file.size}`;
        const cached = this.hashCache.get(file.path);
        let hash = cached?.signature === signature ? cached.hash : "";
        if (hash) {
          activity.state = "cached";
          this.scanValue.cached += 1;
        } else {
          activity.state = "hashing";
          hash = await sha256Bytes(await this.options.storage.readBinary(file.path));
          this.hashCache.set(file.path, { signature, hash });
          activity.state = "complete";
          this.scanValue.hashed += 1;
        }
        this.scanValue.completed += 1;
        if (this.scanValue.completed % 250 === 0) this.queueHashCacheSave();
        report();
        return { path: file.path, size: file.size, mtime: file.mtime, hash };
      });
      this.scanValue.phase = "complete";
      this.scanValue.completed = this.scanValue.total;
      this.queueHashCacheSave();
      report(true);
      return entries;
    } catch (error) {
      this.scanValue.phase = "error";
      this.scanValue.error = safeErrorCode(error);
      const hashing = this.scanValue.files.find((file) => file.state === "hashing");
      if (hashing) {
        hashing.state = "error";
        hashing.reason = this.scanValue.error;
      }
      report(true);
      throw error;
    }
  }

  private parseManifest(value: unknown, includeConfigFolder: boolean): LanSyncManifestEntry[] {
    if (!Array.isArray(value) || value.length > MAX_MANIFEST_FILES) throw new LanSyncProtocolError("invalid_manifest");
    const entries: LanSyncManifestEntry[] = [];
    for (const item of value) {
      if (!isRecord(item)) throw new LanSyncProtocolError("invalid_manifest");
      const path = this.normalizePath(item.path, includeConfigFolder);
      const size = Number(item.size);
      const mtime = Number(item.mtime);
      const hash = typeof item.hash === "string" ? item.hash : "";
      if (!path || !Number.isFinite(size) || size < 0 || size > this.settings().maxFileBytes || !Number.isFinite(mtime) || !/^[A-Za-z0-9_-]{32,64}$/.test(hash)) {
        throw new LanSyncProtocolError("invalid_manifest");
      }
      entries.push({ path, size, mtime, hash });
    }
    return entries;
  }

  private ledgerKey(peerId: string): string {
    return `cancip.lan-sync.ledger.v1.${this.identity?.vaultId ?? "unknown"}.${peerId}`;
  }

  private loadLedger(peerId: string): LanSyncLedger {
    try {
      const raw = this.localStore()?.getItem(this.ledgerKey(peerId));
      if (!raw) return { schemaVersion: 1, entries: {} };
      const parsed = safeJsonObject(raw);
      if (parsed.schemaVersion !== 1 || !isRecord(parsed.entries)) return { schemaVersion: 1, entries: {} };
      const entries: Record<string, string> = {};
      for (const [path, hash] of Object.entries(parsed.entries).slice(-MAX_LEDGER_ENTRIES)) {
        const normalized = this.normalizePath(path);
        if (normalized && typeof hash === "string" && /^[A-Za-z0-9_-]{32,64}$/.test(hash)) entries[normalized] = hash;
      }
      return { schemaVersion: 1, entries };
    } catch {
      return { schemaVersion: 1, entries: {} };
    }
  }

  private saveLedger(peerId: string, ledger: LanSyncLedger): void {
    const keys = Object.keys(ledger.entries);
    const trimmed = keys.length <= MAX_LEDGER_ENTRIES
      ? ledger.entries
      : Object.fromEntries(keys.slice(-MAX_LEDGER_ENTRIES).map((key) => [key, ledger.entries[key]]));
    try {
      this.localStore()?.setItem(this.ledgerKey(peerId), JSON.stringify({ schemaVersion: 1, entries: trimmed }));
    } catch {
      try {
        const smaller = Object.fromEntries(Object.entries(trimmed).slice(-3000));
        this.localStore()?.setItem(this.ledgerKey(peerId), JSON.stringify({ schemaVersion: 1, entries: smaller }));
      } catch {
        // Synchronization remains safe; the next run may be more conservative.
      }
    }
  }

  private async readLocalVerified(path: string, expectedHash: string): Promise<Uint8Array> {
    const normalized = this.normalizePath(path);
    if (!normalized) throw new LanSyncProtocolError("unsafe_path");
    const before = await this.options.storage.statFile(normalized);
    if (!before || before.size > this.settings().maxFileBytes) throw new LanSyncProtocolError("precondition_failed", 409);
    const bytes = new Uint8Array(await this.options.storage.readBinary(normalized));
    const after = await this.options.storage.statFile(normalized);
    const beforeSignature = `${before.mtime}:${before.size}`;
    const afterSignature = after ? `${after.mtime}:${after.size}` : "";
    if (!after || beforeSignature !== afterSignature || bytes.byteLength !== after.size) throw new LanSyncProtocolError("precondition_failed", 409);
    const cached = this.hashCache.get(normalized);
    if (cached?.signature !== afterSignature || cached.hash !== expectedHash) {
      if (await sha256Bytes(bytes) !== expectedHash) throw new LanSyncProtocolError("precondition_failed", 409);
      this.hashCache.set(normalized, { signature: afterSignature, hash: expectedHash });
      this.queueHashCacheSave();
    }
    return bytes;
  }

  private async writeLocal(path: string, bytes: Uint8Array, expectedHash: string | null, suppliedHash: string, contentVerified = false): Promise<void> {
    const normalized = this.normalizePath(path);
    if (!normalized || bytes.byteLength > this.settings().maxFileBytes || !/^[A-Za-z0-9_-]{32,64}$/.test(suppliedHash)) throw new LanSyncProtocolError("unsafe_write", 400);
    if (!contentVerified && await sha256Bytes(bytes) !== suppliedHash) throw new LanSyncProtocolError("unsafe_write", 400);
    const current = await this.options.storage.statFile(normalized);
    if (expectedHash === null) {
      if (current) throw new LanSyncProtocolError("precondition_failed", 409);
    } else {
      if (!current) throw new LanSyncProtocolError("precondition_failed", 409);
      const signature = `${current.mtime}:${current.size}`;
      const cached = this.hashCache.get(normalized);
      const currentHash = cached?.signature === signature
        ? cached.hash
        : await sha256Bytes(await this.options.storage.readBinary(normalized));
      if (currentHash !== expectedHash) throw new LanSyncProtocolError("precondition_failed", 409);
      if (cached?.signature !== signature) this.hashCache.set(normalized, { signature, hash: currentHash });
    }
    await this.options.storage.writeBinary(normalized, arrayBuffer(bytes));
    const written = await this.options.storage.statFile(normalized);
    if (!written || written.size !== bytes.byteLength) throw new Error("write_verification_failed");
    this.hashCache.set(normalized, { signature: `${written.mtime}:${written.size}`, hash: suppliedHash });
    this.queueHashCacheSave();
  }

  private async writeLocalIfMissingOrSame(path: string, bytes: Uint8Array, hash: string): Promise<void> {
    const stat = await this.options.storage.statFile(path);
    if (stat) {
      const signature = `${stat.mtime}:${stat.size}`;
      const cached = this.hashCache.get(path);
      const currentHash = cached?.signature === signature ? cached.hash : await sha256Bytes(await this.options.storage.readBinary(path));
      if (currentHash === hash) {
        if (cached?.signature !== signature) {
          this.hashCache.set(path, { signature, hash });
          this.queueHashCacheSave();
        }
        return;
      }
      throw new LanSyncProtocolError("conflict_copy_collision", 409);
    }
    await this.writeLocal(path, bytes, null, hash, true);
  }

  private async deleteLocal(path: string, expectedHash: string): Promise<void> {
    const normalized = this.normalizePath(path);
    if (!normalized || !/^[A-Za-z0-9_-]{32,64}$/.test(expectedHash)) throw new LanSyncProtocolError("unsafe_delete");
    const current = await this.options.storage.statFile(normalized);
    const signature = current ? `${current.mtime}:${current.size}` : "";
    const cached = current ? this.hashCache.get(normalized) : null;
    const currentHash = !current ? "" : cached?.signature === signature ? cached.hash : await sha256Bytes(await this.options.storage.readBinary(normalized));
    if (!current || currentHash !== expectedHash) {
      throw new LanSyncProtocolError("precondition_failed", 409);
    }
    await this.options.storage.deleteFile(normalized);
    this.hashCache.delete(normalized);
    if (await this.options.storage.statFile(normalized)) throw new Error("delete_verification_failed");
  }

  private async readRemote(peer: LanSyncPeer, entry: LanSyncManifestEntry): Promise<Uint8Array> {
    const response = await this.callPeer(peer, "/file/read", { path: entry.path, expectedHash: entry.hash }, fileTransferTimeoutMs(entry.size));
    if (response.path !== entry.path || response.hash !== entry.hash || typeof response.data !== "string") throw new LanSyncProtocolError("invalid_file_response");
    const bytes = base64UrlToBytes(response.data);
    if (bytes.byteLength !== entry.size || bytes.byteLength > this.settings().maxFileBytes || await sha256Bytes(bytes) !== entry.hash) throw new LanSyncProtocolError("invalid_file_response");
    return bytes;
  }

  private async writeRemote(peer: LanSyncPeer, path: string, bytes: Uint8Array, expectedHash: string | null, hash: string): Promise<void> {
    const response = await this.callPeer(peer, "/file/write", {
      path,
      expectedHash,
      hash,
      data: bytesToBase64Url(bytes)
    }, fileTransferTimeoutMs(bytes.byteLength));
    if (response.hash !== hash) throw new Error("remote_write_verification_failed");
  }

  private async writeRemoteIfMissingOrSame(peer: LanSyncPeer, path: string, bytes: Uint8Array, hash: string): Promise<void> {
    try {
      await this.writeRemote(peer, path, bytes, null, hash);
    } catch (error) {
      if (safeErrorCode(error) !== "precondition_failed") throw error;
      const response = await this.callPeer(peer, "/file/read", { path, expectedHash: hash }, fileTransferTimeoutMs(bytes.byteLength));
      if (response.hash !== hash) throw error;
    }
  }

  private async deleteRemote(peer: LanSyncPeer, path: string, expectedHash: string): Promise<void> {
    const response = await this.callPeer(peer, "/file/delete", { path, expectedHash }, 45_000);
    if (response.path !== path || response.deletedHash !== expectedHash || response.deleted !== true) {
      throw new Error("remote_delete_verification_failed");
    }
  }

  private async callPeer(peer: LanSyncPeer, route: string, payload: Record<string, unknown>, timeoutMs = 8000): Promise<Record<string, unknown>> {
    if (!this.identity) throw new Error("identity_unavailable");
    const path = `${API_PREFIX}${route}`;
    const body = await encryptLanSyncPayload(this.identity.secret, payload);
    const headers = await authHeaders(this.identity, this.deviceId, "POST", path, body, this.now());
    let lastError: unknown = null;
    for (const address of peer.addresses) {
      if (!isPrivateLanAddress(address)) continue;
      const host = address.includes(":") ? `[${address}]` : address;
      try {
        const response = await withTimeout(this.options.httpRequest({
          url: `http://${host}:${peer.port}${path}`,
          method: "POST",
          headers,
          body,
          timeoutMs
        }), timeoutMs);
        if (response.status < 200 || response.status >= 300) {
          let code = "peer_rejected";
          try {
            const errorBody = safeJsonObject(response.text);
            if (typeof errorBody.error === "string") code = errorBody.error;
          } catch {
            // Keep the generic error code.
          }
          throw new LanSyncProtocolError(code, response.status);
        }
        const decrypted = await decryptLanSyncPayload(this.identity.secret, response.text);
        peer.verifiedAt = this.now();
        peer.consecutiveFailures = 0;
        peer.lastFailureAt = 0;
        peer.addresses = new Set([address, ...peer.addresses].slice(0, PEER_MAX_ADDRESS_HISTORY));
        return decrypted;
      } catch (error) {
        lastError = error;
      }
    }
    if (lastError instanceof LanSyncProtocolError) throw lastError;
    throw new Error(`peer_unreachable:${safeErrorCode(lastError)}`);
  }

  private allowedByRateLimit(key: string): boolean {
    const now = this.now();
    const current = this.rateByClient.get(key);
    if (!current || now - current.startedAt >= RATE_WINDOW_MS) {
      this.rateByClient.set(key, { startedAt: now, count: 1 });
      return true;
    }
    current.count += 1;
    return current.count <= RATE_LIMIT;
  }

  private async handleServerRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    let authenticated = false;
    let inboundActivityIndex: number | null = null;
    let inboundDeviceId = "";
    try {
      if (!this.identity || request.method !== "POST") throw new LanSyncProtocolError("not_found", 404);
      const url = new URL(request.url ?? "/", "http://cancip-lan.local");
      const path = url.pathname;
      if (!path.startsWith(`${API_PREFIX}/`)) throw new LanSyncProtocolError("not_found", 404);
      const maxBody = Math.min(HARD_MAX_REQUEST_BYTES, this.settings().maxFileBytes * 2 + 2 * 1024 * 1024);
      const body = await readBody(request, maxBody);
      const headers: Record<string, string> = {
        "x-cancip-lan-version": headerValue(request, "x-cancip-lan-version"),
        "x-cancip-vault": headerValue(request, "x-cancip-vault"),
        "x-cancip-device": headerValue(request, "x-cancip-device"),
        "x-cancip-timestamp": headerValue(request, "x-cancip-timestamp"),
        "x-cancip-nonce": headerValue(request, "x-cancip-nonce"),
        "x-cancip-signature": headerValue(request, "x-cancip-signature")
      };
      const deviceId = await verifyLanSyncRequest({
        secret: this.identity.secret,
        vaultId: this.identity.vaultId,
        method: request.method,
        path,
        body,
        headers,
        replayCache: this.replayCache,
        now: this.now()
      });
      authenticated = true;
      const remoteAddress = normalizeRemoteAddress(request.socket.remoteAddress ?? "");
      if (!this.allowedByRateLimit(`${remoteAddress}:${deviceId}`)) throw new LanSyncProtocolError("rate_limited", 429);
      const payload = await decryptLanSyncPayload(this.identity.secret, body);
      if (
        path === `${API_PREFIX}/manifest`
        || path === `${API_PREFIX}/file/read`
        || path === `${API_PREFIX}/file/write`
        || path === `${API_PREFIX}/file/delete`
        || path === `${API_PREFIX}/manifest/metadata`
        || path === `${API_PREFIX}/manifest/metadata/paths`
        || path === `${API_PREFIX}/metadata/session/start`
        || path === `${API_PREFIX}/metadata/session/finish`
        || path === `${API_PREFIX}/metadata/file/read`
        || path === `${API_PREFIX}/metadata/file/write`
        || path === `${API_PREFIX}/metadata/file/delete`
        || path.startsWith(`${API_PREFIX}/metadata/v2/`)
        || path.startsWith(`${API_PREFIX}/metadata/v3/`)
      ) {
        throw new LanSyncProtocolError("peer_upgrade_required", 426);
      }
      this.markInboundPeer(deviceId, remoteAddress, path);
      inboundDeviceId = deviceId;
      inboundActivityIndex = this.beginInboundFileActivity(deviceId, path, payload);
      let result: Record<string, unknown>;
      if (path === `${API_PREFIX}/ping`) {
        const peer = this.peers.get(deviceId);
        if (peer) {
          this.applyRemoteSyncSignal(peer, payload);
          this.emitPeerConnectionStage(peer);
        }
        result = {
          ok: true,
          protocolVersion: PROTOCOL_VERSION,
          deviceId: this.deviceId,
          policy: this.policy(),
          messages: this.pendingMessagesFor(deviceId),
          ...this.syncSignalPayload()
        };
      } else if (path === `${API_PREFIX}${METADATA_ROUTE_PREFIX}/manifest`) {
        const policy = this.policy();
        const files = await this.buildMetadataManifest(policy.syncConfigFolder && payload.syncConfigFolder === true);
        this.recordFullScan();
        this.emit({
          ...defaultProgress("scanning"),
          stage: "planning",
          active: true,
          peerId: deviceId,
          completed: this.scanValue.completed,
          total: this.scanValue.total
        });
        result = {
          files,
          policy
        };
      } else if (path === `${API_PREFIX}${METADATA_ROUTE_PREFIX}/manifest/paths`) {
        const policy = this.policy();
        const paths = Array.isArray(payload.paths) ? payload.paths.filter((value): value is string => typeof value === "string") : [];
        if (paths.length > MAX_DIRTY_PATHS) throw new LanSyncProtocolError("too_many_dirty_paths", 413);
        const files = await this.buildMetadataManifestForPaths(paths, policy.syncConfigFolder && payload.syncConfigFolder === true);
        this.emit({
          ...defaultProgress("scanning"),
          stage: "planning",
          active: true,
          peerId: deviceId,
          completed: this.scanValue.completed,
          total: this.scanValue.total
        });
        result = {
          files,
          policy
        };
      } else if (path === `${API_PREFIX}${METADATA_ROUTE_PREFIX}/bootstrap/hashes`) {
        const policy = this.policy();
        const includeConfigFolder = policy.syncConfigFolder && payload.syncConfigFolder === true;
        const expected = this.parseMetadataManifest(payload.files, includeConfigFolder);
        result = { files: await this.buildInboundMetadataHashManifest(expected, includeConfigFolder, deviceId) };
      } else if (path === `${API_PREFIX}${METADATA_ROUTE_PREFIX}/session/start`) {
        result = await this.handleMetadataSessionStart(deviceId, payload);
      } else if (path === `${API_PREFIX}${METADATA_ROUTE_PREFIX}/session/finish`) {
        result = await this.handleMetadataSessionFinish(deviceId, payload);
      } else if (path === `${API_PREFIX}${METADATA_ROUTE_PREFIX}/file/read`) {
        result = await this.handleReadMetadataFile(payload);
      } else if (path === `${API_PREFIX}${METADATA_ROUTE_PREFIX}/file/write`) {
        result = await this.handleWriteMetadataFile(payload);
      } else if (path === `${API_PREFIX}${METADATA_ROUTE_PREFIX}/file/delete`) {
        result = await this.handleDeleteMetadataFile(payload);
      } else if (path === `${API_PREFIX}/attachment/read`) {
        result = await this.handleReadQueuedAttachment(deviceId, payload);
      } else if (path === `${API_PREFIX}/attachment/write`) {
        result = await this.handleWriteAttachment(payload);
      } else if (path === `${API_PREFIX}/message/send`) {
        result = await this.handleIncomingMessage(deviceId, payload);
      } else if (path === `${API_PREFIX}/message/ack`) {
        result = await this.handleMessageAcknowledgement(deviceId, payload);
      } else {
        throw new LanSyncProtocolError("not_found", 404);
      }
      this.finishInboundFileActivity(deviceId, inboundActivityIndex, true);
      sendText(response, 200, await encryptLanSyncPayload(this.identity.secret, result));
    } catch (error) {
      this.finishInboundFileActivity(inboundDeviceId, inboundActivityIndex, false);
      const protocol = error instanceof LanSyncProtocolError ? error : new LanSyncProtocolError(safeErrorCode(error), 500);
      sendText(response, protocol.status, JSON.stringify({ ok: false, error: authenticated ? protocol.code : "request_rejected" }));
    }
  }

  private async handleMetadataSessionStart(deviceId: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const sessionId = typeof payload.sessionId === "string" && /^[A-Za-z0-9_-]{12,96}$/.test(payload.sessionId) ? payload.sessionId : "";
    const rawFiles = Array.isArray(payload.files) ? payload.files : [];
    const total = Number(payload.total);
    const bytesTotal = Number(payload.bytesTotal);
    const coordinatorUploads = Number(payload.uploads);
    const coordinatorDownloads = Number(payload.downloads);
    if (!sessionId || !Number.isSafeInteger(total) || total < 0 || total !== rawFiles.length || total > MAX_MANIFEST_FILES
      || !Number.isSafeInteger(bytesTotal) || bytesTotal < 0
      || !Number.isSafeInteger(coordinatorUploads) || coordinatorUploads < 0
      || !Number.isSafeInteger(coordinatorDownloads) || coordinatorDownloads < 0) {
      throw new LanSyncProtocolError("invalid_sync_session");
    }
    const mirrorAction = (action: unknown): LanSyncFileAction | null => {
      if (action === "push") return "pull";
      if (action === "pull") return "push";
      if (action === "delete-local") return "delete-remote";
      if (action === "delete-remote") return "delete-local";
      return null;
    };
    const files: LanSyncFileActivity[] = rawFiles.map((item) => {
      if (!isRecord(item)) throw new LanSyncProtocolError("invalid_sync_session");
      const path = this.normalizePath(item.path, true);
      const action = mirrorAction(item.action);
      const size = Number(item.size);
      if (!path || !action || !Number.isSafeInteger(size) || size < 0 || size > this.settings().maxFileBytes) throw new LanSyncProtocolError("invalid_sync_session");
      return { path, action, state: "pending", size };
    });
    this.inboundSession = {
      id: sessionId,
      deviceId,
      bytesTotal,
      uploads: coordinatorDownloads,
      downloads: coordinatorUploads
    };
    this.activityFiles = files;
    this.activityUpdatedAt = this.now();
    this.emit({
      ...defaultProgress(files.length ? "syncing" : "complete"),
      active: true,
      peerId: deviceId,
      total: files.length,
      bytesTotal,
      uploads: coordinatorDownloads,
      uploadCompleted: 0,
      downloads: coordinatorUploads,
      downloadCompleted: 0
    });
    return { ok: true, sessionId };
  }

  private async handleMetadataSessionFinish(deviceId: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const sessionId = typeof payload.sessionId === "string" ? payload.sessionId : "";
    const session = this.inboundSession;
    if (!session || session.id !== sessionId || session.deviceId !== deviceId) throw new LanSyncProtocolError("invalid_sync_session", 409);
    const commits = Array.isArray(payload.commits) ? payload.commits : [];
    if (commits.length > MAX_MANIFEST_FILES) throw new LanSyncProtocolError("invalid_sync_session");
    const ledger = this.loadMetadataLedger(deviceId);
    for (const item of commits) {
      if (!isRecord(item)) continue;
      const path = this.normalizePath(item.path, true);
      if (!path) continue;
      const coordinator = item.coordinator === null ? null : this.parseMetadataSnapshot(item.coordinator);
      const peer = item.peer === null ? null : this.parseMetadataSnapshot(item.peer);
      if ((item.coordinator !== null && !coordinator) || (item.peer !== null && !peer)) continue;
      const current = await this.options.storage.statFile(path);
      if (coordinator === null && peer === null) {
        if (!current) delete ledger.entries[path];
        continue;
      }
      if (coordinator && peer && current && metadataMatches(current, peer)) {
        ledger.entries[path] = { local: peer, remote: coordinator };
      }
    }
    this.saveMetadataLedger(deviceId, ledger);
    const retryPaths = new Set(
      (Array.isArray(payload.retryPaths) ? payload.retryPaths : [])
        .map((path) => this.normalizePath(path, true))
        .filter((path): path is string => Boolean(path))
        .slice(0, MAX_DIRTY_PATHS)
    );
    const acknowledgedDirtyPaths = this.parseDirtyPaths(payload.acknowledgedDirtyPaths);
    for (const [path, generation] of acknowledgedDirtyPaths) {
      if ((this.dirtyPaths.get(path) ?? 0) <= generation) this.dirtyPaths.delete(path);
    }
    const acknowledgedFullSyncRequestId = typeof payload.acknowledgedFullSyncRequestId === "string" ? payload.acknowledgedFullSyncRequestId : "";
    if (acknowledgedFullSyncRequestId && this.fullSyncRequestId === acknowledgedFullSyncRequestId) {
      this.fullSyncRequested = false;
      this.recordFullScan();
    }
    const success = payload.success === true;
    if (success) {
      for (const file of this.activityFiles) {
        if (retryPaths.has(file.path)) file.state = "deferred";
        else if (file.state !== "error") file.state = "complete";
      }
    } else {
      for (const file of this.activityFiles) if (file.state === "pending" || file.state === "syncing") file.state = "error";
    }
    const completed = this.activityFiles.filter((file) => file.state === "complete" || file.state === "deferred").length;
    const uploadCompleted = this.activityFiles.filter((file) => file.action === "push" && file.state === "complete").length;
    const downloadCompleted = this.activityFiles.filter((file) => file.action === "pull" && file.state === "complete").length;
    const bytesTransferred = this.activityFiles.filter((file) => file.state === "complete").reduce((sum, file) => sum + file.size, 0);
    this.emit({
      ...defaultProgress(success ? "complete" : "error"),
      active: true,
      peerId: deviceId,
      completed,
      total: this.activityFiles.length,
      bytesTransferred,
      bytesTotal: session.bytesTotal,
      changed: completed,
      uploads: session.uploads,
      uploadCompleted,
      downloads: session.downloads,
      downloadCompleted,
      error: success ? "" : "inbound_transfer_failed"
    });
    this.activityUpdatedAt = this.now();
    this.inboundSession = null;
    return { ok: true, sessionId, committed: commits.length };
  }

  private async handleReadMetadataFile(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const path = this.normalizePath(payload.path);
    const expected = this.parseMetadataSnapshot(payload.expectedMetadata);
    if (!path || !expected) throw new LanSyncProtocolError("unsafe_path");
    const read = await this.readLocalMetadataVerified(path, expected);
    return { path, metadata: read.metadata, data: bytesToBase64Url(read.bytes) };
  }

  private async handleWriteMetadataFile(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const path = this.normalizePath(payload.path);
    const expectsMissing = payload.expectedMetadata === null;
    const expected = expectsMissing ? null : this.parseMetadataSnapshot(payload.expectedMetadata);
    const source = this.parseMetadataSnapshot(payload.sourceMetadata);
    const encoded = typeof payload.data === "string" ? payload.data : "";
    if (!path || (!expectsMissing && !expected) || !source) throw new LanSyncProtocolError("unsafe_write");
    const bytes = base64UrlToBytes(encoded);
    if (bytes.byteLength !== source.size || bytes.byteLength > this.settings().maxFileBytes) throw new LanSyncProtocolError("invalid_file_content");
    const metadata = await this.writeLocalMetadata(path, bytes, expected, source, payload.allowExistingSame === true);
    return { ok: true, path, metadata };
  }

  private async handleDeleteMetadataFile(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const path = this.normalizePath(payload.path);
    const expected = this.parseMetadataSnapshot(payload.expectedMetadata);
    if (!path || !expected) throw new LanSyncProtocolError("unsafe_delete");
    await this.deleteLocalMetadata(path, expected);
    return { ok: true, deleted: true, path, deletedMetadata: expected };
  }

  private async handleReadFile(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const path = this.normalizePath(payload.path);
    const expectedHash = typeof payload.expectedHash === "string" ? payload.expectedHash : "";
    if (!path || !/^[A-Za-z0-9_-]{32,64}$/.test(expectedHash)) throw new LanSyncProtocolError("unsafe_path");
    const stat = await this.options.storage.statFile(path);
    if (!stat || stat.size > this.settings().maxFileBytes) throw new LanSyncProtocolError("file_unavailable", 404);
    const bytes = await this.readLocalVerified(path, expectedHash);
    return { path, hash: expectedHash, mtime: stat.mtime, size: bytes.byteLength, data: bytesToBase64Url(bytes) };
  }

  private async handleWriteFile(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const path = this.normalizePath(payload.path);
    const expectedHash = payload.expectedHash === null ? null : typeof payload.expectedHash === "string" ? payload.expectedHash : undefined;
    const hash = typeof payload.hash === "string" ? payload.hash : "";
    const encoded = typeof payload.data === "string" ? payload.data : "";
    if (!path || expectedHash === undefined || (expectedHash !== null && !/^[A-Za-z0-9_-]{32,64}$/.test(expectedHash)) || !/^[A-Za-z0-9_-]{32,64}$/.test(hash)) {
      throw new LanSyncProtocolError("unsafe_write");
    }
    const bytes = base64UrlToBytes(encoded);
    if (bytes.byteLength > this.settings().maxFileBytes || await sha256Bytes(bytes) !== hash) throw new LanSyncProtocolError("invalid_file_content");
    await this.writeLocal(path, bytes, expectedHash, hash, true);
    return { ok: true, path, hash, size: bytes.byteLength };
  }

  private async handleDeleteFile(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const path = this.normalizePath(payload.path);
    const expectedHash = typeof payload.expectedHash === "string" ? payload.expectedHash : "";
    if (!path || !/^[A-Za-z0-9_-]{32,64}$/.test(expectedHash)) throw new LanSyncProtocolError("unsafe_delete");
    await this.deleteLocal(path, expectedHash);
    return { ok: true, deleted: true, path, deletedHash: expectedHash };
  }

  private async handleWriteAttachment(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const attachmentId = typeof payload.attachmentId === "string" ? payload.attachmentId : "";
    const name = safeLanInboxName(payload.name);
    const path = normalizeLanInboxAttachmentPath(`${LAN_INBOX_ROOT}/${attachmentId}/${name}`);
    const type = String(payload.type || "application/octet-stream").slice(0, 128);
    const hash = typeof payload.hash === "string" ? payload.hash : "";
    const encoded = typeof payload.data === "string" ? payload.data : "";
    if (!path || !/^[A-Za-z0-9_-]{32,64}$/.test(hash)) throw new LanSyncProtocolError("unsafe_attachment");
    const bytes = base64UrlToBytes(encoded);
    if (bytes.byteLength > this.settings().maxFileBytes || await sha256Bytes(bytes) !== hash) throw new LanSyncProtocolError("invalid_file_content");
    if (await this.options.storage.exists(path)) throw new LanSyncProtocolError("attachment_exists", 409);
    await this.options.storage.ensureFolder(path.split("/").slice(0, -1).join("/"));
    await this.options.storage.writeBinary(path, arrayBuffer(bytes));
    const written = await this.options.storage.statFile(path);
    if (!written || written.size !== bytes.byteLength) throw new Error("write_verification_failed");
    const expiresAt = new Date(this.now() + this.settings().inboxRetentionHours * 60 * 60_000).toISOString();
    return { name, type, path, size: bytes.byteLength, hash, temporary: true, expiresAt };
  }
}
