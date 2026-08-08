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
  writeBinary(path: string, data: ArrayBuffer): Promise<void>;
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

export type LanSyncProgress = {
  phase: LanSyncProgressPhase;
  active: boolean;
  peerId: string;
  peerCount: number;
  completed: number;
  total: number;
  bytesTransferred: number;
  bytesTotal: number;
  changed: number;
  conflicts: number;
  error: string;
};

export type LanSyncFileAction = "push" | "pull" | "delete-local" | "delete-remote" | "conflict";

export type LanSyncFileActivity = {
  path: string;
  action: LanSyncFileAction;
  state: "pending" | "syncing" | "complete" | "error";
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

export type LanSyncActivitySnapshot = {
  progress: LanSyncProgress;
  files: LanSyncFileActivity[];
  scan: LanSyncScanActivity;
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
  winner?: "local" | "remote";
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
  policy: LanSyncPolicy;
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
const MULTICAST_ADDRESS = "239.255.67.19";
const DISCOVERY_PORT = 43189;
const ANNOUNCE_INTERVAL_MS = 750;
const PEER_SWEEP_INTERVAL_MS = 350;
const PEER_PROBE_INTERVAL_MS = 900;
const PEER_MIN_STABLE_GRACE_MS = 30_000;
const PEER_MAX_ADDRESS_HISTORY = 8;
const REMEMBERED_PEER_MAX_AGE_MS = 30 * 24 * 60 * 60_000;
const SYNC_MIN_INTERVAL_MS = 400;
const HASH_CONCURRENCY = 12;
const TRANSFER_CONCURRENCY = 6;
const MAX_CLOCK_SKEW_MS = 120_000;
const REPLAY_TTL_MS = 180_000;
const MAX_MANIFEST_FILES = 100_000;
const MAX_LEDGER_ENTRIES = 50_000;
const HARD_MAX_REQUEST_BYTES = 960 * 1024 * 1024;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 1200;
const DEVICE_ID_STORAGE_KEY = "cancip.lan-sync.device-id.v1";
const HASH_CACHE_STORAGE_PREFIX = "ntfy.lan-sync.hash-cache.v1";
const LAN_INBOX_ROOT = ".trash/ntfy-inbox";
const MAX_MESSAGE_TEXT_LENGTH = 32_000;
const MAX_MESSAGE_ATTACHMENTS = 12;

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
        actions.push({ kind: "conflict", path, local: localEntry, remote: remoteEntry, winner: manifestWinner(localEntry, remoteEntry, localPolicy.conflictRule) });
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

export function buildLanConflictPath(path: string, losingDeviceId: string, losingHash: string, options: LanSyncPathOptions = {}): string {
  const normalized = normalizeLanSyncPath(path, options);
  if (!normalized) throw new LanSyncProtocolError("unsafe_path");
  const slash = normalized.lastIndexOf("/");
  const folder = slash >= 0 ? normalized.slice(0, slash + 1) : "";
  const name = slash >= 0 ? normalized.slice(slash + 1) : normalized;
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : "";
  const device = losingDeviceId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 8) || "peer";
  const hash = losingHash.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 8) || "changed";
  return `${folder}${stem} (LAN conflict ${device} ${hash})${extension}`;
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
  return {
    phase,
    active: false,
    peerId: "",
    peerCount: 0,
    completed: 0,
    total: 0,
    bytesTransferred: 0,
    bytesTotal: 0,
    changed: 0,
    conflicts: 0,
    error: ""
  };
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
  private intervals: Array<ReturnType<typeof setInterval>> = [];
  private syncTimer: ReturnType<typeof setTimeout> | null = null;
  private syncRunning = false;
  private syncQueued = false;
  private syncForced = false;
  private syncRequestId = "";
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

  activity(): LanSyncActivitySnapshot {
    return {
      progress: { ...this.progressValue },
      files: this.activityFiles.map((file) => ({ ...file })),
      scan: {
        ...this.scanValue,
        files: this.scanValue.files.map((file) => ({ ...file }))
      }
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
          lastSeenAt: Math.max(peer.lastSeenAt, peer.verifiedAt)
        };
      })
      .filter((peer) => peer.verified)
      .sort((left, right) => left.deviceId.localeCompare(right.deviceId));
  }

  async sendMessage(deviceId: string, input: { id?: string; text?: string; attachments?: LanSyncAttachment[] }): Promise<{ id: string }> {
    const peer = this.activePeers().find((candidate) => candidate.deviceId === deviceId);
    if (!peer) throw new Error("peer_unavailable");
    const message = this.normalizeMessagePayload(input, this.deviceId);
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
    this.activityFiles = [{ path: `${LAN_INBOX_ROOT}/${attachmentId}/${name}`, action: "push", state: "syncing", size: bytes.byteLength }];
    this.activityUpdatedAt = this.now();
    this.emit({ ...defaultProgress("syncing"), active: true, peerId: peer.deviceId, total: 1, bytesTotal: bytes.byteLength });
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
      this.emit({ ...defaultProgress("complete"), active: true, peerId: peer.deviceId, completed: 1, total: 1, bytesTransferred: bytes.byteLength, bytesTotal: bytes.byteLength, changed: 1 });
      return attachment;
    } catch (error) {
      this.activityFiles[0].state = "error";
      this.emit({ ...defaultProgress("error"), active: true, peerId: peer.deviceId, total: 1, bytesTotal: bytes.byteLength, error: safeErrorCode(error) });
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
        if (this.settings().autoDiscovery) this.requestSync();
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
    this.activityFiles = [];
    this.scanValue = this.emptyScanActivity();
    this.activityUpdatedAt = this.now();
    this.emit(defaultProgress("stopped"));
  }

  notifyVaultChange(path: string): void {
    const normalized = this.normalizePath(path);
    if (!normalized) return;
    this.hashCache.delete(normalized);
    this.queueHashCacheSave();
    if (!this.settings().autoDiscovery) return;
    this.syncRequestId = randomId(18);
    this.scheduleSync(45, true);
  }

  requestSync(): void {
    // A mobile Obsidian client cannot host the HTTP endpoint. Keep a pending
    // request in the authenticated ping response so its next heartbeat starts
    // a forced scan instead of silently discarding a desktop-side request.
    this.syncRequestId = randomId(18);
    this.scheduleSync(0, true);
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
        policy: passivePeerPolicy()
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
    if (firstVerifiedConnection && route.endsWith("/ping")) this.syncRequestId = randomId(18);
    const transfer = route.includes("/file/") || route.includes("/attachment/");
    if (transfer) this.lastTransferAt = this.now();
    if (transfer || (this.progressValue.phase !== "scanning" && this.progressValue.phase !== "syncing")) {
      this.emit({
        ...defaultProgress(transfer ? "syncing" : "connected"),
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

  private async verifyPeer(peer: LanSyncPeer): Promise<void> {
    const now = this.now();
    const minimumProbeInterval = Math.max(300, PEER_PROBE_INTERVAL_MS - 100);
    if (!this.runningValue || !peer.canHost || peer.probing || now - peer.lastProbeAt < minimumProbeInterval || !peer.addresses.size) return;
    peer.probing = true;
    peer.lastProbeAt = now;
    const firstVerifiedConnection = peer.verifiedAt <= 0;
    try {
      const response = await this.callPeer(peer, "/ping", {});
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
      const remoteSyncRequestId = typeof response.syncRequestId === "string" && /^[A-Za-z0-9_-]{12,96}$/.test(response.syncRequestId)
        ? response.syncRequestId
        : "";
      const remoteRequestedSync = Boolean(remoteSyncRequestId && remoteSyncRequestId !== peer.lastRemoteSyncRequestId);
      if (remoteSyncRequestId) peer.lastRemoteSyncRequestId = remoteSyncRequestId;
      peer.verifiedAt = this.now();
      peer.lastSeenAt = Math.max(peer.lastSeenAt, peer.verifiedAt);
      peer.consecutiveFailures = 0;
      peer.lastFailureAt = 0;
      this.lastErrorValue = "";
      if (this.progressValue.phase !== "scanning" && this.progressValue.phase !== "syncing") {
        this.emit({ ...defaultProgress("connected"), active: true, peerId: peer.deviceId });
      }
      this.emitPeersChanged();
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
    if (this.progressValue.phase === "syncing" && !this.syncRunning && this.now() - this.lastTransferAt > 500) {
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
    if (!this.runningValue || this.syncRunning || (!forced && !this.isCoordinator())) return;
    const peers = this.syncTargets();
    if (!peers.length) return;
    this.syncRunning = true;
    try {
      for (const peer of peers) {
        if (!this.runningValue) break;
        if (this.now() - peer.lastSyncAt < SYNC_MIN_INTERVAL_MS && !this.syncQueued && !forced) continue;
        await this.syncPeer(peer);
        peer.lastSyncAt = this.now();
      }
    } catch (error) {
      this.lastErrorValue = safeErrorCode(error);
      const peer = peers[0];
      this.emit({ ...defaultProgress("error"), active: Boolean(peer), peerId: peer?.deviceId ?? "", error: this.lastErrorValue });
    } finally {
      this.syncRunning = false;
      if (this.syncQueued) {
        this.syncQueued = false;
        this.scheduleSync(120, true);
      }
    }
  }

  private async syncPeer(peer: LanSyncPeer): Promise<void> {
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
    let completed = 0;
    let bytesTransferred = 0;
    let changed = 0;
    let conflicts = 0;
    this.emit({
      ...defaultProgress(actions.length ? "syncing" : "complete"),
      active: true,
      peerId: peer.deviceId,
      total: actions.length,
      bytesTotal
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
            conflicts
          });
        }
        try {
          const result = await this.executeAction(peer, actions[index], ledger);
          if (activity) activity.state = "complete";
          completed += 1;
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
            conflicts
          });
        } catch (error) {
          if (activity) activity.state = "error";
          this.activityUpdatedAt = this.now();
          failure = error;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(TRANSFER_CONCURRENCY, actions.length) }, transferWorker));
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
      conflicts
    });
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
      await this.writeLocal(action.path, bytes, action.local?.hash ?? null, action.remote.hash);
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
    if (action.kind === "conflict" && action.local && action.remote && action.winner) {
      if (action.winner === "local") {
        const [localBytes, remoteBytes] = await Promise.all([
          this.readLocalVerified(action.path, action.local.hash),
          this.readRemote(peer, action.remote)
        ]);
        const conflictPath = buildLanConflictPath(action.path, peer.deviceId, action.remote.hash, this.pathOptions());
        await this.writeLocalIfMissingOrSame(conflictPath, remoteBytes, action.remote.hash);
        await this.writeRemoteIfMissingOrSame(peer, conflictPath, remoteBytes, action.remote.hash);
        await this.writeRemote(peer, action.path, localBytes, action.remote.hash, action.local.hash);
        ledger.entries[action.path] = action.local.hash;
        ledger.entries[conflictPath] = action.remote.hash;
        return { bytes: localBytes.byteLength + remoteBytes.byteLength * 2, changed: true, conflict: true };
      }
      const localBytes = await this.readLocalVerified(action.path, action.local.hash);
      const remoteBytes = await this.readRemote(peer, action.remote);
      const conflictPath = buildLanConflictPath(action.path, this.deviceId, action.local.hash, this.pathOptions());
      await this.writeRemoteIfMissingOrSame(peer, conflictPath, localBytes, action.local.hash);
      await this.writeLocalIfMissingOrSame(conflictPath, localBytes, action.local.hash);
      await this.writeLocal(action.path, remoteBytes, action.local.hash, action.remote.hash);
      ledger.entries[action.path] = action.remote.hash;
      ledger.entries[conflictPath] = action.local.hash;
      return { bytes: localBytes.byteLength * 2 + remoteBytes.byteLength, changed: true, conflict: true };
    }
    return { bytes: 0, changed: false, conflict: false };
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
    const bytes = new Uint8Array(await this.options.storage.readBinary(normalized));
    if (bytes.byteLength > this.settings().maxFileBytes || await sha256Bytes(bytes) !== expectedHash) throw new LanSyncProtocolError("precondition_failed", 409);
    return bytes;
  }

  private async writeLocal(path: string, bytes: Uint8Array, expectedHash: string | null, suppliedHash: string): Promise<void> {
    const normalized = this.normalizePath(path);
    if (!normalized || bytes.byteLength > this.settings().maxFileBytes || await sha256Bytes(bytes) !== suppliedHash) throw new LanSyncProtocolError("unsafe_write", 400);
    const current = await this.options.storage.statFile(normalized);
    if (expectedHash === null) {
      if (current) throw new LanSyncProtocolError("precondition_failed", 409);
    } else {
      if (!current || await sha256Bytes(await this.options.storage.readBinary(normalized)) !== expectedHash) throw new LanSyncProtocolError("precondition_failed", 409);
    }
    await this.options.storage.writeBinary(normalized, arrayBuffer(bytes));
    this.hashCache.delete(normalized);
    const written = await this.options.storage.statFile(normalized);
    if (!written || await sha256Bytes(await this.options.storage.readBinary(normalized)) !== suppliedHash) throw new Error("write_verification_failed");
  }

  private async writeLocalIfMissingOrSame(path: string, bytes: Uint8Array, hash: string): Promise<void> {
    const stat = await this.options.storage.statFile(path);
    if (stat) {
      if (await sha256Bytes(await this.options.storage.readBinary(path)) === hash) return;
      throw new LanSyncProtocolError("conflict_copy_collision", 409);
    }
    await this.writeLocal(path, bytes, null, hash);
  }

  private async deleteLocal(path: string, expectedHash: string): Promise<void> {
    const normalized = this.normalizePath(path);
    if (!normalized || !/^[A-Za-z0-9_-]{32,64}$/.test(expectedHash)) throw new LanSyncProtocolError("unsafe_delete");
    const current = await this.options.storage.statFile(normalized);
    if (!current || await sha256Bytes(await this.options.storage.readBinary(normalized)) !== expectedHash) {
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
      this.markInboundPeer(deviceId, remoteAddress, path);
      inboundDeviceId = deviceId;
      inboundActivityIndex = this.beginInboundFileActivity(deviceId, path, payload);
      let result: Record<string, unknown>;
      if (path === `${API_PREFIX}/ping`) {
        result = {
          ok: true,
          protocolVersion: PROTOCOL_VERSION,
          deviceId: this.deviceId,
          policy: this.policy(),
          syncRequestId: this.syncRequestId
        };
      } else if (path === `${API_PREFIX}/manifest`) {
        const policy = this.policy();
        result = {
          files: await this.buildManifest(policy.syncConfigFolder && payload.syncConfigFolder === true),
          policy
        };
      } else if (path === `${API_PREFIX}/file/read`) {
        result = await this.handleReadFile(payload);
      } else if (path === `${API_PREFIX}/file/write`) {
        result = await this.handleWriteFile(payload);
      } else if (path === `${API_PREFIX}/file/delete`) {
        result = await this.handleDeleteFile(payload);
      } else if (path === `${API_PREFIX}/attachment/write`) {
        result = await this.handleWriteAttachment(payload);
      } else if (path === `${API_PREFIX}/message/send`) {
        result = await this.handleIncomingMessage(deviceId, payload);
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

  private async handleReadFile(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const path = this.normalizePath(payload.path);
    const expectedHash = typeof payload.expectedHash === "string" ? payload.expectedHash : "";
    if (!path || !/^[A-Za-z0-9_-]{32,64}$/.test(expectedHash)) throw new LanSyncProtocolError("unsafe_path");
    const stat = await this.options.storage.statFile(path);
    if (!stat || stat.size > this.settings().maxFileBytes) throw new LanSyncProtocolError("file_unavailable", 404);
    const bytes = new Uint8Array(await this.options.storage.readBinary(path));
    const hash = await sha256Bytes(bytes);
    if (hash !== expectedHash) throw new LanSyncProtocolError("precondition_failed", 409);
    return { path, hash, mtime: stat.mtime, size: bytes.byteLength, data: bytesToBase64Url(bytes) };
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
    await this.writeLocal(path, bytes, expectedHash, hash);
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
    if (!written || written.size !== bytes.byteLength || await sha256Bytes(await this.options.storage.readBinary(path)) !== hash) throw new Error("write_verification_failed");
    const expiresAt = new Date(this.now() + this.settings().inboxRetentionHours * 60 * 60_000).toISOString();
    return { name, type, path, size: bytes.byteLength, hash, temporary: true, expiresAt };
  }
}
