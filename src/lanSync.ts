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
  /** Optional user-supplied shared secret. When set, both devices must use the same value. */
  sharedSecret?: string;
  /** Large-file provider policy. Wormhole is opt-in and never automatic without confirmation. */
  largeFileMode?: "disabled" | "ask" | "wormhole";
  wormholeCommand?: string;
  /** Opt-in test channel: advertise/build-install the current test bundle. */
  testMode?: boolean;
  testAutoUpdate?: boolean;
  testDebug?: boolean;
};

export type LanSyncTestBuildFile = {
  name: "main.js" | "manifest.json" | "styles.css";
  size: number;
  hash: string;
};

export type LanSyncTestBuild = {
  version: string;
  buildId: string;
  createdAt: string;
  files: LanSyncTestBuildFile[];
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
  listFilesChangedSince?(since: number, includeConfigFolder: boolean): Promise<LanSyncFileStat[]>;
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
  | "packaging-manifest"
  | "planning"
  | "waiting-plan"
  | "transferring"
  | "complete"
  | "peer-upgrade-required"
  | "error";

export type LanSyncProgress = {
  sessionId: string;
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
  /** Monotonic counters for the current full-vault round. Optional for old peers. */
  roundId?: string;
  roundCompleted?: number;
  roundTotal?: number;
  scanCandidates?: number;
  syncConfigFolder?: boolean;
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
  totalKnown?: boolean;
  cached: number;
  hashed: number;
  skipped: number;
  error: string;
  /** Number of paths discovered by the producer as needing reconciliation. */
  syncCandidates?: number;
  /** Monotonic candidate count for this scan (no fixed batch ceiling). */
  syncCandidatesTotal?: number;
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
  remote: LanSyncRemoteActivity | null;
  transferGroups: LanSyncActivityGroup[];
  scanGroups: LanSyncActivityGroup[];
  roundHistory: LanSyncRoundHistory[];
};

export type LanSyncRoundHistory = {
  id: string;
  startedAt: number;
  finishedAt: number;
  peerId: string;
  localScanCompleted: number;
  localScanTotal: number;
  remoteScanCompleted: number;
  remoteScanTotal: number;
  syncCompleted: number;
  syncTotal: number;
  uploads: number;
  downloads: number;
  status: "complete" | "partial" | "error";
};

export type LanSyncRemoteActivity = {
  deviceId: string;
  stage: string;
  phase: LanSyncProgressPhase;
  scanPhase: LanSyncScanActivity["phase"];
  scanTotalKnown: boolean;
  scanCompleted: number;
  scanTotal: number;
  roundId?: string;
  roundCompleted?: number;
  roundTotal?: number;
  scanCandidates?: number;
  syncConfigFolder?: boolean;
  receivedAt: number;
};

export type LanSyncServiceOptions = {
  desktop: boolean;
  getSettings(): LanSyncRuntimeSettings;
  storage: LanSyncStorage;
  httpRequest(request: LanSyncHttpRequest): Promise<LanSyncHttpResponse>;
  onProgress(progress: LanSyncProgress): void;
  onActivityChanged?(): void;
  onMessage?(message: LanSyncIncomingMessage): void | Promise<void>;
  onPeersChanged?(peers: LanSyncPeerInfo[]): void;
  localStore?: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
  now?: () => number;
  getTestBuild?(): Promise<LanSyncTestBuild | null>;
  readTestBuildFile?(name: LanSyncTestBuildFile["name"]): Promise<ArrayBuffer>;
  installTestBuild?(build: LanSyncTestBuild, files: Record<string, ArrayBuffer>): Promise<void>;
  onTestDebug?(event: Record<string, unknown>): void | Promise<void>;
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
  remoteForceFilesystemScan: boolean;
  remoteDirtyPaths: Map<string, number>;
  remotePriorityDirtyPaths: Map<string, number>;
  remoteProgress: LanSyncRemoteProgress | null;
  policy: LanSyncPolicy;
  capabilities: Set<string>;
  compatibilityPendingSince: number;
  testBuild: LanSyncTestBuild | null;
};

type LanSyncRemoteProgress = {
  sessionId: string;
  phase: LanSyncProgressPhase;
  stage: string;
  completed: number;
  total: number;
  bytesTransferred: number;
  bytesTotal: number;
  uploads: number;
  uploadCompleted: number;
  downloads: number;
  downloadCompleted: number;
  scanPhase: LanSyncScanActivity["phase"];
  scanTotalKnown: boolean;
  scanCompleted: number;
  scanTotal: number;
  roundId?: string;
  roundCompleted?: number;
  roundTotal?: number;
  scanCandidates?: number;
  receivedAt: number;
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
  priorityYielded: boolean;
};

// Obsidian reloads a plugin without waiting for onunload() promises. Keep the
// process-level listeners discoverable so the next plugin instance can take
// them over instead of falling back to port+1 and stranding mobile peers on
// the old endpoint.
type LanSyncGlobalRegistry = typeof globalThis & {
  __ntfyLanSyncServers?: Record<string, Server>;
  __ntfyLanSyncDiscoverySockets?: Record<string, Socket>;
  __ntfyLanSyncServer?: Server;
  __ntfyLanSyncDiscoverySocket?: Socket;
};

function lanSyncGlobalRegistry(): LanSyncGlobalRegistry {
  return globalThis as LanSyncGlobalRegistry;
}

async function closeLanSyncServer(server: Server | null | undefined): Promise<void> {
  if (!server) return;
  try {
    server.closeIdleConnections?.();
    server.closeAllConnections?.();
  } catch {
    // Best effort; close below still releases a listener without active APIs.
  }
  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      resolve();
    };
    try {
      server.close(() => finish());
    } catch {
      finish();
      return;
    }
    setTimeout(finish, 500);
  });
}

async function closeLanSyncDiscoverySocket(socket: Socket | null | undefined): Promise<void> {
  if (!socket) return;
  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      resolve();
    };
    try {
      socket.close(() => finish());
    } catch {
      finish();
      return;
    }
    setTimeout(finish, 150);
  });
}

type LanSyncInboundSession = {
  id: string;
  deviceId: string;
  planKey: string;
  startedAt: number;
  updatedAt: number;
  total: number;
  bytesTotal: number;
  uploads: number;
  downloads: number;
  /** Shared round counters announced by the coordinator. */
  roundId: string;
  roundCompleted: number;
  roundTotal: number;
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
const METADATA_PROTOCOLS = [
  { capability: "metadata-session-v4", routePrefix: "/metadata/v4" },
  { capability: "metadata-session-v3", routePrefix: "/metadata/v3" }
] as const;
const REALTIME_WAKEUP_CAPABILITY = "realtime-wakeup-v1";
const TEST_UPDATE_CAPABILITY = "test-update-v1";
const TEST_DEBUG_CAPABILITY = "test-debug-v1";
const TEST_BUILD_FILE_NAMES = ["main.js", "manifest.json", "styles.css"] as const;
const REALTIME_WAKEUP_TIMEOUT_MS = 20_000;
const MULTICAST_ADDRESS = "239.255.67.19";
const DISCOVERY_PORT = 43189;
const ANNOUNCE_INTERVAL_MS = 750;
const PEER_SWEEP_INTERVAL_MS = 350;
const PEER_PROBE_INTERVAL_MS = 900;
const PEER_MIN_STABLE_GRACE_MS = 30_000;
const PEER_LINK_IDLE_TIMEOUT_MS = 4_000;
const PEER_PROBE_TIMEOUT_MS = 8_000;
const PEER_RECONNECT_PROBE_TIMEOUT_MS = 2_500;
const PEER_FAILURE_EVICTION_DELAY_MS = 1_800;
// Keep one current LAN address plus one recent fallback. Retaining a long
// stale address list made reconnect try dead endpoints serially and look stuck.
const PEER_MAX_ADDRESS_HISTORY = 2;
const REMEMBERED_PEER_MAX_AGE_MS = 30 * 24 * 60 * 60_000;
const SYNC_MIN_INTERVAL_MS = 120;
const QUEUED_SYNC_DELAY_MS = 750;
// Real-time vault events are scheduled on the next event-loop turn. There is
// no polling debounce on the fast lane; duplicate paths are coalesced by the
// dirty journal and active-edit set.
const URGENT_SYNC_DELAY_MS = 0;
const REALTIME_DIRTY_DELAY_MS = 0;
// Highest-priority lane for the file the user is actively editing. Shorter than
// any other debounce so a keystroke ships almost immediately, and it runs on its
// own single-file channel instead of waiting behind a bulk dirty scan.
const ACTIVE_EDIT_SYNC_DELAY_MS = 0;
const ACTIVE_EDIT_POLL_MS = SYNC_MIN_INTERVAL_MS;
const RECONNECT_REPROBE_DELAY_MS = 250;
const MANIFEST_TIMEOUT_MS = 10 * 60_000;
// Incremental paths must fail fast when Wi-Fi disappears so reconnect can
// reprobe and resume the next batch instead of waiting several minutes.
const PATH_MANIFEST_TIMEOUT_MS = 20_000;
const SESSION_TIMEOUT_MS = 30_000;
const STALE_SESSION_RESUME_MS = 5_000;
const SYNC_WATCHDOG_MS = 8 * 60_000;
const SCAN_STALL_TIMEOUT_MS = 90_000;
const TRANSFER_RETRY_LIMIT = 2;
const TRANSFER_RETRY_BASE_DELAY_MS = 250;
const TRANSFER_ABORT_FAILURE_STREAK = 6;
const TRANSFER_IDLE_RESET_MS = 3_000;
const CHANGE_JOURNAL_SAVE_DELAY_MS = 400;
const CHECKPOINT_MTIME_OVERLAP_MS = 2_000;
// Obsidian normally reports modify/raw events immediately, but adapters and
// external editors can occasionally omit or delay them. This short, metadata-
// only safety poll catches those writes without starting a full reconciliation.
const CHANGE_POLL_INTERVAL_MS = 350;
const CHANGE_POLL_OVERLAP_MS = 1_000;
const BACKGROUND_FULL_RESCAN_INTERVAL_MS = 24 * 60 * 60_000;
const METADATA_INDEX_SAVE_DELAY_MS = 2_000;
// Obsidian can deliver modify/raw events well after the underlying write has
// completed, especially when a large batch is being applied on mobile. Keep
// the expected snapshot long enough for the whole batch and let expiry cleanup
// keep memory finite.
const APPLIED_MUTATION_EVENT_TTL_MS = 30 * 60_000;
// Metadata reads are independent and cheap on desktop/modern Android. Keep a
// bounded pool so scanning advances in smooth batches without the old
// twelve-worker bottleneck; transfer concurrency remains separately bounded.
const HASH_CONCURRENCY = 24;
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
// Dirty-path reconciliation is intentionally unbounded. The transfer pool
// still controls concurrent I/O, but discovery and protocol exchange never
// stop after an arbitrary visible batch size.
const INCREMENTAL_PATH_BATCH_SIZE = Number.MAX_SAFE_INTEGER;
const MAX_QUEUED_MESSAGES_PER_PEER = 100;
const MAX_PING_MESSAGES = 20;
const OUTBOUND_MESSAGE_STORAGE_PREFIX = "ntfy.lan-message-outbox.v1";

function configuredLanSecret(settings: LanSyncRuntimeSettings, identity: LanSyncIdentity): string {
  const shared = typeof settings.sharedSecret === "string" ? settings.sharedSecret.trim() : "";
  // Keep the historical per-vault secret as the backwards-compatible default.
  return shared || identity.secret;
}

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

function isTransientSyncError(error: unknown): boolean {
  const code = safeErrorCode(error);
  return code === "peer_unreachable"
    || code === "timeout"
    || code === "rate_limited"
    || code === "busy"
    || code === "sync_failed";
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
    deletePush: true,
    deletePull: true,
    syncConfigFolder: true,
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
    syncConfigFolder: true,
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
    // Newer peers synchronize the complete vault by default. Keep accepting
    // the legacy flag for protocol compatibility, but do not let an old
    // false value silently drop .obsidian changes from a full-vault session.
    syncConfigFolder: value.syncConfigFolder !== false,
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
  // The whole vault is shareable. The option remains in the wire policy for
  // older peers, but configuration-folder files are no longer dropped solely
  // because one side retained a legacy false setting.
  if (segments.length < 2) return null;
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

const LAN_LINK_PRIORITY: Record<LanLinkType, number> = {
  wifi: 0,
  hotspot: 1,
  usb: 2,
  "bluetooth-pan": 3,
  ethernet: 4,
  lan: 5
};

function lanAddressPriority(address: string, interfaces: LanNetworkInterface[]): number {
  const normalized = normalizeRemoteAddress(address);
  const parts = normalized.split(".").map(Number);
  // Link-local addresses are useful as a last-resort fallback but are not
  // stable routes for a Wi-Fi peer and commonly belong to disconnected
  // adapters.
  if (parts.length === 4 && parts[0] === 169 && parts[1] === 254) return 100;
  for (const item of interfaces) {
    const localParts = item.address.split(".").map(Number);
    const maskParts = item.netmask.split(".").map(Number);
    if (
      parts.length === 4
      && maskParts.length === 4
      && localParts.length === 4
      && parts.every((part, index) => (part & maskParts[index]) === (localParts[index] & maskParts[index]))
    ) {
      return LAN_LINK_PRIORITY[item.linkType] ?? 50;
    }
  }
  // A normal RFC1918 address on an unknown interface is still preferable to
  // a virtual/link-local fallback, but should follow a directly matching
  // Wi-Fi/hotspot/USB subnet.
  return 40;
}

export function sortLanAddresses(addresses: Iterable<string>, interfaces: LanNetworkInterface[]): string[] {
  return [...new Set([...addresses].map(normalizeRemoteAddress).filter(isPrivateLanAddress))]
    .sort((left, right) => {
      const priority = lanAddressPriority(left, interfaces) - lanAddressPriority(right, interfaces);
      return priority || left.localeCompare(right);
    });
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

function yieldToLanEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    // MessageChannel yields to rendering, timers, and heartbeat I/O without
    // relying on setTimeout(0), which mobile WebViews may heavily throttle.
    if (typeof MessageChannel !== "undefined") {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => {
        channel.port1.close();
        channel.port2.close();
        resolve();
      };
      channel.port2.postMessage(null);
      return;
    }
    setTimeout(resolve, 0);
  });
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

function metadataLedgerMatches(
  entry: LanSyncMetadataEntry | LanSyncMetadataSnapshot | null | undefined,
  expected: LanSyncMetadataEntry | LanSyncMetadataSnapshot | null | undefined
): boolean {
  return metadataMatches(entry, expected);
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
      if (metadataLedgerMatches(localEntry, remoteEntry)) continue;
      const localChanged = !baseline || !metadataLedgerMatches(localEntry, baseline.local);
      const remoteChanged = !baseline || !metadataLedgerMatches(remoteEntry, baseline.remote);
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
        const localChanged = !metadataLedgerMatches(localEntry, baseline.local);
        if (localChanged && canPush) actions.push({ kind: "push", path, local: localEntry, remote: null });
        else if (!localChanged && canDeleteLocal) actions.push({ kind: "delete-local", path, local: localEntry, remote: null });
      } else if (remoteEntry) {
        const remoteChanged = !metadataLedgerMatches(remoteEntry, baseline.remote);
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

export function prioritizeLanSyncActions(
  actions: LanSyncMetadataReconcileAction[],
  context: {
    urgent?: Set<string>;
    localDirty?: Map<string, number>;
    remoteDirty?: Map<string, number>;
  } = {}
): LanSyncMetadataReconcileAction[] {
  const urgent = context.urgent ?? new Set<string>();
  const localDirty = context.localDirty ?? new Map<string, number>();
  const remoteDirty = context.remoteDirty ?? new Map<string, number>();
  // A plain alphabetical plan buried the note the user just edited behind
  // thousands of untouched files. Rank by how recently a path changed, then
  // let small payloads go first so visible work starts immediately.
  const rank = (action: LanSyncMetadataReconcileAction): number => {
    if (urgent.has(action.path)) return 0;
    if (localDirty.has(action.path) || remoteDirty.has(action.path)) return 1;
    if (!action.local || !action.remote) return 2;
    return 3;
  };
  const generation = (path: string): number => Math.max(localDirty.get(path) ?? 0, remoteDirty.get(path) ?? 0);
  const size = (action: LanSyncMetadataReconcileAction): number => action.kind === "push"
    ? action.local?.size ?? 0
    : action.kind === "pull"
      ? action.remote?.size ?? 0
      : 0;
  return actions
    .map((action, index) => ({ action, index }))
    .sort((left, right) => {
      const rankDelta = rank(left.action) - rank(right.action);
      if (rankDelta !== 0) return rankDelta;
      const generationDelta = generation(right.action.path) - generation(left.action.path);
      if (generationDelta !== 0) return generationDelta;
      const sizeDelta = size(left.action) - size(right.action);
      if (sizeDelta !== 0) return sizeDelta;
      return left.index - right.index;
    })
    .map((item) => item.action);
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
    sessionId: "",
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
    error: "",
    roundId: "",
    roundCompleted: 0,
    roundTotal: 0,
    scanCandidates: 0
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
  private changeJournalSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private metadataIndexSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private metadataIndex = new Map<string, LanSyncMetadataSnapshot>();
  private metadataIndexReady = false;
  private metadataIndexIncludesConfig = false;
  private metadataIndexMaxFileBytes = 0;
  private metadataIndexMutationGeneration = 0;
  private metadataIndexMutations = new Map<string, { generation: number; metadata: LanSyncMetadataSnapshot | null }>();
  private metadataIndexReplaceBaselineGeneration = 0;
  private metadataIndexGeneration = 0;
  private backgroundReconciliation: Promise<void> | null = null;
  private reconciliationDirtyPaths = new Set<string>();
  private manifestBuild: { includeConfigFolder: boolean; promise: Promise<LanSyncManifestEntry[]> } | null = null;
  private metadataManifestBuild: {
    includeConfigFolder: boolean;
    forceFilesystemScan: boolean;
    promise: Promise<LanSyncMetadataEntry[]>;
  } | null = null;
  private intervals: Array<ReturnType<typeof setInterval>> = [];
  private changePollInFlight = false;
  private changePollInitialized = false;
  private changePollLastMtime = 0;
  private changePollSignatures = new Map<string, string>();
  private syncTimer: ReturnType<typeof setTimeout> | null = null;
  private syncRunning = false;
  private syncQueued = false;
  // Set when a live edit arrives during a bulk transfer. The current action
  // is allowed to finish, then the session yields so the active lane can run.
  private prioritySyncPending = false;
  private syncForced = false;
  private syncStartedAt = 0;
  private manifestBuildStartedAt = 0;
  private progressUpdatedAt = 0;
  private urgentDirtyPaths = new Set<string>();
  // The file the user is currently editing (highest-priority, single-file lane).
  // Distinct from urgentDirtyPaths: it ships on its own 1-path channel and never
  // waits behind a bulk dirty scan.
  private activeEditingPath: string | null = null;
  private activeEditDirty = new Set<string>();
  private activeEditTimer: ReturnType<typeof setTimeout> | null = null;
  private activeEditTimerDueAt = 0;
  private activeEditSyncRunning = false;
  private activeEditStartedAt = 0;
  private urgentProbePending = false;
  private urgentProbeTimer: ReturnType<typeof setTimeout> | null = null;
  private realtimeWakeupPolls = new Map<string, Promise<void>>();
  private realtimeWakeupRetryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private realtimeSignalWaiters = new Set<() => void>();
  // Scan activity is streamed through the encrypted /events/wait channel.
  // Keep the stream responsive without waking every waiter for every file in
  // a large vault.
  private lastRealtimeProgressSignalAt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private transferBackoff = new Map<string, { failures: number; nextAttemptAt: number }>();
  private syncRequestId = "";
  private fullSyncRequestId = "";
  private fullSyncRequested = false;
  private forceFilesystemScanRequested = false;
  private fullSyncOnlyPending = false;
  private localFilesystemScanCompletedRequestId = "";
  private lastFullScanAt = 0;
  private lastSyncCheckpointAt = 0;
  private dirtySequence = 0;
  private dirtyPaths = new Map<string, number>();
  private inboundSession: LanSyncInboundSession | null = null;
  private appliedMutationEvents = new Map<string, { expected?: LanSyncMetadataSnapshot | null; expiresAt: number; appliedAt: number }>();
  private servedFilesystemScanRequests = new Map<string, string[]>();
  private pendingMessages = new Map<string, LanSyncIncomingMessage[]>();
  private receivedMessageIds = new Set<string>();
  private lastTransferAt = 0;
  private currentTransferSessionId = "";
  // Scanning/manifest exchange may overlap the priority lane, but only one
  // peer transfer session may own the wire at a time.
  private transferSessionActive = false;
  private progressValue = defaultProgress();
  // A full-vault round has one stable counter across all transport batches.
  // Keeping it outside the per-session progress prevents the visible counter
  // from jumping back to zero when the producer queues the next batch.
  private syncRoundId = "";
  private syncRoundCompleted = 0;
  private syncRoundTotal = 0;
  // A round counts each path once, even when a transfer batch is retried or
  // rebuilt while the filesystem scan is still running.
  private syncRoundPaths = new Set<string>();
  private fullRoundScanVisible = false;
  // A round started by a full-vault request must not enter history until both
  // filesystem scans have reached their stable denominators. Incremental
  // rounds keep the flag false so a one-file edit can still complete quickly.
  private roundRequiresScanCompletion = false;
  private roundStartedAt = 0;
  private roundHistory: LanSyncRoundHistory[] = [];
  private activityFiles: LanSyncFileActivity[] = [];
  private scanValue: LanSyncScanActivity = this.emptyScanActivity();
  // Network peers need the scan that is actually running even when a
  // concurrent inbound/background scan is intentionally hidden from the
  // local panel. This signal snapshot is separate from the UI-owned scanValue
  // so remote progress never rewinds the visible local denominator.
  private scanSignalValue: LanSyncScanActivity | null = null;
  // Manifest work performed on behalf of a peer must never take over the
  // local scan counter. When it did, the status bar rewound ("3/3" back to
  // "0/3") in the middle of the user's own pass, which is what made a sync
  // look like it was scanning forever without ever moving files.
  private inboundManifestDepth = 0;
  private activityUpdatedAt = 0;
  private lastErrorValue = "";
  private lastPeerFingerprint = "";
  private localTestBuild: LanSyncTestBuild | null = null;
  private testUpdateInFlight = false;
  private lastTestUpdateBuildId = "";

  constructor(private readonly options: LanSyncServiceOptions) {}

  private activeSecret(): string {
    if (!this.identity) throw new Error("identity_unavailable");
    return configuredLanSecret(this.settings(), this.identity);
  }

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
    const total = Math.max(0, Math.floor(scan.total));
    return { ...scan, total, completed: Math.min(Math.max(0, Math.floor(scan.completed)), total) };
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
        total: Math.max(0, Math.floor(this.scanValue.total)),
        completed: Math.min(Math.max(0, Math.floor(this.scanValue.completed)), Math.max(0, Math.floor(this.scanValue.total))),
        files: includeScanFiles ? scanFiles.map((file) => ({ ...file })) : []
      },
      remote: this.remoteActivity(),
      transferGroups: summarizeTransferGroups(this.activityFiles),
      scanGroups: summarizeScanGroups(this.scanValue.files),
      roundHistory: this.roundHistory.map((round) => ({ ...round }))
    };
  }

  private remoteActivity(): LanSyncRemoteActivity | null {
    const peer = this.activePeers()
      .filter((candidate) => candidate.remoteProgress && this.now() - candidate.remoteProgress.receivedAt <= PEER_PROBE_INTERVAL_MS * 12)
      .sort((left, right) => (right.remoteProgress?.receivedAt ?? 0) - (left.remoteProgress?.receivedAt ?? 0))[0];
    const remote = peer?.remoteProgress;
    if (!peer || !remote) return null;
    return {
      deviceId: peer.deviceId,
      stage: remote.stage,
      phase: remote.phase,
      scanPhase: remote.scanPhase,
      scanTotalKnown: remote.scanTotalKnown,
      scanCompleted: remote.scanCompleted,
      scanTotal: remote.scanTotal,
      roundId: remote.roundId,
      roundCompleted: remote.roundCompleted,
      roundTotal: remote.roundTotal,
      scanCandidates: remote.scanCandidates,
      syncConfigFolder: peer.policy.syncConfigFolder,
      receivedAt: remote.receivedAt
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
          compatible: this.metadataProtocol(peer) !== null
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
      this.wakeRealtimeSignalWaiters();
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
    // Keep a stable key for this attachment. Other inbound/outbound work can
    // replace `activityFiles` while this request is in flight; indexing
    // element 0 after an await then races with that replacement.
    const activityPath = `${LAN_INBOX_ROOT}/${attachmentId}/${name}`;
    this.activityFiles = [{ path: activityPath, action: "push", state: "syncing", size: bytes.byteLength }];
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
      const activity = this.activityFiles.find((file) => file.path === activityPath);
      if (activity) {
        activity.path = attachment.path;
        activity.state = "complete";
      }
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
      const activity = this.activityFiles.find((file) => file.path === activityPath);
      if (activity) activity.state = "error";
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

  status(): { running: boolean; port: number; peerCount: number; error: string; desktop: boolean; encrypted: boolean; sharedSecretConfigured: boolean; dirtyCount: number; urgentCount: number; coordinator: boolean; targetCount: number } {
    return {
      running: this.runningValue,
      port: this.boundPort,
      peerCount: this.activePeers().length,
      error: this.lastErrorValue,
      desktop: this.options.desktop,
      encrypted: true,
      sharedSecretConfigured: Boolean(String(this.settings().sharedSecret || "").trim()),
      dirtyCount: this.dirtyPaths.size,
      urgentCount: this.activeEditDirty.size,
      coordinator: this.isCoordinator(),
      targetCount: this.syncTargets().length
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
    this.localTestBuild = this.settings().testMode ? await this.options.getTestBuild?.() ?? null : null;
    this.deviceId = this.loadOrCreateDeviceId();
    this.loadRoundHistory();
    this.lastFullScanAt = this.loadLastFullScanAt();
    this.loadChangeJournal();
    this.loadHashCache();
    await this.loadMetadataIndex();
    // Only a device with no persisted metadata baseline needs an initial
    // full-vault handshake. Reloads and ordinary elapsed time never create a
    // full scan request on their own.
    this.fullSyncRequested = !this.metadataIndexReady && this.lastFullScanAt <= 0;
    if (this.fullSyncRequested) {
      this.roundRequiresScanCompletion = true;
      this.beginSyncRound();
    }
    await this.captureChangesSinceCheckpoint();
    if (!this.fullSyncRequestId) {
      this.fullSyncRequestId = randomId(18);
      this.syncRequestId = this.fullSyncRequestId;
    }
    if (!this.syncRequestId) this.syncRequestId = randomId(18);
    this.loadPendingMessages();
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
      // Event callbacks remain the primary fast path. The metadata poll is a
      // bounded fallback for adapters that miss an external/config-folder
      // write; it only enqueues paths whose size/mtime signature changed.
      if (this.options.storage.listFilesChangedSince) {
        this.intervals.push(setInterval(() => {
          // Do not compete with the first full baseline walk. Once a complete
          // index exists and a peer is connected, the poll covers only missed
          // external writes while Vault events remain the normal fast path.
          if (this.metadataIndexReady && this.syncTargets().length > 0) void this.pollFilesystemChanges();
        }, CHANGE_POLL_INTERVAL_MS));
      }
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
    this.wakeRealtimeSignalWaiters();
    this.realtimeWakeupPolls.clear();
    for (const timer of this.realtimeWakeupRetryTimers.values()) clearTimeout(timer);
    this.realtimeWakeupRetryTimers.clear();
    this.syncQueued = false;
    this.syncForced = false;
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }
    if (this.activeEditTimer) {
      clearTimeout(this.activeEditTimer);
      this.activeEditTimer = null;
    }
    this.activeEditTimerDueAt = 0;
    if (this.urgentProbeTimer) {
      clearTimeout(this.urgentProbeTimer);
      this.urgentProbeTimer = null;
    }
    this.urgentProbePending = false;
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
      const registry = lanSyncGlobalRegistry();
      const sockets = registry.__ntfyLanSyncDiscoverySockets;
      const key = `${this.identity?.vaultId ?? "unknown"}:${DISCOVERY_PORT}`;
      if (sockets?.[key] === socket) delete sockets[key];
    }
    const server = this.server;
    this.server = null;
    this.boundPort = 0;
    if (server) {
      const registry = lanSyncGlobalRegistry();
      const servers = registry.__ntfyLanSyncServers;
      const key = `${this.identity?.vaultId ?? "unknown"}:${this.settings().port}`;
      if (servers?.[key] === server) delete servers[key];
      await closeLanSyncServer(server);
    }
    if (this.backgroundReconciliation) {
      await this.backgroundReconciliation.catch(() => undefined);
      this.backgroundReconciliation = null;
    }
    if (this.hashSaveTimer) {
      clearTimeout(this.hashSaveTimer);
      this.hashSaveTimer = null;
      this.saveHashCache();
    }
    if (this.changeJournalSaveTimer) {
      clearTimeout(this.changeJournalSaveTimer);
      this.changeJournalSaveTimer = null;
    }
    this.saveChangeJournal();
    if (this.metadataIndexSaveTimer) {
      clearTimeout(this.metadataIndexSaveTimer);
      this.metadataIndexSaveTimer = null;
    }
    await this.saveMetadataIndex();
    this.peers.clear();
    this.emitPeersChanged();
    this.replayCache.clear();
    this.rateByClient.clear();
    this.inboundSession = null;
    this.currentTransferSessionId = "";
    this.transferSessionActive = false;
    this.prioritySyncPending = false;
    this.appliedMutationEvents.clear();
    this.servedFilesystemScanRequests.clear();
    this.activityFiles = [];
    this.scanValue = this.emptyScanActivity();
    this.scanSignalValue = null;
    this.fullRoundScanVisible = false;
    this.roundRequiresScanCompletion = false;
    this.syncRoundId = "";
    this.syncRoundCompleted = 0;
    this.syncRoundTotal = 0;
    this.syncRoundPaths.clear();
    this.activityUpdatedAt = this.now();
    this.changePollInFlight = false;
    this.changePollInitialized = false;
    this.changePollLastMtime = 0;
    this.changePollSignatures.clear();
    this.localTestBuild = null;
    this.testUpdateInFlight = false;
    this.lastTestUpdateBuildId = "";
    this.emit(defaultProgress("stopped"));
  }

  private async pollFilesystemChanges(): Promise<void> {
    const listChangedSince = this.options.storage.listFilesChangedSince;
    if (!this.runningValue || !listChangedSince || this.changePollInFlight) return;
    this.changePollInFlight = true;
    try {
      // The overlap handles coarse filesystem timestamp precision. Signatures
      // suppress duplicate notifications caused by that overlap, so a stable
      // file never re-enters the transfer queue on every poll.
      const since = this.changePollInitialized
        ? Math.max(0, this.changePollLastMtime - CHANGE_POLL_OVERLAP_MS)
        : 0;
      const files = await listChangedSince.call(this.options.storage, since, true);
      // Seed the first poll from the last complete index instead of treating
      // the current filesystem snapshot as a new baseline. A write that lands
      // during plugin startup is then detected even if its Vault event was
      // dropped before the observer became active.
      const nextSignatures = this.changePollInitialized
        ? new Map(this.changePollSignatures)
        : new Map([...this.metadataIndex.entries()].map(([path, metadata]) => [
          path,
          `${Math.max(0, metadata.size)}:${Math.max(0, metadata.mtime)}`
        ]));
      let maxMtime = this.changePollLastMtime;
      if (!this.changePollInitialized) {
        for (const file of files) {
          const path = this.normalizePath(file.path, true);
          if (path) {
            const signature = `${Math.max(0, file.size)}:${Math.max(0, file.mtime)}`;
            const previous = nextSignatures.get(path);
            nextSignatures.set(path, signature);
            maxMtime = Math.max(maxMtime, Number(file.mtime) || 0);
            if (previous !== undefined && previous === signature) continue;
            this.markDirtyPath(path, REALTIME_DIRTY_DELAY_MS, true);
          }
        }
        this.changePollInitialized = true;
      } else {
        for (const file of files) {
          const path = this.normalizePath(file.path, true);
          if (!path) continue;
          const signature = `${Math.max(0, file.size)}:${Math.max(0, file.mtime)}`;
          const previous = nextSignatures.get(path);
          nextSignatures.set(path, signature);
          maxMtime = Math.max(maxMtime, Number(file.mtime) || 0);
          if (previous !== undefined && previous === signature) continue;
          // New paths and genuine metadata changes go through the same urgent
          // queue as Vault events, including .obsidian/config-folder paths.
          this.markDirtyPath(path, REALTIME_DIRTY_DELAY_MS, true);
        }
      }
      this.changePollSignatures = nextSignatures;
      this.changePollLastMtime = maxMtime;
    } catch {
      // Polling is a safety net. A transient adapter read failure must never
      // interrupt an active transfer or replace the live progress snapshot.
    } finally {
      this.changePollInFlight = false;
    }
  }

  notifyVaultChange(path: string): void {
    const normalized = this.normalizePath(path, true);
    if (!normalized) return;
    if (!this.appliedMutationEvents.has(normalized)) {
      this.markDirtyPath(normalized, REALTIME_DIRTY_DELAY_MS, true);
      return;
    }
    void this.classifyAppliedMutationEvent(normalized);
  }

  private markAppliedMutation(path: string): void {
    if (this.appliedMutationEvents.size >= MAX_MANIFEST_FILES) {
      const now = this.now();
      for (const [candidate, token] of this.appliedMutationEvents) {
        if (token.expiresAt < now) this.appliedMutationEvents.delete(candidate);
      }
      while (this.appliedMutationEvents.size >= MAX_MANIFEST_FILES) {
        const oldest = this.appliedMutationEvents.keys().next().value;
        if (typeof oldest !== "string") break;
        this.appliedMutationEvents.delete(oldest);
      }
    }
    const appliedAt = this.now();
    this.appliedMutationEvents.set(path, {
      appliedAt,
      // Keep the durable entry for cleanup, but only suppress an Obsidian
      // event during the short post-write echo window below.
      expiresAt: appliedAt + APPLIED_MUTATION_EVENT_TTL_MS
    });
  }

  private confirmAppliedMutation(path: string, expected: LanSyncMetadataSnapshot | null): void {
    const token = this.appliedMutationEvents.get(path);
    if (token) token.expected = expected;
  }

  private clearAppliedMutation(path: string): void {
    this.appliedMutationEvents.delete(path);
  }

  private notePathChangedDuringFullScan(path: string): void {
    const scan = this.scanValue;
    if (!this.fullRoundScanVisible || (scan.phase !== "scanning" && scan.phase !== "complete")) return;
    // A Vault event is only a hint: it may represent a modify, create, or
    // delete. Re-stat the path before changing the denominator so a deleted
    // file is removed instead of being counted forever, and a duplicate event
    // cannot inflate the current-round total.
    void this.reconcilePathInActiveScan(scan, path);
  }

  private async reconcilePathInActiveScan(scan: LanSyncScanActivity, path: string): Promise<void> {
    if (this.scanValue !== scan || !this.fullRoundScanVisible || (scan.phase !== "scanning" && scan.phase !== "complete")) return;
    const normalized = this.normalizePath(path, true);
    const stat = normalized ? await this.options.storage.statFile(normalized).catch(() => null) : null;
    const valid = Boolean(
      normalized
      && stat
      && Number.isSafeInteger(stat.size)
      && stat.size >= 0
      && stat.size <= this.settings().maxFileBytes
      && Number.isFinite(stat.mtime)
      && stat.mtime >= 0
    );
    const index = normalized ? scan.files.findIndex((file) => file.path === normalized) : -1;
    if (valid && normalized && stat) {
      if (index < 0) {
        scan.files.push({ path: normalized, state: "complete", size: stat.size, reason: "changed-during-scan" });
        scan.total += 1;
        scan.completed += 1;
      } else {
        const activity = scan.files[index];
        activity.size = stat.size;
        if (activity.state === "skipped") {
          activity.state = "complete";
          activity.reason = "changed-during-scan";
          scan.skipped = Math.max(0, scan.skipped - 1);
          scan.completed += 1;
        }
      }
    } else if (index >= 0) {
      // Keep the row in place while the concurrent scanner is using its
      // scanIndex. Removing it would shift every later index and make a
      // callback update the wrong file, which is how completed could exceed
      // total. Mark it missing and adjust only the counters.
      const removed = scan.files[index];
      if (removed.reason !== "missing-during-scan") {
        if (removed.state === "cached" || removed.state === "complete" || removed.state === "skipped") {
          scan.completed = Math.max(0, scan.completed - 1);
        }
        if (removed.state === "cached") scan.cached = Math.max(0, scan.cached - 1);
        if (removed.state === "skipped") scan.skipped = Math.max(0, scan.skipped - 1);
        scan.total = Math.max(0, scan.total - 1);
        removed.state = "skipped";
        removed.reason = "missing-during-scan";
      }
    }
    // The invariant is user-visible and must hold after every event, including
    // a delete racing the final scanner callback.
    scan.completed = Math.min(Math.max(0, scan.completed), Math.max(0, scan.total));
    if (this.scanValue === scan) this.emitActivityChanged();
  }

  private async listCurrentSyncFiles(includeConfigFolder: boolean): Promise<LanSyncFileStat[]> {
    const files = new Map<string, LanSyncFileStat>();
    for (const raw of await this.options.storage.listFiles(true)) {
      const path = this.normalizePath(raw.path, includeConfigFolder);
      // The scan denominator represents the complete current device file set.
      // Size policy is applied later to synchronization eligibility, never to
      // the device-total counter; otherwise a large file silently disappears
      // from "本轮总检查" and the two sides report incomparable totals.
      if (!path || !Number.isSafeInteger(raw.size) || raw.size < 0 || !Number.isFinite(raw.mtime) || raw.mtime < 0) continue;
      const entry = { path, size: raw.size, mtime: raw.mtime };
      const previous = files.get(path);
      // Adapters can expose the same normalized path twice (for example a
      // Vault listing plus a config-folder listing). Keep one deterministic
      // record, preferring the newest metadata observation.
      if (!previous || entry.mtime > previous.mtime || (entry.mtime === previous.mtime && entry.size >= previous.size)) files.set(path, entry);
    }
    return [...files.values()].sort((left, right) => left.path.localeCompare(right.path));
  }

  private async classifyAppliedMutationEvent(path: string): Promise<void> {
    let token = this.appliedMutationEvents.get(path);
    if (!token) {
      this.markDirtyPath(path, REALTIME_DIRTY_DELAY_MS, true);
      return;
    }
    if (token.expected === undefined) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      token = this.appliedMutationEvents.get(path);
    }
    if (!token || token.expiresAt < this.now() || token.expected === undefined) {
      this.appliedMutationEvents.delete(path);
      this.markDirtyPath(path, REALTIME_DIRTY_DELAY_MS, true);
      return;
    }
    const current = await this.options.storage.statFile(path).catch(() => null);
    // Obsidian adapters can deliver modify/raw events late. A long-lived
    // suppression token must never hide a real user edit; only an event that
    // arrives immediately after our own LAN write can be treated as a write
    // echo. After the short window, the path is always dirty even when the
    // adapter reports coarse timestamp precision.
    const echoWindowActive = this.now() - token.appliedAt <= 2_000;
    const unchanged = token.expected === null ? current === null : Boolean(current && metadataMatches(current, token.expected));
    if (unchanged && echoWindowActive) return;
    this.appliedMutationEvents.delete(path);
    this.markDirtyPath(path, REALTIME_DIRTY_DELAY_MS, true);
  }

  /**
   * Highest-priority signal: the user is actively editing `path` right now.
   * Routes it onto a dedicated single-file channel that scans and transfers only
   * that file (never waiting behind a bulk dirty scan) and outranks every other
   * kind of work. The file is also tracked in the normal dirty/urgent sets so a
   * bulk round still covers it if the dedicated lane is blocked.
   */
  notifyActiveEdit(path: string): void {
    // Keep configuration-folder edits in the journal even when the local
    // preference is temporarily off. The peer policy filters them at plan
    // time; dropping them here made .obsidian changes impossible to recover
    // after the toggle was enabled again.
    const normalized = this.normalizePath(path, true);
    if (!normalized) return;
    this.activeEditingPath = normalized;
    // Editor events can precede the Vault modify notification. Route them
    // through the same announced dirty path so the peer is woken immediately.
    this.markDirtyPath(normalized, ACTIVE_EDIT_SYNC_DELAY_MS, true);
  }

  /** Clear the active-edit marker (called when the user switches away). */
  clearActiveEdit(path?: string): void {
    const normalized = path ? this.normalizePath(path) : null;
    if (normalized && this.activeEditingPath === normalized) {
      this.activeEditingPath = null;
    } else if (!normalized) {
      this.activeEditingPath = null;
    }
    // Make sure the last contents are picked up by the normal path if the
    // dedicated lane has not already synced them. A completed fast-lane pass
    // removes both queues; re-marking an already settled path here would open
    // a duplicate one-path manifest immediately after the successful transfer.
    if (
      normalized
      && (this.dirtyPaths.has(normalized) || this.activeEditDirty.has(normalized))
    ) {
      this.markDirtyPath(normalized, URGENT_SYNC_DELAY_MS, true);
    }
  }

  private markDirtyPath(path: string, delay = QUEUED_SYNC_DELAY_MS, urgent = false): void {
    // Always retain a normalized config-folder path in the durable dirty
    // journal. Whether it is shareable is decided later from both policies,
    // so a setting toggle cannot erase an edit before the next sync pass.
    const normalized = this.normalizePath(path, true);
    if (!normalized) return;
    // Reflect the Vault event in the transfer panel immediately. The actual
    // action (push/pull/delete) is resolved by the metadata planner later.
    this.ensurePendingActivityPath(normalized, "push");
    this.notePathChangedDuringFullScan(normalized);
    this.hashCache.delete(normalized);
    this.queueHashCacheSave();
    this.dirtySequence += 1;
    this.dirtyPaths.set(normalized, this.dirtySequence);
    if (urgent) {
      // A live vault event outranks whatever bulk plan is in flight, and a
      // fresh edit clears any parked backoff so it is retried immediately.
      this.transferBackoff.delete(normalized);
      this.urgentDirtyPaths.add(normalized);
      if (this.urgentDirtyPaths.size > MAX_MANIFEST_FILES) {
        this.urgentDirtyPaths = new Set([...this.urgentDirtyPaths].slice(-MAX_MANIFEST_FILES));
      }
      this.activeEditDirty.add(normalized);
      if (this.activeEditDirty.size > MAX_MANIFEST_FILES) {
        this.activeEditDirty = new Set([...this.activeEditDirty].slice(-MAX_MANIFEST_FILES));
      }
    }
    if (this.backgroundReconciliation) this.reconciliationDirtyPaths.add(normalized);
    this.queueChangeJournalSave();
    this.syncRequestId = randomId(18);
    this.wakeRealtimeSignalWaiters();
    this.announce();
    if (urgent) {
      // A non-coordinator cannot open the transfer session itself. Push its
      // compact dirty-path signal to the authenticated coordinator now rather
      // than waiting for the 900ms probe interval (or losing the wakeup while
      // another batch is finishing).
      this.scheduleUrgentProbe();
      this.scheduleActiveEditSync(REALTIME_DIRTY_DELAY_MS);
      // Start the priority lane in the same turn. The timer remains as a
      // fallback, but this direct call prevents a full-vault scan from delaying
      // the first changed file behind scheduler ordering.
      if (this.isCoordinator() && !this.activeEditSyncRunning) {
        // The urgent lane owns this dirty batch immediately. A generic timer
        // left by the same event would wake during the transfer, set
        // prioritySyncPending, and force an unnecessary second manifest pass.
        if (this.syncTimer) {
          clearTimeout(this.syncTimer);
          this.syncTimer = null;
        }
        if (this.activeEditTimer) {
          clearTimeout(this.activeEditTimer);
          this.activeEditTimer = null;
          this.activeEditTimerDueAt = 0;
        }
        void this.runActiveEditSync();
      }
    }
    // If the coordinator successfully entered the dedicated lane above, that
    // lane is already the scheduler for this event. Scheduling the generic
    // pass as well would mark the active transfer for a priority yield and
    // immediately retry the same manifest. Keep the generic fallback only
    // when the priority lane could not start (for example, no peer yet).
    if (!urgent || !this.activeEditSyncRunning) this.scheduleSync(delay, true);
  }

  private scheduleUrgentProbe(): void {
    if (!this.runningValue) return;
    this.urgentProbePending = true;
    if (this.urgentProbeTimer) return;
    this.urgentProbeTimer = setTimeout(() => {
      this.urgentProbeTimer = null;
      if (!this.runningValue || !this.urgentProbePending) return;
      this.urgentProbePending = false;
      void this.probePeers(true).finally(() => {
        // A new event can arrive while the forced probe is in flight. Do not
        // wait for the regular 900ms probe interval in that case.
        if (this.urgentProbePending) this.scheduleUrgentProbe();
      });
    }, 0);
  }

  requestSync(options: { deep?: boolean; strict?: boolean } = {}): void {
    // Either device may initiate. A non-listening peer receives the request
    // through the authenticated heartbeat and joins the same forced session.
    const deep = options.deep === true;
    if (deep && !this.fullSyncRequested) {
      this.fullSyncRequested = true;
      this.fullSyncRequestId = randomId(18);
    }
    if (deep) {
      this.roundRequiresScanCompletion = true;
      this.beginSyncRound();
      // Claim the scan display before any background or realtime producer can
      // run. This prevents a small path manifest (1/5 files) from replacing a
      // four-thousand-file full-vault denominator mid-round.
      if (!this.fullRoundScanVisible) {
        this.fullRoundScanVisible = true;
        // Keep the last completed round visible while the new filesystem
        // snapshot is being enumerated. Clearing it here made every manual
        // round flash back to 0/0 even though the metadata index already knew
        // most files were unchanged.
        if (this.scanValue.total > 0) {
          this.scanValue = { ...this.scanValue, phase: "scanning", error: "" };
        } else {
          this.scanValue = this.emptyScanActivity();
        }
      }
    }
    // Normal wakeups consume only paths already discovered by Vault events or
    // the background producer. A deep reconciliation is explicit maintenance;
    // it is never inferred from queue size, index state, or elapsed time.
    const needsFilesystemScan = deep;
    if (needsFilesystemScan) {
      this.fullSyncOnlyPending = options.strict === true;
      this.forceFilesystemScanRequested = true;
      if (!options.strict) this.startBackgroundFilesystemReconciliation();
    }
    this.syncRequestId = randomId(18);
    this.wakeRealtimeSignalWaiters();
    const passivePeer = this.activePeers().find((peer) => !peer.canHost);
    if (passivePeer && this.progressValue.phase !== "scanning" && this.progressValue.phase !== "syncing") {
      this.emit({
        ...defaultProgress("connected"),
        stage: deep || this.dirtyPaths.size > 0 ? "requesting-peer-scan" : "waiting-peer-scan",
        active: true,
        peerId: passivePeer.deviceId
      });
    }
    this.scheduleSync(0, true);
  }

  private recordTransferFailure(path: string): void {
    // Exponential parking for a path that keeps failing. Without it the retry
    // requeue below turns a permanently broken file into a hot loop that
    // starves every healthy file behind it.
    const current = this.transferBackoff.get(path);
    const failures = Math.min(8, (current?.failures ?? 0) + 1);
    const delay = Math.min(5 * 60_000, 5_000 * 2 ** (failures - 1));
    this.transferBackoff.set(path, { failures, nextAttemptAt: this.now() + delay });
    if (this.transferBackoff.size > MAX_MANIFEST_FILES) {
      const oldest = [...this.transferBackoff.keys()].slice(0, this.transferBackoff.size - MAX_MANIFEST_FILES);
      for (const key of oldest) this.transferBackoff.delete(key);
    }
  }

  private recoverFromStalledSync(): void {
    if (!this.runningValue) return;
    const now = this.now();
    if (this.syncRunning && this.syncStartedAt > 0 && now - this.syncStartedAt > SYNC_WATCHDOG_MS) {
      // A hung await used to keep syncRunning latched forever, after which
      // every scheduleSync only flipped syncQueued and nothing ever ran again.
      this.syncRunning = false;
      this.syncStartedAt = 0;
      this.syncQueued = false;
      this.lastErrorValue = "sync_watchdog_reset";
      void this.probePeers(true);
      this.scheduleSync(URGENT_SYNC_DELAY_MS, true);
      return;
    }
    if (this.activeEditSyncRunning && this.activeEditStartedAt > 0 && now - this.activeEditStartedAt > SYNC_WATCHDOG_MS) {
      // Same guard for the dedicated single-file lane.
      this.activeEditSyncRunning = false;
      this.activeEditStartedAt = 0;
      this.lastErrorValue = "active_edit_watchdog_reset";
      void this.probePeers(true);
      if (this.activeEditDirty.size) this.scheduleActiveEditSync(ACTIVE_EDIT_SYNC_DELAY_MS);
      return;
    }
    if (this.metadataManifestBuild && this.manifestBuildStartedAt > 0 && now - this.manifestBuildStartedAt > SYNC_WATCHDOG_MS) {
      this.metadataManifestBuild = null;
      this.manifestBuildStartedAt = 0;
    }
    if (this.inboundSession && now - this.inboundSession.updatedAt > SYNC_WATCHDOG_MS) {
      for (const file of this.activityFiles) {
        if (file.state === "pending" || file.state === "syncing") file.state = "error";
      }
      this.inboundSession = null;
      this.currentTransferSessionId = "";
      this.emit({ ...defaultProgress("error"), active: true, error: "inbound_session_timeout" });
      return;
    }
    const scanning = this.progressValue.phase === "scanning" || this.progressValue.phase === "syncing";
    const busy = this.syncRunning || Boolean(this.inboundSession) || Boolean(this.backgroundReconciliation) || Boolean(this.metadataManifestBuild);
    if (scanning && !busy && this.progressUpdatedAt > 0 && now - this.progressUpdatedAt > SCAN_STALL_TIMEOUT_MS) {
      // The phase gate below refuses to schedule while "scanning" is shown.
      // Without this reset a single abandoned scan froze periodic sync for
      // the rest of the session.
      if (this.scanValue.phase === "scanning") this.scanValue.phase = "complete";
      const peer = this.activePeers()[0];
      this.emit({
        ...defaultProgress(peer ? "connected" : "discovering"),
        active: Boolean(peer),
        peerId: peer?.deviceId ?? ""
      });
    }
  }

  private requestPeriodicSync(): void {
    this.recoverFromStalledSync();
    if (!this.runningValue || this.syncRunning || this.inboundSession || this.metadataManifestBuild || this.manifestBuild) return;
    // Full-vault enumeration and incremental transfer intentionally overlap;
    // newly discovered paths are queued by the scanner and must not wait for
    // the complete manifest to finish.
    // Never start a periodic tick while the dedicated active-edit lane holds the
    // peer; the lane finishes first and the bulk round yields to it.
    if (this.activeEditSyncRunning) return;
    if (this.progressValue.phase === "scanning" || this.progressValue.phase === "syncing" || this.scanValue.phase === "scanning") return;
    const peers = this.activePeers();
    if (!peers.length) return;
    if (this.dirtyPaths.size || peers.some((peer) => (peer.remoteDirtyPaths?.size ?? 0) > 0)) {
      this.scheduleSync(0, false);
      return;
    }
    // No automatic whole-vault scan. Incremental, dirty-based sync is the default
    // and a full reconciliation is only triggered explicitly (requestSync({deep:true}))
    // or by the change-journal recovery fallback. When there is no dirty work the
    // periodic tick simply does nothing.
    return;
  }

  private startBackgroundFilesystemReconciliation(): void {
    if (!this.runningValue || this.backgroundReconciliation) return;
    // A full-vault round always covers the safe configuration files as well;
    // the setting only controls optional policy filtering, never discovery.
    const includeConfigFolder = true;
    this.reconciliationDirtyPaths.clear();
    const startedAt = this.now();
    const generationAtStart = this.dirtySequence;
    const promise = (async (): Promise<void> => {
      const peer = this.activePeers()[0];
      if (this.progressValue.phase !== "syncing") {
        this.emit({
          ...defaultProgress("connected"),
          stage: "enumerating",
          active: Boolean(peer),
          peerId: peer?.deviceId ?? ""
        });
      }
      await this.buildMetadataManifest(includeConfigFolder, undefined, true);
      // Bounded drain. Live editing keeps feeding this set, so an unbounded
      // loop never finished and every full sync stayed gated behind a
      // reconciliation that could not complete. Leftover paths stay in
      // dirtyPaths and are picked up by the next incremental pass.
      let rounds = 0;
      const reconciledPaths = new Set<string>();
      // Drain every discovered path. The batch size is only a transport
      // window; it must never become an implicit "32 files and stop" limit.
      while (this.reconciliationDirtyPaths.size && this.now() - startedAt < SYNC_WATCHDOG_MS) {
        rounds += 1;
        const changed = [...this.reconciliationDirtyPaths].filter((path) => !reconciledPaths.has(path));
        if (!changed.length) break;
        for (const path of changed) this.reconciliationDirtyPaths.delete(path);
        for (const path of changed) reconciledPaths.add(path);
        await this.buildMetadataManifestForPaths(changed, includeConfigFolder);
        for (const path of changed) this.reconciliationDirtyPaths.delete(path);
        if (rounds % 4 === 0) await yieldToLanEventLoop();
      }
      // Keep any paths discovered after the watchdog in the normal dirty queue
      // so the next pass can continue instead of silently dropping them.
      if (this.reconciliationDirtyPaths.size) {
        for (const path of this.reconciliationDirtyPaths) this.markDirtyPath(path, 0, true);
      }
      this.reconciliationDirtyPaths.clear();
      // Only claim coverage up to the generation observed when the walk
      // started. Anything newer must stay dirty so the incremental pass still
      // re-stats it, otherwise live edits would be silently dropped.
      this.metadataIndexGeneration = Math.max(this.metadataIndexGeneration, generationAtStart);
      if (this.fullSyncRequested) this.localFilesystemScanCompletedRequestId = this.fullSyncRequestId;
    })();
    this.backgroundReconciliation = promise;
    void promise.catch((error) => {
      this.lastErrorValue = safeErrorCode(error);
    }).finally(() => {
      if (this.backgroundReconciliation === promise) this.backgroundReconciliation = null;
      // A periodic tick may overlap the tail of reconciliation. Do not enqueue
      // a redundant round while another transfer is already active; the
      // transfer's finally block will pick up any remaining dirty paths.
      if (this.runningValue && !this.syncRunning && !this.activeEditSyncRunning) this.scheduleSync(0, true);
    });
  }

  private fullRescanIntervalMs(): number {
    return BACKGROUND_FULL_RESCAN_INTERVAL_MS;
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

  private changeJournalStorageKey(): string {
    return `ntfy.lan-sync.change-journal.v1.${this.identity?.vaultId ?? "unknown"}`;
  }

  private loadChangeJournal(): void {
    this.lastSyncCheckpointAt = this.lastFullScanAt;
    try {
      const raw = this.localStore()?.getItem(this.changeJournalStorageKey());
      if (!raw) return;
      const parsed = safeJsonObject(raw);
      if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.entries)) {
        this.lastFullScanAt = 0;
        return;
      }
      const checkpointAt = Number(parsed.checkpointAt);
      if (Number.isFinite(checkpointAt) && checkpointAt > 0) this.lastSyncCheckpointAt = checkpointAt;
      const restored = new Map<string, number>();
      for (const item of parsed.entries.slice(-MAX_MANIFEST_FILES)) {
        if (!Array.isArray(item) || item.length !== 2) continue;
        // Restore config-folder paths even when the setting is currently off;
        // the two-device policy is evaluated during planning, not while
        // recovering the durable journal.
        const path = this.normalizePath(item[0], true);
        const generation = Number(item[1]);
        if (!path || !Number.isSafeInteger(generation) || generation <= 0) continue;
        restored.set(path, generation);
      }
      this.dirtyPaths = restored;
      this.dirtySequence = Math.max(Number.isSafeInteger(Number(parsed.sequence)) ? Number(parsed.sequence) : 0, ...restored.values(), 0);
    } catch {
      this.dirtyPaths.clear();
      this.dirtySequence = 0;
      this.lastFullScanAt = 0;
    }
  }

  private async captureChangesSinceCheckpoint(): Promise<void> {
    if (this.lastSyncCheckpointAt <= 0 || !this.options.storage.listFilesChangedSince) return;
    try {
      const since = Math.max(0, this.lastSyncCheckpointAt - CHECKPOINT_MTIME_OVERLAP_MS);
      // Checkpoint recovery must include the complete vault. Filtering with
      // the legacy preference here used to drop .obsidian changes before they
      // reached the durable dirty journal.
      const changed = await this.options.storage.listFilesChangedSince(since, true);
      for (const file of changed.slice(0, MAX_MANIFEST_FILES)) this.markDirtyPath(file.path, QUEUED_SYNC_DELAY_MS);
    } catch {
      this.lastFullScanAt = 0;
      // A failed checkpoint read deliberately falls back to one full reconciliation.
    }
  }

  private queueChangeJournalSave(): void {
    if (this.changeJournalSaveTimer) clearTimeout(this.changeJournalSaveTimer);
    this.changeJournalSaveTimer = setTimeout(() => {
      this.changeJournalSaveTimer = null;
      this.saveChangeJournal();
    }, CHANGE_JOURNAL_SAVE_DELAY_MS);
  }

  private saveChangeJournal(): void {
    try {
      this.localStore()?.setItem(this.changeJournalStorageKey(), JSON.stringify({
        schemaVersion: 1,
        checkpointAt: this.lastSyncCheckpointAt,
        sequence: this.dirtySequence,
        entries: [...this.dirtyPaths.entries()].slice(-MAX_MANIFEST_FILES)
      }));
    } catch {
      // A failed persistence write only loses restart acceleration, not the current in-memory queue.
    }
  }

  private recordSyncCheckpoint(): void {
    this.lastSyncCheckpointAt = this.now();
    this.saveChangeJournal();
  }

  private metadataIndexPath(): string {
    return `${this.options.storage.identityRoot.replace(/\/+$/, "")}/metadata-index-v1.json`;
  }

  private async loadMetadataIndex(): Promise<void> {
    this.metadataIndex.clear();
    this.metadataIndexReady = false;
    try {
      const path = this.metadataIndexPath();
      if (!await this.options.storage.exists(path)) return;
      const parsed = safeJsonObject(await this.options.storage.readText(path));
      if (parsed.schemaVersion !== 1 || parsed.complete !== true || !Array.isArray(parsed.entries)) return;
      const entries = new Map<string, LanSyncMetadataSnapshot>();
      for (const item of parsed.entries.slice(-MAX_MANIFEST_FILES)) {
        if (!Array.isArray(item) || item.length !== 3) continue;
        const normalized = this.normalizePath(item[0], true);
        const size = Number(item[1]);
        const mtime = Number(item[2]);
        if (normalized && Number.isSafeInteger(size) && size >= 0 && size <= 512 * 1024 * 1024 && Number.isFinite(mtime) && mtime >= 0) {
          entries.set(normalized, { size, mtime });
        }
      }
      this.metadataIndex = entries;
      this.metadataIndexIncludesConfig = parsed.includeConfigFolder === true;
      this.metadataIndexMaxFileBytes = Number(parsed.maxFileBytes) || 0;
      this.metadataIndexReady = true;
    } catch {
      this.metadataIndex.clear();
      this.metadataIndexReady = false;
      this.lastFullScanAt = 0;
    }
  }

  private queueMetadataIndexSave(): void {
    if (!this.metadataIndexReady) return;
    if (this.metadataIndexSaveTimer) clearTimeout(this.metadataIndexSaveTimer);
    this.metadataIndexSaveTimer = setTimeout(() => {
      this.metadataIndexSaveTimer = null;
      void this.saveMetadataIndex();
    }, METADATA_INDEX_SAVE_DELAY_MS);
  }

  private async saveMetadataIndex(): Promise<void> {
    if (!this.metadataIndexReady) return;
    try {
      await this.options.storage.ensureFolder(this.options.storage.identityRoot);
      await this.options.storage.writeText(this.metadataIndexPath(), `${JSON.stringify({
        schemaVersion: 1,
        complete: true,
        includeConfigFolder: this.metadataIndexIncludesConfig,
        maxFileBytes: this.metadataIndexMaxFileBytes,
        entries: [...this.metadataIndex.entries()].slice(-MAX_MANIFEST_FILES).map(([path, metadata]) => [path, metadata.size, metadata.mtime])
      })}\n`);
    } catch {
      // A missing index costs one future reconciliation but does not affect correctness.
    }
  }

  private replaceMetadataIndex(
    entries: LanSyncMetadataEntry[],
    includeConfigFolder: boolean,
    preserveMutationsAfter = this.metadataIndexReplaceBaselineGeneration
  ): void {
    const next = new Map(entries.map((entry) => [entry.path, metadataSnapshot(entry)]));
    // A filesystem walk can overlap an inbound transfer. Do not let its
    // older snapshot erase a file written or deleted after enumeration began.
    for (const [path, mutation] of this.metadataIndexMutations) {
      if (mutation.generation <= preserveMutationsAfter) continue;
      if (mutation.metadata) next.set(path, mutation.metadata);
      else next.delete(path);
    }
    this.metadataIndex = next;
    this.metadataIndexReady = true;
    this.metadataIndexIncludesConfig = includeConfigFolder;
    this.metadataIndexMaxFileBytes = this.settings().maxFileBytes;
    this.queueMetadataIndexSave();
  }

  private canUseMetadataIndex(includeConfigFolder: boolean): boolean {
    return this.metadataIndexReady
      && (!includeConfigFolder || this.metadataIndexIncludesConfig)
      && this.metadataIndexMaxFileBytes >= this.settings().maxFileBytes;
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
      syncConfigFolder: raw.syncConfigFolder !== false,
      configDir: normalizedConfigDir(raw.configDir),
      port: normalizedPort(raw.port),
      maxFileBytes: normalizedMaxFileBytes(raw.maxFileBytes),
      inboxRetentionHours: normalizedInboxRetentionHours(raw.inboxRetentionHours),
      manualPeers: Array.isArray(raw.manualPeers) ? raw.manualPeers.map(String).slice(0, 32) : [],
      testMode: raw.testMode === true,
      testAutoUpdate: raw.testAutoUpdate === true,
      testDebug: raw.testDebug === true,
      // Preserve the optional shared-key handshake after normalizing runtime
      // settings. Omitting this field silently falls back to each device's
      // identity secret, so two otherwise matching devices reject each other.
      sharedSecret: typeof raw.sharedSecret === "string" ? raw.sharedSecret.trim().slice(0, 512) : ""
    };
  }

  private policy(): LanSyncPolicy {
    const settings = this.settings();
    return {
      incrementalPush: settings.mode === "bidirectional" || settings.mode === "incremental-push" || settings.mode === "delete-push",
      incrementalPull: settings.mode === "bidirectional" || settings.mode === "incremental-pull" || settings.mode === "delete-pull",
        // Bidirectional is the default five-way mode: content changes and
        // deletions flow both directions. The single-direction modes retain
        // their explicit delete semantics.
        deletePush: settings.mode === "bidirectional" || settings.mode === "delete-push",
        deletePull: settings.mode === "bidirectional" || settings.mode === "delete-pull",
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
      syncCandidates: 0,
      syncCandidatesTotal: 0,
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
    const sessionId = progress.sessionId
      || ((progress.phase === "syncing" || progress.phase === "complete") ? this.currentTransferSessionId : "");
    this.progressValue = {
      ...progress,
      sessionId,
      peerCount: this.activePeers().length,
      roundId: this.syncRoundId,
      roundCompleted: this.syncRoundCompleted,
      roundTotal: this.syncRoundTotal,
      scanCandidates: this.scanValue.syncCandidatesTotal ?? this.scanValue.syncCandidates ?? 0,
      syncConfigFolder: this.settings().syncConfigFolder
    };
    this.progressUpdatedAt = this.now();
    try {
      this.options.onProgress({ ...this.progressValue });
    } catch {
      // UI reporting must never interrupt synchronization.
    }
  }

  private emitActivityChanged(): void {
    try {
      this.options.onActivityChanged?.();
    } catch {
      // Activity reporting must never interrupt synchronization.
    }
  }

  /**
   * Publish a changed path to the transfer panel before manifest exchange.
   * Vault events are synchronous from the UI's point of view, while the
   * metadata request is asynchronous; keeping a pending row here makes that
   * gap visible without claiming that a transfer direction has been planned.
   */
  private ensurePendingActivityPath(path: string, action: LanSyncFileAction): void {
    // Startup catch-up and late Vault callbacks can arrive while the service
    // is stopped. Do not turn those durable journal entries into thousands of
    // visible transfer rows before LAN sync is actually running.
    if (!this.runningValue && !this.syncRunning && !this.activeEditSyncRunning && !this.inboundSession) return;
    const normalized = this.normalizePath(path, true);
    if (!normalized) return;
    const existing = this.activityFiles.find((file) => file.path === normalized);
    if (existing) {
      // A completed row is historical. A fresh event reopens it so the new
      // edit is visible immediately, while an active transfer keeps its
      // authoritative direction/state until the next plan is installed.
      if (existing.state === "complete" || existing.state === "deferred" || existing.state === "error") {
        existing.action = action;
        existing.state = "pending";
        existing.size = 0;
        this.activityUpdatedAt = this.now();
        this.emitActivityChanged();
      }
      return;
    }
    this.activityFiles.push({ path: normalized, action, state: "pending", size: 0 });
    this.activityUpdatedAt = this.now();
    this.emitActivityChanged();
  }

  private beginSyncRound(): void {
    if (this.syncRoundId) return;
    this.syncRoundId = randomId(12);
    this.syncRoundCompleted = 0;
    this.syncRoundTotal = 0;
    this.syncRoundPaths.clear();
    this.roundStartedAt = this.now();
  }

  private roundScanCompleted(peer: LanSyncPeer): boolean {
    const local = this.scanValue;
    const localComplete = local.phase !== "scanning"
      && local.phase !== "error"
      && local.totalKnown !== false
      && (local.total <= 0 || local.completed >= local.total);
    if (!localComplete) return false;
    // Older peers do not include progress in their manifest response. The
    // awaited manifest itself is the compatibility fallback in that case.
    const remote = peer.remoteProgress;
    if (!remote) return true;
    return remote.scanPhase !== "scanning"
      && remote.scanPhase !== "error"
      && remote.scanTotalKnown !== false
      && (remote.scanTotal <= 0 || remote.scanCompleted >= remote.scanTotal);
  }

  private isPersistableRoundHistory(item: LanSyncRoundHistory): boolean {
    if (!item || !item.id || item.finishedAt <= 0) return false;
    const localComplete = item.localScanTotal <= 0 || item.localScanCompleted >= item.localScanTotal;
    const remoteComplete = item.remoteScanTotal <= 0 || item.remoteScanCompleted >= item.remoteScanTotal;
    return localComplete && remoteComplete;
  }

  private mergeRemoteRoundHistory(value: unknown): void {
    if (!Array.isArray(value)) return;
    const safeNumber = (input: unknown): number => {
      const number = Number(input);
      return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
    };
    const incoming = value
      .filter((item): item is Record<string, unknown> => isRecord(item))
      .slice(-20)
      .map((item): LanSyncRoundHistory | null => {
        const id = typeof item.id === "string" && /^[A-Za-z0-9_-]{8,96}$/.test(item.id) ? item.id : "";
        if (!id) return null;
        return {
          id,
          startedAt: safeNumber(item.startedAt),
          finishedAt: safeNumber(item.finishedAt),
          peerId: typeof item.peerId === "string" ? item.peerId.slice(0, 96) : "",
          localScanCompleted: safeNumber(item.localScanCompleted),
          localScanTotal: safeNumber(item.localScanTotal),
          remoteScanCompleted: safeNumber(item.remoteScanCompleted),
          remoteScanTotal: safeNumber(item.remoteScanTotal),
          syncCompleted: safeNumber(item.syncCompleted),
          syncTotal: safeNumber(item.syncTotal),
          uploads: safeNumber(item.uploads),
          downloads: safeNumber(item.downloads),
          status: item.status === "error" || item.status === "partial" ? item.status : "complete"
        };
      })
      .filter((item): item is LanSyncRoundHistory => Boolean(item && this.isPersistableRoundHistory(item)));
    if (!incoming.length) return;
    const merged = new Map<string, LanSyncRoundHistory>();
    for (const item of [...this.roundHistory, ...incoming]) merged.set(item.id, item);
    const next = [...merged.values()]
      .sort((left, right) => (left.finishedAt - right.finishedAt) || left.id.localeCompare(right.id))
      .slice(-20);
    if (JSON.stringify(next) === JSON.stringify(this.roundHistory)) return;
    this.roundHistory = next;
    this.saveRoundHistory();
    this.emitActivityChanged();
  }

  private roundHistoryStorageKey(): string {
    return `ntfy.lan-sync.round-history.v1.${this.identity?.vaultId ?? "unknown"}`;
  }

  private loadRoundHistory(): void {
    const raw = this.localStore()?.getItem(this.roundHistoryStorageKey());
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      this.roundHistory = parsed
        .filter((item): item is LanSyncRoundHistory => Boolean(item && typeof item.id === "string" && Number.isFinite(Number(item.finishedAt))))
        .filter((item) => this.isPersistableRoundHistory(item))
        .slice(-20);
    } catch {
      this.roundHistory = [];
    }
  }

  private publishScanSignal(scan: LanSyncScanActivity, force = false): void {
    const current = this.scanSignalValue;
    // Keep a foreground/full scan authoritative while a small path manifest
    // runs alongside it. Once the current signal is complete, the next scan
    // may take over and its own denominator is sent to the peer.
    if (!force && current && current !== scan && current.phase === "scanning") return;
    this.scanSignalValue = scan;
  }

  private saveRoundHistory(): void {
    try {
      this.localStore()?.setItem(this.roundHistoryStorageKey(), JSON.stringify(this.roundHistory.slice(-20)));
    } catch {
      // History is diagnostic state; synchronization must continue if storage
      // is temporarily unavailable.
    }
  }

  private finishSyncRound(peer: LanSyncPeer, status: LanSyncRoundHistory["status"] = "complete"): boolean {
    if (!this.syncRoundId || !this.roundStartedAt) return false;
    // Active-edit transfers can finish while a full-vault scan is still
    // enumerating. Keep the round alive and visible; history is written only
    // after the scan gate is satisfied.
    if (!this.roundScanCompleted(peer)) {
      // Even an incremental transfer can overlap the independent filesystem
      // walk. Promote it to a gated round so the next scheduler tick retries
      // the history commit after scanning reaches its denominator.
      this.roundRequiresScanCompletion = true;
      return false;
    }
    const remote = peer.remoteProgress;
    const history: LanSyncRoundHistory = {
      id: this.syncRoundId,
      startedAt: this.roundStartedAt,
      finishedAt: this.now(),
      peerId: peer.deviceId,
      localScanCompleted: this.scanValue.completed,
      localScanTotal: this.scanValue.total,
      remoteScanCompleted: remote?.scanCompleted ?? 0,
      remoteScanTotal: remote?.scanTotal ?? 0,
      syncCompleted: this.syncRoundCompleted,
      syncTotal: this.syncRoundTotal,
      uploads: this.progressValue.uploads,
      downloads: this.progressValue.downloads,
      status
    };
    if (!this.isPersistableRoundHistory(history)) return false;
    this.roundHistory.push(history);
    this.roundHistory = this.roundHistory.slice(-20);
    this.saveRoundHistory();
    this.emitActivityChanged();
    return true;
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
    return interfaces.sort((left, right) => {
      const priority = (LAN_LINK_PRIORITY[left.linkType] ?? 50) - (LAN_LINK_PRIORITY[right.linkType] ?? 50);
      return priority || left.address.localeCompare(right.address);
    });
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
    const registry = lanSyncGlobalRegistry();
    if (registry.__ntfyLanSyncServer) {
      await closeLanSyncServer(registry.__ntfyLanSyncServer);
      delete registry.__ntfyLanSyncServer;
    }
    const registryKey = `${this.identity?.vaultId ?? "unknown"}:${this.settings().port}`;
    const servers = registry.__ntfyLanSyncServers ?? (registry.__ntfyLanSyncServers = {});
    if (servers[registryKey] && servers[registryKey] !== this.server) {
      await closeLanSyncServer(servers[registryKey]);
      delete servers[registryKey];
    }
    let latestError: unknown = null;
    for (let offset = 0; offset <= 8; offset += 1) {
      const port = this.settings().port + offset;
      for (let attempt = 0; attempt < (offset === 0 ? 4 : 1); attempt += 1) try {
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
        servers[registryKey] = server;
        return;
      } catch (error) {
        latestError = error;
        if (offset === 0 && attempt < 3) await new Promise((resolve) => setTimeout(resolve, 75));
      }
    }
    throw new Error(`lan_server_bind_failed:${safeErrorCode(latestError)}`);
  }

  private async startDiscoverySocket(): Promise<void> {
    const dgram = nodeRequire<NodeDgram>("node:dgram") ?? nodeRequire<NodeDgram>("dgram");
    if (!dgram) return;
    const registry = lanSyncGlobalRegistry();
    if (registry.__ntfyLanSyncDiscoverySocket) {
      await closeLanSyncDiscoverySocket(registry.__ntfyLanSyncDiscoverySocket);
      delete registry.__ntfyLanSyncDiscoverySocket;
    }
    const registryKey = `${this.identity?.vaultId ?? "unknown"}:${DISCOVERY_PORT}`;
    const sockets = registry.__ntfyLanSyncDiscoverySockets ?? (registry.__ntfyLanSyncDiscoverySockets = {});
    if (sockets[registryKey] && sockets[registryKey] !== this.socket) {
      await closeLanSyncDiscoverySocket(sockets[registryKey]);
      delete sockets[registryKey];
    }
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
    sockets[registryKey] = socket;
  }

  private announce(): void {
    if (!this.runningValue || !this.socket || !this.identity || !this.boundPort) return;
    const packet = Buffer.from(JSON.stringify({
      protocol: PROTOCOL_NAME,
      version: PROTOCOL_VERSION,
      vaultId: this.identity.vaultId,
      deviceId: this.deviceId,
      port: this.boundPort,
      timestamp: this.now(),
      // Discovery is intentionally unauthenticated and carries only a
      // monotonic-looking wake token. The receiver still performs the normal
      // encrypted /ping before accepting any paths. Including the token here
      // lets a mobile peer wake immediately when its long-poll request was
      // suspended, instead of waiting for the next 900 ms probe.
      syncRequestId: this.syncRequestId
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
      const existing = this.peers.get(raw.deviceId);
      const wasInactive = !existing || !this.isPeerActive(existing);
      const announcedSyncRequestId = typeof raw.syncRequestId === "string"
        && /^[A-Za-z0-9_-]{12,96}$/.test(raw.syncRequestId)
        ? raw.syncRequestId
        : "";
      // A changed token means the peer has new dirty paths. Force an
      // authenticated probe even when the peer was already considered
      // healthy; this is the fast path for desktop -> mobile edits when the
      // mobile long-poll was paused by the OS or WebView.
      const hasFreshSyncSignal = Boolean(
        announcedSyncRequestId
        && announcedSyncRequestId !== existing?.lastRemoteSyncRequestId
      );
      const peer = this.upsertPeer(raw.deviceId, port, [address], this.now(), true, false);
      // A fresh announcement is the fastest signal that two devices are back
      // on the same Wi-Fi. Probe immediately when the previous connection was
      // stale/failed; healthy peers still use the normal 900 ms cadence.
      void this.verifyPeer(peer, wasInactive || peer.consecutiveFailures > 0 || hasFreshSyncSignal);
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
        remoteForceFilesystemScan: false,
        remoteDirtyPaths: new Map(),
        remotePriorityDirtyPaths: new Map(),
        remoteProgress: null,
        policy: passivePeerPolicy(),
        capabilities: new Set(),
        compatibilityPendingSince: 0,
        testBuild: null
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
    const metadataProtocol = METADATA_PROTOCOLS.find((protocol) => route.startsWith(`${API_PREFIX}${protocol.routePrefix}/`));
    if (metadataProtocol) {
      peer.capabilities.add(metadataProtocol.capability);
      peer.compatibilityPendingSince = 0;
      if (this.lastErrorValue === "peer_upgrade_required") this.lastErrorValue = "";
    }
    if (firstVerifiedConnection && route.endsWith("/ping")) {
      this.syncRequestId = randomId(18);
      this.wakeRealtimeSignalWaiters();
    }
    const transfer = route.includes("/file/") || route.includes("/attachment/");
    if (transfer) this.lastTransferAt = this.now();
    if (
      !transfer
      && !(this.progressValue.active && ["enumerating", "fingerprinting", "packaging-manifest", "planning", "waiting-plan", "transferring"].includes(this.progressValue.stage))
      && this.progressValue.phase !== "scanning"
      && this.progressValue.phase !== "syncing"
      && this.progressValue.phase !== "complete"
    ) {
      this.emit({
        ...defaultProgress("connected"),
        stage: this.metadataProtocol(peer) ? "waiting-peer-scan" : "checking-peer",
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
      const index = this.activityFiles.findIndex((file) => file.path === path && file.state !== "complete");
      if (index < 0) return null;
      this.activityFiles[index].state = "syncing";
      this.inboundSession.updatedAt = now;
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
    // Prefer the totals the coordinator announced in /session/start. Counting
    // only locally observed files made the two ends display different
    // denominators for the very same transfer.
    const session = this.inboundSession?.deviceId === deviceId ? this.inboundSession : null;
    if (session) {
      this.syncRoundId = session.roundId || this.syncRoundId;
      this.syncRoundCompleted = Math.max(this.syncRoundCompleted, session.roundCompleted + completed);
      this.syncRoundTotal = Math.max(this.syncRoundTotal, session.roundTotal);
    }
    this.emit({
      ...defaultProgress(phase),
      active: true,
      peerId: deviceId,
      completed,
      total: Math.max(session?.total ?? 0, this.activityFiles.length),
      bytesTransferred,
      bytesTotal: Math.max(session?.bytesTotal ?? 0, this.activityFiles.reduce((sum, file) => sum + file.size, 0)),
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
    const selected = new Map<string, number>();
    for (const path of this.urgentDirtyPaths) {
      const generation = this.dirtyPaths.get(path);
      if (generation !== undefined) selected.set(path, generation);
    }
    for (const [path, generation] of [...this.dirtyPaths.entries()].reverse()) {
      if (!selected.has(path)) selected.set(path, generation);
    }
    return [...selected.entries()]
      .map(([path, generation]) => ({ path, generation }));
  }

  private parseDirtyPaths(value: unknown): Map<string, number> {
    const paths = new Map<string, number>();
    if (!Array.isArray(value) || value.length > MAX_MANIFEST_FILES) return paths;
    for (const item of value) {
      if (!isRecord(item)) continue;
      const path = this.normalizePath(item.path, true);
      const generation = Number(item.generation);
      if (!path || !Number.isSafeInteger(generation) || generation <= 0) continue;
      paths.set(path, generation);
    }
    return paths;
  }

  private parseScanRequestIds(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return [...new Set(value
      .filter((item): item is string => typeof item === "string" && /^[A-Za-z0-9_-]{12,96}$/.test(item))
      .slice(0, 4))];
  }

  private filesystemScanAlreadyServed(deviceId: string, requestIds: string[]): boolean {
    if (!requestIds.length) return false;
    const served = new Set(this.servedFilesystemScanRequests.get(deviceId) ?? []);
    return requestIds.every((requestId) => requestId === this.localFilesystemScanCompletedRequestId || served.has(requestId));
  }

  private recordServedFilesystemScan(deviceId: string, requestIds: string[]): void {
    if (!requestIds.length) return;
    const previous = this.servedFilesystemScanRequests.get(deviceId) ?? [];
    this.servedFilesystemScanRequests.set(deviceId, [...new Set([...previous, ...requestIds])].slice(-16));
  }

  private metadataProtocol(peer: LanSyncPeer): (typeof METADATA_PROTOCOLS)[number] | null {
    return METADATA_PROTOCOLS.find((protocol) => peer.capabilities.has(protocol.capability)) ?? null;
  }

  private metadataRoute(peer: LanSyncPeer, suffix: string): string {
    const protocol = this.metadataProtocol(peer);
    if (!protocol) throw new LanSyncProtocolError("peer_upgrade_required", 426);
    return `${protocol.routePrefix}${suffix}`;
  }

  private parseTestBuild(value: unknown): LanSyncTestBuild | null {
    if (!isRecord(value)) return null;
    const version = typeof value.version === "string" && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value.version)
      ? value.version
      : "";
    const buildId = typeof value.buildId === "string" && /^[A-Za-z0-9_.-]{8,128}$/.test(value.buildId)
      ? value.buildId
      : "";
    const createdAt = typeof value.createdAt === "string" ? value.createdAt.slice(0, 64) : "";
    if (!version || !buildId || !createdAt || !Array.isArray(value.files)) return null;
    const files: LanSyncTestBuildFile[] = [];
    for (const item of value.files) {
      if (!isRecord(item) || !TEST_BUILD_FILE_NAMES.includes(item.name as typeof TEST_BUILD_FILE_NAMES[number])) continue;
      const size = Number(item.size);
      const hash = typeof item.hash === "string" ? item.hash : "";
      if (!Number.isSafeInteger(size) || size < 0 || size > 20 * 1024 * 1024 || !/^[A-Za-z0-9_-]{32,64}$/.test(hash)) continue;
      files.push({ name: item.name as LanSyncTestBuildFile["name"], size, hash });
    }
    return files.length === TEST_BUILD_FILE_NAMES.length ? { version, buildId, createdAt, files } : null;
  }

  private compareTestVersions(left: string, right: string): number {
    const parse = (value: string): number[] => {
      const match = /^(\d+)\.(\d+)\.(\d+)(?:-test\.(\d+))?/i.exec(value);
      return match ? match.slice(1).map((item) => Number(item || 0)) : [0, 0, 0, 0];
    };
    const a = parse(left);
    const b = parse(right);
    for (let index = 0; index < a.length; index += 1) if (a[index] !== b[index]) return a[index] - b[index];
    return left.localeCompare(right);
  }

  private async maybeAutoUpdateTestBuild(peer: LanSyncPeer): Promise<void> {
    const local = this.localTestBuild;
    const remote = peer.testBuild;
    if (!local || !remote || !this.settings().testAutoUpdate || !this.options.installTestBuild) return;
    if (!peer.capabilities.has(TEST_UPDATE_CAPABILITY) || this.compareTestVersions(remote.version, local.version) <= 0) return;
    if (this.testUpdateInFlight || this.lastTestUpdateBuildId === remote.buildId) return;
    this.testUpdateInFlight = true;
    this.lastTestUpdateBuildId = remote.buildId;
    try {
      const response = await this.callPeer(peer, "/test/update/manifest", {}, 15_000);
      const build = this.parseTestBuild(response.build);
      if (!build || build.buildId !== remote.buildId) throw new Error("invalid_test_build");
      const files: Record<string, ArrayBuffer> = {};
      for (const descriptor of build.files) {
        const result = await this.callPeer(peer, "/test/update/file", { name: descriptor.name, buildId: build.buildId }, 30_000);
        const data = base64UrlToBytes(typeof result.data === "string" ? result.data : "");
        if (data.byteLength !== descriptor.size || await sha256Bytes(data) !== descriptor.hash) throw new Error("test_build_hash_mismatch");
        files[descriptor.name] = arrayBuffer(data);
      }
      await this.options.installTestBuild(build, files);
      void this.sendTestDebug({ type: "test-build-installed", version: build.version, buildId: build.buildId });
    } catch (error) {
      this.lastErrorValue = `test_update:${safeErrorCode(error)}`;
      void this.sendTestDebug({ type: "test-build-update-failed", error: safeErrorCode(error) });
    } finally {
      this.testUpdateInFlight = false;
    }
  }

  async sendTestDebug(event: Record<string, unknown>): Promise<void> {
    if (!this.settings().testMode) return;
    const safeEvent = Object.fromEntries(Object.entries(event).slice(0, 32).map(([key, value]) => [String(key).slice(0, 64), typeof value === "string" ? value.slice(0, 2000) : value]));
    await Promise.all(this.syncTargets().filter((peer) => peer.capabilities.has(TEST_DEBUG_CAPABILITY)).map(async (peer) => {
      await this.callPeer(peer, "/test/debug", { event: safeEvent, sentAt: new Date(this.now()).toISOString() }, 10_000).catch(() => undefined);
    }));
  }

  private syncSignalPayload(): Record<string, unknown> {
    const testEnabled = Boolean(this.settings().testMode && this.localTestBuild);
    return {
      capabilities: [
        ...METADATA_PROTOCOLS.map((protocol) => protocol.capability),
        REALTIME_WAKEUP_CAPABILITY,
        ...(testEnabled ? [TEST_UPDATE_CAPABILITY, TEST_DEBUG_CAPABILITY] : [])
      ],
      testBuild: testEnabled ? this.localTestBuild : null,
      syncRequestId: this.syncRequestId,
      // Include the current authenticated endpoint in every response. Mobile
      // peers may have a stale descriptor after a DHCP/adapter change; the
      // next request then repairs the endpoint without waiting for discovery.
      endpoint: {
        port: this.boundPort || this.settings().port,
        addresses: this.localAddresses()
      },
      fullSyncRequestId: this.fullSyncRequested ? this.fullSyncRequestId : "",
      forceFilesystemScan: this.fullSyncRequested && this.forceFilesystemScanRequested,
      dirtyPaths: this.dirtySnapshot(),
      progress: this.progressSignal(),
      roundHistory: this.roundHistory.slice(-20)
    };
  }

  private progressSignal(): Record<string, unknown> {
    // The heartbeat carries a compact view of what this device is doing so the
    // other end can mirror it. Previously a passive peer showed nothing at all
    // while the coordinator scanned, which read as "stuck" on one side and
    // "working" on the other.
    const scan = this.scanSignalValue ?? this.scanValue;
    const scanTotal = Math.max(0, Math.floor(scan.total));
    const scanCompleted = Math.min(Math.max(0, Math.floor(scan.completed)), scanTotal);
    return {
      phase: this.progressValue.phase,
      sessionId: this.progressValue.sessionId,
      stage: this.progressValue.stage,
      completed: Math.max(0, Math.floor(this.progressValue.completed)),
      total: Math.max(0, Math.floor(this.progressValue.total)),
      bytesTransferred: Math.max(0, Math.floor(this.progressValue.bytesTransferred)),
      bytesTotal: Math.max(0, Math.floor(this.progressValue.bytesTotal)),
      uploads: Math.max(0, Math.floor(this.progressValue.uploads)),
      uploadCompleted: Math.max(0, Math.floor(this.progressValue.uploadCompleted)),
      downloads: Math.max(0, Math.floor(this.progressValue.downloads)),
      downloadCompleted: Math.max(0, Math.floor(this.progressValue.downloadCompleted)),
      scanPhase: scan.phase,
      scanTotalKnown: scan.totalKnown !== false,
      scanCompleted,
      scanTotal,
      roundId: this.syncRoundId,
      roundCompleted: Math.max(0, Math.floor(this.syncRoundCompleted)),
      roundTotal: Math.max(0, Math.floor(this.syncRoundTotal)),
      scanCandidates: Math.max(0, Math.floor(scan.syncCandidatesTotal ?? scan.syncCandidates ?? 0)),
      updatedAt: this.progressUpdatedAt
    };
  }

  private parseRemoteProgress(value: unknown): LanSyncRemoteProgress | null {
    if (!isRecord(value)) return null;
    const phases: LanSyncProgressPhase[] = ["stopped", "discovering", "connected", "scanning", "syncing", "complete", "error"];
    const phase = phases.find((candidate) => candidate === value.phase);
    if (!phase) return null;
    const count = (input: unknown): number => {
      const parsed = Number(input);
      return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
    };
    const scanTotal = count(value.scanTotal);
    const scanCompleted = Math.min(count(value.scanCompleted), scanTotal);
    return {
      sessionId: typeof value.sessionId === "string" && /^[A-Za-z0-9_-]{12,96}$/.test(value.sessionId) ? value.sessionId : "",
      phase,
      stage: typeof value.stage === "string" && value.stage.length <= 48 ? value.stage : "",
      completed: count(value.completed),
      total: count(value.total),
      bytesTransferred: count(value.bytesTransferred),
      bytesTotal: count(value.bytesTotal),
      uploads: count(value.uploads),
      uploadCompleted: count(value.uploadCompleted),
      downloads: count(value.downloads),
      downloadCompleted: count(value.downloadCompleted),
      scanPhase: value.scanPhase === "scanning" || value.scanPhase === "complete" || value.scanPhase === "error" || value.scanPhase === "idle"
        ? value.scanPhase
        : "idle",
      scanTotalKnown: value.scanTotalKnown !== false,
      scanCompleted,
      scanTotal,
      roundId: typeof value.roundId === "string" && /^[A-Za-z0-9_-]{8,96}$/.test(value.roundId) ? value.roundId : "",
      roundCompleted: count(value.roundCompleted),
      roundTotal: count(value.roundTotal),
      scanCandidates: count(value.scanCandidates),
      receivedAt: this.now()
    };
  }

  private applyRemoteSyncSignal(peer: LanSyncPeer, payload: Record<string, unknown>): boolean {
    const endpoint = isRecord(payload.endpoint) ? payload.endpoint : null;
    if (endpoint) {
      const remotePort = normalizedPort(endpoint.port, 0);
      const remoteAddresses = Array.isArray(endpoint.addresses)
        ? endpoint.addresses.filter((value): value is string => typeof value === "string" && isPrivateLanAddress(value))
        : [];
      if (remotePort) peer.port = remotePort;
      if (remoteAddresses.length && !peer.manual) {
        const preferred = sortLanAddresses(remoteAddresses, this.localInterfaces());
        peer.addresses = new Set([...preferred, ...peer.addresses].slice(0, PEER_MAX_ADDRESS_HISTORY));
      }
    }
    const capabilities = (Array.isArray(payload.capabilities) ? payload.capabilities : [])
      .filter((value): value is string => typeof value === "string" && value.length <= 64);
    const compatibleCapabilities = METADATA_PROTOCOLS
      .map((protocol) => protocol.capability)
      .filter((capability) => capabilities.includes(capability));
    if (compatibleCapabilities.length) {
      for (const capability of compatibleCapabilities) peer.capabilities.add(capability);
      peer.compatibilityPendingSince = 0;
      if (this.lastErrorValue === "peer_upgrade_required") this.lastErrorValue = "";
    } else if (!this.metadataProtocol(peer) && peer.compatibilityPendingSince <= 0) {
      peer.compatibilityPendingSince = this.now();
    }
    if (capabilities.includes(REALTIME_WAKEUP_CAPABILITY)) {
      peer.capabilities.add(REALTIME_WAKEUP_CAPABILITY);
      this.ensureRealtimeWakeupPoll(peer);
    }
    if (capabilities.includes(TEST_UPDATE_CAPABILITY) || capabilities.includes(TEST_DEBUG_CAPABILITY)) {
      if (capabilities.includes(TEST_UPDATE_CAPABILITY)) peer.capabilities.add(TEST_UPDATE_CAPABILITY);
      if (capabilities.includes(TEST_DEBUG_CAPABILITY)) peer.capabilities.add(TEST_DEBUG_CAPABILITY);
      const remoteBuild = this.parseTestBuild(payload.testBuild);
      peer.testBuild = remoteBuild;
      void this.maybeAutoUpdateTestBuild(peer);
    } else {
      peer.testBuild = null;
    }
    const requestId = typeof payload.syncRequestId === "string" && /^[A-Za-z0-9_-]{12,96}$/.test(payload.syncRequestId)
      ? payload.syncRequestId
      : "";
    const requested = Boolean(requestId && requestId !== peer.lastRemoteSyncRequestId);
    if (requestId) peer.lastRemoteSyncRequestId = requestId;
    const remoteFullSyncRequestId = typeof payload.fullSyncRequestId === "string" && /^[A-Za-z0-9_-]{12,96}$/.test(payload.fullSyncRequestId)
      ? payload.fullSyncRequestId
      : "";
    // Rolling-upgrade compatibility: old peers may keep broadcasting a stale
    // full request after an interrupted scan. Once this peer already has a
    // successful ledger, consume only its real dirty paths and never let that
    // stale request restart a whole-vault scan.
    const hasPeerBaseline = Object.keys(this.loadMetadataLedger(peer.deviceId).entries).length > 0;
    peer.remoteFullSyncRequestId = hasPeerBaseline ? "" : remoteFullSyncRequestId;
    if (peer.remoteFullSyncRequestId) {
      this.roundRequiresScanCompletion = true;
      this.beginSyncRound();
    }
    peer.remoteForceFilesystemScan = Boolean(peer.remoteFullSyncRequestId && payload.forceFilesystemScan === true);
    const previousRemoteDirty = peer.remoteDirtyPaths;
    const incomingRemoteDirty = this.parseDirtyPaths(payload.dirtyPaths);
    let receivedPriorityPath = false;
    for (const [path, generation] of incomingRemoteDirty) {
      if (generation <= (previousRemoteDirty.get(path) ?? 0)) continue;
      peer.remotePriorityDirtyPaths.set(path, generation);
      // The remote heartbeat is the first signal a passive device receives;
      // show the path right away instead of waiting for /manifest/paths.
      this.ensurePendingActivityPath(path, "pull");
      receivedPriorityPath = true;
    }
    peer.remoteDirtyPaths = incomingRemoteDirty;
    if (receivedPriorityPath && (this.syncRunning || this.activeEditSyncRunning)) {
      // The desktop may be a passive HTTP peer. Its Vault event reaches the
      // mobile coordinator through /ping, so remote dirty generations must
      // preempt bulk work exactly like a local editor event.
      this.prioritySyncPending = true;
    }
    const remoteProgress = this.parseRemoteProgress(payload.progress);
    if (remoteProgress) peer.remoteProgress = remoteProgress;
    this.mergeRemoteRoundHistory(payload.roundHistory);
    this.mirrorRemoteProgress(peer);
    // Heartbeat progress is an activity stream too. Refresh the panel even
    // while the local device is scanning so the remote scan never looks stuck.
    this.emitActivityChanged();
    return requested || receivedPriorityPath;
  }

  private mirrorRemoteProgress(peer: LanSyncPeer): void {
    const remote = peer.remoteProgress;
    if (!remote) return;
    // Only mirror while this device has nothing of its own to show. Local
    // work always wins so the two ends converge on the same numbers instead
    // of fighting over the status bar.
    if (this.syncRunning || this.inboundSession || this.backgroundReconciliation) return;
    if (this.progressValue.phase === "scanning" || this.progressValue.phase === "syncing") return;
    if (this.now() - remote.receivedAt > PEER_PROBE_INTERVAL_MS * 12) return;
    if (
      remote.phase !== "syncing"
      && !["enumerating", "fingerprinting", "packaging-manifest", "requesting-peer-scan", "planning", "waiting-plan"].includes(remote.stage)
    ) return;
    if (remote.phase !== "syncing") {
      this.emit({
        ...defaultProgress("connected"),
        stage: remote.stage === "fingerprinting"
          ? "fingerprinting"
          : remote.stage === "packaging-manifest"
            ? "packaging-manifest"
            : remote.stage === "planning"
              ? "planning"
              : remote.stage === "waiting-plan"
                ? "waiting-plan"
              : "enumerating",
        active: true,
        peerId: peer.deviceId
      });
      return;
    }
    this.emit({
      ...defaultProgress("syncing"),
      sessionId: remote.sessionId,
      stage: "transferring",
      active: true,
      peerId: peer.deviceId,
      completed: remote.completed,
      total: remote.total,
      bytesTransferred: remote.bytesTransferred,
      bytesTotal: remote.bytesTotal,
      uploads: remote.downloads,
      uploadCompleted: remote.downloadCompleted,
      downloads: remote.uploads,
      downloadCompleted: remote.uploadCompleted
    });
  }

  private emitPeerConnectionStage(peer: LanSyncPeer): void {
    if (this.progressValue.phase === "scanning" || this.progressValue.phase === "syncing" || this.inboundSession) return;
    if (this.progressValue.active && ["enumerating", "fingerprinting", "packaging-manifest", "planning", "waiting-plan", "transferring"].includes(this.progressValue.stage)) return;
    const hasPendingWork = this.fullSyncRequested || Boolean(peer.remoteFullSyncRequestId) || (peer.remoteDirtyPaths?.size ?? 0) > 0;
    if (this.progressValue.phase === "complete" && !hasPendingWork) return;
    const compatible = this.metadataProtocol(peer) !== null;
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

  private async verifyPeer(peer: LanSyncPeer, force = false): Promise<void> {
    const now = this.now();
    const minimumProbeInterval = Math.max(300, PEER_PROBE_INTERVAL_MS - 100);
    // A passive mobile peer can still be the recipient of a desktop edit. If
    // its realtime-wakeup channel is already negotiated, that long poll is
    // the lower-latency path and an extra forced ping only competes with it;
    // older peers without the capability still get the direct probe.
    if (!this.runningValue || !peer.addresses.size) return;
    if (!peer.canHost && peer.capabilities.has(REALTIME_WAKEUP_CAPABILITY)) return;
    if (peer.probing) {
      if (force) this.urgentProbePending = true;
      return;
    }
    if (!force && now - peer.lastProbeAt < minimumProbeInterval) return;
    peer.probing = true;
    peer.lastProbeAt = now;
    const wasActiveBeforeProbe = this.isPeerActive(peer, now);
    const firstVerifiedConnection = peer.verifiedAt <= 0;
    try {
      const probeTimeout = peer.consecutiveFailures > 0 ? PEER_RECONNECT_PROBE_TIMEOUT_MS : PEER_PROBE_TIMEOUT_MS;
      const response = await this.callPeer(peer, "/ping", this.syncSignalPayload(), probeTimeout);
      const responseDeviceId = typeof response.deviceId === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(response.deviceId) ? response.deviceId : "";
      if (response.protocolVersion !== PROTOCOL_VERSION || !responseDeviceId) throw new Error("peer_identity_mismatch");
      if (responseDeviceId !== peer.deviceId) {
        if (!peer.manual) throw new Error("peer_identity_mismatch");
        const oldKey = [...this.peers.entries()].find(([, candidate]) => candidate === peer)?.[0] ?? "";
        const existing = this.peers.get(responseDeviceId);
        if (existing && existing !== peer) {
          for (const address of peer.addresses) existing.addresses.add(address);
          existing.port = peer.port;
          // An inbound heartbeat can create the device-id keyed peer before
          // the configured manual endpoint finishes its first probe. Preserve
          // the endpoint's host capability when those two records merge;
          // otherwise the verified peer is silently excluded from syncTargets.
          existing.canHost = existing.canHost || peer.canHost;
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
      if (
        this.progressValue.phase !== "scanning"
        && this.progressValue.phase !== "syncing"
        && this.progressValue.phase !== "complete"
        && !["enumerating", "fingerprinting", "packaging-manifest", "planning", "waiting-plan"].includes(this.progressValue.stage)
      ) {
        this.emit({ ...defaultProgress("connected"), stage: "waiting-peer-scan", active: true, peerId: peer.deviceId });
      }
      this.emitPeersChanged();
      await this.receiveQueuedMessages(peer, response.messages);
      this.ensureRealtimeWakeupPoll(peer);
      // A probe can be the first successful request after a short Wi-Fi
      // interruption. In that case the peer is no longer considered active
      // when the Vault event was raised, so the event's immediate scheduler
      // had no target and returned. Do not leave that durable dirty journal
      // waiting for the next periodic tick; the successful probe itself is
      // the hand-off point and should start the transfer now.
      if (
        firstVerifiedConnection
        || remoteRequestedSync
        || (!wasActiveBeforeProbe && (
          this.hasPrioritySyncWork()
          || this.dirtyPaths.size > 0
          || this.fullSyncRequested
          || this.syncQueued
        ))
      ) this.scheduleSync(0, true);
    } catch (error) {
      const code = safeErrorCode(error);
      if (code === "invalid_auth" || code === "peer_rejected" || code === "peer_unreachable") this.lastErrorValue = code;
      peer.consecutiveFailures = Math.min(100, peer.consecutiveFailures + 1);
      peer.lastFailureAt = this.now();
      // Keep an authenticated peer visible through short network jitter. The
      // stable grace window below decides when it is genuinely offline.
      if (force || peer.consecutiveFailures <= 2) this.scheduleReconnectProbe();
    } finally {
      peer.probing = false;
      if (this.urgentProbePending) this.scheduleUrgentProbe();
    }
  }

  private scheduleReconnectProbe(): void {
    if (!this.runningValue || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.probePeers(true);
    }, RECONNECT_REPROBE_DELAY_MS);
  }

  private async probePeers(force = false): Promise<void> {
    if (!this.runningValue) return;
    await this.refreshIdentityIfChanged();
    this.refreshManualPeers();
    await Promise.all([...this.peers.values()].slice(0, 16).map(async (peer) => await this.verifyPeer(peer, force)));
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
    // Discovery packets are not a connection. A peer that has stopped sending
    // authenticated heartbeats/probe responses must leave the active set
    // quickly, otherwise a disconnected Wi-Fi link remains displayed for the
    // whole grace window and blocks a fresh connection from taking over.
    // Discovery announcements are unauthenticated liveness hints and may
    // continue after the peer's TCP service has stopped. Once probes have
    // failed repeatedly, only the last authenticated response can keep the
    // peer active; otherwise manual sync is queued against a dead endpoint
    // and appears to do nothing indefinitely.
    const lastSignalAt = peer.consecutiveFailures >= 3
      ? peer.verifiedAt
      : Math.max(peer.lastSeenAt, peer.verifiedAt);
    if (peer.consecutiveFailures >= 3 && lastSignalAt > 0 && now - lastSignalAt > PEER_LINK_IDLE_TIMEOUT_MS) return false;
    if (peer.lastFailureAt > lastSignalAt && now - peer.lastFailureAt > PEER_FAILURE_EVICTION_DELAY_MS) return false;
    const stableGraceMs = Math.max(PEER_MIN_STABLE_GRACE_MS, PEER_PROBE_INTERVAL_MS * 12);
    return now - peer.verifiedAt <= stableGraceMs;
  }

  private sweepPeers(): void {
    this.recoverFromStalledSync();
    const active = this.activePeers();
    if (!active.length) {
      if (this.progressValue.active) this.emit({ ...defaultProgress("discovering"), active: false });
      this.emitPeersChanged();
      return;
    }
    const hasActiveTransfer = this.activityFiles.some((file) => file.state === "syncing");
    if (
      this.progressValue.phase === "syncing"
      && !this.syncRunning
      && !this.inboundSession
      && !hasActiveTransfer
      && this.now() - this.lastTransferAt > TRANSFER_IDLE_RESET_MS
    ) {
      this.emit({ ...defaultProgress("connected"), active: true, peerId: active[0].deviceId });
    }
  }

  private scheduleSync(delay: number, force = false): void {
    if (!this.runningValue || !this.syncTargets().length) return;
    if (!force && !this.settings().autoDiscovery) return;
    if (force) this.syncForced = true;
    if (this.syncRunning || this.activeEditSyncRunning) {
      // Keep a durable wake-up while the current session owns the peer. A live
      // edit is consumed at the next action boundary instead of waiting for a
      // later periodic tick.
      if (this.hasPrioritySyncWork()) {
        this.prioritySyncPending = true;
        // Manifest exchange is not wire ownership. The priority path can run
        // concurrently with a full scan and will wait only if a transfer
        // session is already active.
        if (!this.activeEditSyncRunning) this.scheduleActiveEditSync(0);
      }
      return;
    }
    // An urgent edit must preempt an older delayed timer. Leaving that timer in
    // place made a fresh change wait behind the previous 750ms wake-up.
    if (this.syncTimer && delay <= 0) {
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
    } else if (this.syncTimer && delay > 0) {
      // Keep the earliest queued wake-up; ordinary edits must not keep
      // postponing a pending transfer by resetting its timer.
      return;
    }
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

  private ensureRealtimeWakeupPoll(peer: LanSyncPeer): void {
    if (
      this.options.desktop
      || !this.runningValue
      || !peer.canHost
      || !peer.capabilities.has(REALTIME_WAKEUP_CAPABILITY)
      || this.realtimeWakeupPolls.has(peer.deviceId)
    ) return;

    const deviceId = peer.deviceId;
    const poll = this.runRealtimeWakeupPoll(peer).finally(() => {
      if (this.realtimeWakeupPolls.get(deviceId) === poll) {
        this.realtimeWakeupPolls.delete(deviceId);
      }
      if (
        this.runningValue
        && peer.canHost
        && peer.capabilities.has(REALTIME_WAKEUP_CAPABILITY)
        && !this.realtimeWakeupRetryTimers.has(deviceId)
      ) {
        const retry = setTimeout(() => {
          this.realtimeWakeupRetryTimers.delete(deviceId);
          this.ensureRealtimeWakeupPoll(peer);
        }, RECONNECT_REPROBE_DELAY_MS);
        this.realtimeWakeupRetryTimers.set(deviceId, retry);
      }
    });
    this.realtimeWakeupPolls.set(deviceId, poll);
  }

  private async runRealtimeWakeupPoll(peer: LanSyncPeer): Promise<void> {
    while (
      this.runningValue
      && this.peers.get(peer.deviceId) === peer
      && peer.capabilities.has(REALTIME_WAKEUP_CAPABILITY)
    ) {
      try {
        const response = await this.callPeer(
          peer,
          "/events/wait",
          { sinceSyncRequestId: peer.lastRemoteSyncRequestId },
          REALTIME_WAKEUP_TIMEOUT_MS + 5_000
        );
        const remoteRequestedSync = this.applyRemoteSyncSignal(peer, response);
        peer.policy = policyFromRaw(response.policy);
        await this.receiveQueuedMessages(peer, response.messages);
        if (remoteRequestedSync || peer.remoteDirtyPaths.size > 0) {
          this.scheduleSync(0, true);
        }
    } catch {
      // A transient Wi-Fi failure must not permanently kill the realtime
      // channel. The finally block schedules a fresh long-poll attempt.
      // Mark the authenticated peer stale immediately. Otherwise the mobile
      // UI could keep showing a connected Wi-Fi icon for the full grace
      // window after the desktop disappeared.
      peer.consecutiveFailures = Math.max(3, peer.consecutiveFailures + 1);
      peer.lastFailureAt = this.now();
      this.emitPeersChanged();
      break;
      }
      await yieldToLanEventLoop();
    }
  }

  private wakeRealtimeSignalWaiters(): void {
    const waiters = [...this.realtimeSignalWaiters];
    this.realtimeSignalWaiters.clear();
    for (const resolve of waiters) resolve();
  }

  private wakeRealtimeProgressSignal(): void {
    const now = this.now();
    if (now - this.lastRealtimeProgressSignalAt < 80) return;
    this.lastRealtimeProgressSignalAt = now;
    this.wakeRealtimeSignalWaiters();
  }

  private async waitForRealtimeSignal(sinceSyncRequestId: string): Promise<void> {
    if (!this.runningValue || sinceSyncRequestId !== this.syncRequestId) return;
    await new Promise<void>((resolve) => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      const finish = (): void => {
        if (timer) clearTimeout(timer);
        timer = null;
        this.realtimeSignalWaiters.delete(finish);
        resolve();
      };
      timer = setTimeout(finish, REALTIME_WAKEUP_TIMEOUT_MS);
      this.realtimeSignalWaiters.add(finish);
      if (!this.runningValue || sinceSyncRequestId !== this.syncRequestId) finish();
    });
  }

  private hasPrioritySyncWork(): boolean {
    return this.activeEditDirty.size > 0
      || this.syncTargets().some((peer) => peer.remotePriorityDirtyPaths.size > 0);
  }

  private async syncActivePeers(): Promise<void> {
    const forced = this.syncForced;
    this.syncForced = false;
    // Keep one transfer session per peer, but let the active lane run while a
    // background filesystem reconciliation is merely enumerating.
    if (!this.runningValue || !this.isCoordinator()) return;
    // A live edit gets the first session boundary. This also covers the race
    // where the ordinary timer fires just before the active-lane timer.
    if (this.hasPrioritySyncWork() && !this.activeEditSyncRunning) {
      this.prioritySyncPending = true;
      this.scheduleActiveEditSync(0);
      return;
    }
    if (this.syncRunning || this.activeEditSyncRunning) {
      // Dirty paths and remote signals are durable queues themselves. Do not
      // toggle a second latch while a transfer is active; that latch used to
      // make the next progress pass appear to restart from zero.
      return;
    }
    // Do not gate the transfer scheduler on the background scanner. The scanner
    // feeds dirty paths incrementally and the coordinator can transfer them
    // while the rest of the vault is still being enumerated.
    const peers = this.syncTargets();
    if (!peers.length) return;
    const hasRemoteDirty = peers.some((peer) => (peer.remoteDirtyPaths?.size ?? 0) > 0);
    const hasIncrementalWork = this.dirtyPaths.size > 0 || hasRemoteDirty;
    // Every transfer pass is a visible round, including ordinary incremental
    // edits. Previously history was created only for explicit full-vault
    // requests, so successful one-file syncs never appeared in the panel.
    const hasRemoteFullSync = peers.some((peer) => Boolean(peer.remoteFullSyncRequestId));
    if (!hasIncrementalWork && !this.fullSyncRequested && !hasRemoteFullSync) {
      // A realtime lane may have drained the transfer while a background
      // filesystem walk was still finishing. Give that same round one final
      // chance to commit history once both scan counters are complete.
      if (this.syncRoundId && this.roundRequiresScanCompletion && this.roundScanCompleted(peers[0])) {
        const roundFinished = this.finishSyncRound(peers[0], "complete");
        if (roundFinished) {
          this.syncRoundId = "";
          this.syncRoundCompleted = 0;
          this.syncRoundTotal = 0;
          this.roundRequiresScanCompletion = false;
          this.fullRoundScanVisible = false;
        }
      }
      return;
    }
    if (!this.syncRoundId) this.beginSyncRound();
    // A real changed path always outranks reconciliation. Even a full request
    // already advertised by either side waits until all discovered paths have
    // drained through bounded transfer batches.
    // A manual full sync must be advertised immediately, even while the
    // background filesystem walk is still enumerating. The peer can start its
    // own scan in parallel; discovered paths remain eligible for incremental
    // transfer and no longer leave the manual button apparently idle.
    const localFullSyncRequestId = this.fullSyncRequested && !hasIncrementalWork
      ? this.fullSyncRequestId
      : "";
    const localDirty = new Map<string, number>();
    for (const path of this.activeEditDirty) {
      const generation = this.dirtyPaths.get(path);
      if (generation !== undefined) localDirty.set(path, generation);
    }
    for (const [path, generation] of this.dirtyPaths) {
      if (!localDirty.has(path)) localDirty.set(path, generation);
    }
    // A manual full sync is serialized: no incremental session is opened until
    // the local full manifest has finished and the same full request is ready
    // to be exchanged with the peer.
    let localForceFilesystemScan = Boolean(
      localFullSyncRequestId
      && this.forceFilesystemScanRequested
      && this.localFilesystemScanCompletedRequestId !== localFullSyncRequestId
    );
    let remoteForceFilesystemScan = Boolean(localFullSyncRequestId && this.forceFilesystemScanRequested);
    const urgentPaths = new Set([...localDirty.keys()].filter((path) => this.urgentDirtyPaths.has(path)));
    for (const path of urgentPaths) this.urgentDirtyPaths.delete(path);
    // All priority work observed before this point was routed through the fast
    // lane above. A later event will set the latch again while this batch runs.
    this.prioritySyncPending = false;
    this.syncRunning = true;
    this.syncStartedAt = this.now();
    try {
      // A strict manual round starts both manifest requests immediately. The
      // local and peer filesystem walks then run concurrently inside
      // syncPeerMetadata(), while transfer remains gated on both promises.
      // This keeps the full-vault guarantee without making the phone sit idle
      // until the desktop finishes a 16k-path scan.
      let settledAcrossPeers: Set<string> | null = null;
      let fullSyncCompletedEverywhere = Boolean(localFullSyncRequestId || peers.some((peer) => Boolean(peer.remoteFullSyncRequestId)));
      let priorityYieldedAcrossPeers = false;
      let synchronizedPeers = 0;
      for (const peer of peers) {
        if (!this.runningValue) break;
        if (this.now() - peer.lastSyncAt < SYNC_MIN_INTERVAL_MS && !this.syncQueued && !forced) continue;
        const result = await this.syncPeer(peer, localDirty, localFullSyncRequestId, localForceFilesystemScan, remoteForceFilesystemScan, urgentPaths);
        priorityYieldedAcrossPeers = priorityYieldedAcrossPeers || result.priorityYielded;
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
        if (fullSyncCompletedEverywhere && this.fullSyncRequested && (!localFullSyncRequestId || this.fullSyncRequestId === localFullSyncRequestId)) {
          this.fullSyncRequested = false;
          this.forceFilesystemScanRequested = false;
          this.localFilesystemScanCompletedRequestId = "";
          this.fullSyncOnlyPending = false;
        }
        const pendingAfterRound = this.dirtyPaths.size > 0
          || this.fullSyncRequested
          || peers.some((peer) => (peer.remoteDirtyPaths?.size ?? 0) > 0 || Boolean(peer.remoteFullSyncRequestId));
        if (this.syncRoundId && !priorityYieldedAcrossPeers) {
          // A round stays open while any dirty path or full-scan request is
          // pending. New edits discovered during enumeration are merged into
          // this same round instead of being recorded as a separate partial
          // history item.
          const roundFinished = !pendingAfterRound
            ? this.finishSyncRound(peers[0], "complete")
            : false;
          if (roundFinished) {
            this.syncRoundId = "";
            this.syncRoundCompleted = 0;
            this.syncRoundTotal = 0;
            this.syncRoundPaths.clear();
            this.roundRequiresScanCompletion = false;
            this.fullRoundScanVisible = false;
          }
        }
        this.recordSyncCheckpoint();
      }
    } catch (error) {
      this.lastErrorValue = safeErrorCode(error);
      // A temporary disconnect is part of the same round. Keep its id and
      // cumulative counters so reconnecting resumes the in-flight work instead
      // of creating a stream of zero-file error history entries.
      if (this.syncRoundId && peers.length && !isTransientSyncError(error)) {
        this.finishSyncRound(peers[0], "error");
        this.syncRoundId = "";
        this.syncRoundCompleted = 0;
        this.syncRoundTotal = 0;
        this.syncRoundPaths.clear();
      }
      this.syncQueued = true;
      const peer = peers[0];
      if (isTransientSyncError(error)) {
        // Preserve the current batch counters while the peer is reconnecting;
        // replacing them with defaultProgress(error) made a healthy in-flight
        // round visibly jump back to 0/0.
        this.emit({
          ...this.progressValue,
          phase: "connected",
          stage: "checking-peer",
          active: Boolean(peer),
          peerId: peer?.deviceId ?? "",
          error: this.lastErrorValue
        });
      } else {
        this.emit({
          ...defaultProgress("error"),
          stage: this.lastErrorValue === "peer_upgrade_required" ? "peer-upgrade-required" : "error",
          active: Boolean(peer),
          peerId: peer?.deviceId ?? "",
          error: this.lastErrorValue
        });
      }
    } finally {
      this.syncRunning = false;
      this.syncStartedAt = 0;
      this.currentTransferSessionId = "";
      // Anything the user touched while this pass was running must not wait a
      // further 750ms behind the generic queue delay. Only genuinely new edits
      // take the fast lane, so a permanently deferred path cannot spin.
      const hasUrgentWork = this.urgentDirtyPaths.size > 0;
      if (
        this.syncQueued
        || hasUrgentWork
        || this.dirtyPaths.size > 0
        || this.fullSyncRequested
        || peers.some((peer) => (peer.remoteDirtyPaths?.size ?? 0) > 0 || Boolean(peer.remoteFullSyncRequestId))
      ) {
        this.syncQueued = false;
        this.scheduleSync(hasUrgentWork || this.dirtyPaths.size > 0 ? URGENT_SYNC_DELAY_MS : QUEUED_SYNC_DELAY_MS, true);
      }
      // After a bulk round, give the actively-edited file its own fast pass.
      if (this.hasPrioritySyncWork()) this.scheduleActiveEditSync(ACTIVE_EDIT_SYNC_DELAY_MS);
    }
  }

  /**
   * Dedicated single-file channel for the actively-edited file. It runs only
   * when the main round is idle (mutually exclusive via the two latches) so the
   * active file gets its own fast scan+transfer without ever racing the bulk
   * round or a peer session. After it finishes it hands control back to the
   * main round if bulk work is still pending.
   */
  private scheduleActiveEditSync(delay: number): void {
    if (!this.runningValue || !this.hasPrioritySyncWork()) return;
    if (!this.syncTargets().length) return;
    if (this.activeEditSyncRunning) return;
    if (this.syncRunning && this.transferSessionActive) {
      this.prioritySyncPending = true;
      return;
    }
    // Keep the earliest wake-up. Repeated heartbeat/sync signals must never
    // postpone an already queued 0ms priority pass indefinitely.
    if (this.activeEditTimer) {
      if (this.activeEditTimerDueAt <= this.now() + Math.max(0, delay)) return;
      clearTimeout(this.activeEditTimer);
      this.activeEditTimer = null;
    }
    this.activeEditTimerDueAt = this.now() + Math.max(0, delay);
    this.activeEditTimer = setTimeout(() => {
      this.activeEditTimer = null;
      this.activeEditTimerDueAt = 0;
      void this.runActiveEditSync();
    }, Math.max(0, delay));
  }

  private async runActiveEditSync(): Promise<void> {
    if (!this.runningValue || this.activeEditSyncRunning || !this.isCoordinator()) return;
    // A new edit is a green-lane event. Park the ordinary batch briefly so
    // this one-path session can start immediately after the current request
    // boundary, instead of waiting for every bulk file to drain.
    if (this.syncRunning && this.transferSessionActive) {
      this.prioritySyncPending = true;
      return;
    }
    this.prioritySyncPending = false;
    // Snapshot the priority queues. New generations arriving during this pass
    // remain queued and cause the current plan to yield at its next file
    // boundary. Removing only the captured generations avoids a stale pass
    // consuming a newer edit.
    const localPaths = [...this.activeEditDirty].filter((path) => this.dirtyPaths.has(path));
    const remotePriorityByPeer = new Map<LanSyncPeer, Map<string, number>>();
    for (const peer of this.syncTargets()) {
      const captured = new Map<string, number>();
      for (const [path, generation] of peer.remotePriorityDirtyPaths) {
        if ((peer.remoteDirtyPaths.get(path) ?? 0) < generation) continue;
        captured.set(path, generation);
        if (peer.remotePriorityDirtyPaths.get(path) === generation) peer.remotePriorityDirtyPaths.delete(path);
      }
      if (captured.size) remotePriorityByPeer.set(peer, captured);
    }
    if (!localPaths.length && !remotePriorityByPeer.size) {
      this.activeEditDirty.clear();
      return;
    }
    const peers = this.syncTargets();
    if (!peers.length) return;
    const localDirty = new Map(localPaths.map((path) => [path, this.dirtyPaths.get(path) ?? this.dirtySequence]));
    let settledAcrossPeers: Set<string> | null = null;
    let synchronizedPeers = 0;
    this.activeEditSyncRunning = true;
    this.activeEditStartedAt = this.now();
    try {
      for (const peer of peers) {
        if (!this.runningValue) break;
        if (this.syncRunning && this.transferSessionActive) break;
        if (!this.metadataProtocol(peer)) {
          this.lastErrorValue = "peer_upgrade_required";
          continue;
        }
        const remoteDirty = remotePriorityByPeer.get(peer) ?? new Map<string, number>();
        const priorityPaths = new Set([...localPaths, ...remoteDirty.keys()]);
        if (!priorityPaths.size) {
          synchronizedPeers += 1;
          continue;
        }
        // Small path-manifest request: it includes only live local edits and
        // newly announced remote paths, never unrelated bulk reconciliation.
        const result = await this.syncPeerMetadata(peer, {
          fullSync: false,
          paths: priorityPaths,
          localDirty,
          remoteDirty,
          urgentPaths: priorityPaths,
          localFullSyncRequestId: "",
          remoteFullSyncRequestId: "",
          forceLocalFilesystemScan: false,
          forceRemoteFilesystemScan: false
        });
        settledAcrossPeers = settledAcrossPeers === null
          ? new Set(result.settledLocalPaths)
          : new Set([...settledAcrossPeers].filter((path) => result.settledLocalPaths.has(path)));
        synchronizedPeers += 1;
      }
      if (synchronizedPeers === peers.length) {
        const settled = settledAcrossPeers ?? new Set<string>();
        // Keep paths that were superseded or yielded at an action boundary in
        // the active lane. They remain in dirtyPaths and must be retried as a
        // fast edit, rather than silently falling back to the slow bulk pass.
        for (const path of localPaths) {
          if (settled.has(path)) this.activeEditDirty.delete(path);
        }
        for (const path of settled) {
          const generation = localDirty.get(path);
          if (generation !== undefined && (this.dirtyPaths.get(path) ?? 0) <= generation) this.dirtyPaths.delete(path);
          this.urgentDirtyPaths.delete(path);
        }
        this.queueChangeJournalSave();
        const pendingAfterRound = this.dirtyPaths.size > 0
          || this.fullSyncRequested
          || peers.some((peer) => (peer.remoteDirtyPaths?.size ?? 0) > 0 || Boolean(peer.remoteFullSyncRequestId));
        if (this.syncRoundId && !pendingAfterRound) {
          const roundFinished = this.finishSyncRound(peers[0], "complete");
          if (roundFinished) {
            this.syncRoundId = "";
            this.syncRoundCompleted = 0;
            this.syncRoundTotal = 0;
            this.syncRoundPaths.clear();
            this.roundRequiresScanCompletion = false;
            this.fullRoundScanVisible = false;
          }
        }
        this.recordSyncCheckpoint();
      }
    } catch (error) {
      this.lastErrorValue = safeErrorCode(error);
    } finally {
      // A failed or superseded priority pass remains priority work. The normal
      // remote dirty journal is authoritative; rebuild the fast queue from any
      // captured generation that the session did not acknowledge.
      for (const [peer, captured] of remotePriorityByPeer) {
        for (const [path, generation] of captured) {
          const pendingGeneration = peer.remoteDirtyPaths.get(path) ?? 0;
          if (pendingGeneration < generation) continue;
          peer.remotePriorityDirtyPaths.set(path, Math.max(
            peer.remotePriorityDirtyPaths.get(path) ?? 0,
            pendingGeneration
          ));
        }
      }
      this.activeEditSyncRunning = false;
      this.activeEditStartedAt = 0;
      this.currentTransferSessionId = "";
      // Hand control back to the bulk round if it still has pending work. The
      // lane does not self-reschedule: it is re-triggered by the next keystroke
      // (notifyActiveEdit) or by the bulk round's finally block, which avoids a
      // tight retry loop if a peer is temporarily unreachable.
      if (this.hasPrioritySyncWork()) this.scheduleActiveEditSync(ACTIVE_EDIT_SYNC_DELAY_MS);
      if (
        !this.hasPrioritySyncWork()
        && (
          this.syncQueued
          || this.urgentDirtyPaths.size
          || this.dirtyPaths.size
          || this.fullSyncRequested
          || peers.some((peer) => (peer.remoteDirtyPaths?.size ?? 0) > 0 || Boolean(peer.remoteFullSyncRequestId))
        )
      ) {
        this.syncQueued = false;
        this.scheduleSync(URGENT_SYNC_DELAY_MS, true);
      }
    }
  }

  private async syncPeer(
    peer: LanSyncPeer,
    localDirty = new Map(this.dirtyPaths),
    localFullSyncRequestId = this.fullSyncRequested ? this.fullSyncRequestId : "",
    localForceFilesystemScan = Boolean(localFullSyncRequestId && this.forceFilesystemScanRequested),
    remoteForceFilesystemScan = Boolean(localFullSyncRequestId && this.forceFilesystemScanRequested),
    urgentPaths = new Set<string>()
  ): Promise<LanSyncPeerResult> {
    if (!this.metadataProtocol(peer)) throw new LanSyncProtocolError("peer_upgrade_required", 426);
    const remoteDirty = new Map(peer.remoteDirtyPaths ?? []);
    const hasIncrementalWork = localDirty.size > 0 || remoteDirty.size > 0;
    const remoteFullSyncRequestId = this.backgroundReconciliation || hasIncrementalWork
      ? ""
      : peer.remoteFullSyncRequestId ?? "";
    const fullSync = Boolean(localFullSyncRequestId || remoteFullSyncRequestId);
    const paths = new Set([...localDirty.keys(), ...remoteDirty.keys()]);
    if (!fullSync && !paths.size) return { settledLocalPaths: new Set(), fullSyncComplete: false, priorityYielded: false };
    return await this.syncPeerMetadata(peer, {
      fullSync,
      paths,
      localDirty,
      remoteDirty,
      urgentPaths,
      localFullSyncRequestId,
      remoteFullSyncRequestId,
      forceLocalFilesystemScan: localForceFilesystemScan || peer.remoteForceFilesystemScan,
      forceRemoteFilesystemScan: remoteForceFilesystemScan || peer.remoteForceFilesystemScan
    });
  }

  private async syncPeerMetadata(peer: LanSyncPeer, request: {
    fullSync: boolean;
    paths: Set<string>;
    localDirty: Map<string, number>;
    remoteDirty: Map<string, number>;
    urgentPaths?: Set<string>;
    localFullSyncRequestId: string;
    remoteFullSyncRequestId: string;
    forceLocalFilesystemScan: boolean;
    forceRemoteFilesystemScan: boolean;
  }): Promise<LanSyncPeerResult> {
    // Scanning owns scanValue only. Keep the previous immutable transfer
    // snapshot visible until the next /session/start freezes a new plan.
    this.emit({
      ...defaultProgress("connected"),
      stage: "requesting-peer-scan",
      active: true,
      peerId: peer.deviceId
    });
    this.emitActivityChanged();
    const localPolicy = this.policy();
    const requestedPaths = [...request.paths].sort((left, right) => left.localeCompare(right));
    const localEntriesPromise = (request.fullSync
        ? this.buildMetadataManifest(true, undefined, request.forceLocalFilesystemScan)
        : this.buildMetadataManifestForPaths(requestedPaths, true))
      .then((entries) => {
        if (request.fullSync && this.progressValue.phase !== "syncing") {
          this.emit({
            ...defaultProgress("connected"),
            stage: "waiting-peer-scan",
            active: true,
            peerId: peer.deviceId
          });
        }
        return entries;
      });
    const [localEntries, remoteResponse, ledger] = await Promise.all([
      localEntriesPromise,
      this.callPeer(
        peer,
        this.metadataRoute(peer, request.fullSync ? "/manifest" : "/manifest/paths"),
        request.fullSync
          ? {
              syncConfigFolder: true,
              forceFilesystemScan: request.forceRemoteFilesystemScan,
              scanRequestIds: [request.localFullSyncRequestId, request.remoteFullSyncRequestId].filter(Boolean)
            }
          : { syncConfigFolder: true, paths: requestedPaths },
        // A remote manifest can require a full filesystem walk on the peer.
        // The old 8s default made every large vault fail before the peer
        // could answer, which restarted the same scan forever.
        request.fullSync ? MANIFEST_TIMEOUT_MS : PATH_MANIFEST_TIMEOUT_MS
      ),
      Promise.resolve(this.loadMetadataLedger(peer.deviceId))
    ]);
    const manifestProgress = this.parseRemoteProgress(remoteResponse.progress);
    if (manifestProgress) peer.remoteProgress = manifestProgress;
    // A manifest response is also a live authenticated heartbeat. Apply its
    // endpoint and dirty signal so a stale descriptor is repaired during the
    // very request that discovered the peer, before planning transfers.
    this.applyRemoteSyncSignal(peer, remoteResponse);
    this.mergeRemoteRoundHistory(remoteResponse.roundHistory);
    this.emit({
      ...defaultProgress("connected"),
      stage: "planning",
      active: true,
      peerId: peer.deviceId
    });
    const remotePolicy = policyFromRaw(remoteResponse.policy);
    peer.policy = remotePolicy;
    // Full-vault sessions always include safe .obsidian files, even when one
    // side is an older peer that advertised the legacy false flag.
    const shareConfig = true;
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
    // Metadata is the sole synchronization authority: a path is equal only
    // when both sides report the exact same size and modification time. Do
    // not hash same-sized files here; hashing is reserved for wire integrity.
    for (const path of [...new Set([...localMap.keys(), ...remoteMap.keys()])]) {
      const local = localMap.get(path);
      const remote = remoteMap.get(path);
      if (local && remote && metadataMatches(local, remote)) {
        ledger.entries[path] = { local: metadataSnapshot(local), remote: metadataSnapshot(remote) };
      }
    }
    // The scan is finished here — hand the status bar off to the sync/prep
    // phase instead of re-showing the completed scan total (which read as
    // "scan progress stuck at the finished count"). The real transfer progress
    // is emitted below once actions are known.
    this.emitActivityChanged();
    const plannedActions = planLanSyncMetadataReconciliation(filteredLocalEntries, remoteEntries, ledger.entries, localPolicy, remotePolicy);
    // Dirty journal entries are wake-up hints. Metadata remains authoritative,
    // so stale journal entries cannot create false transfers.
    const plannedPathSet = new Set(plannedActions.map((action) => action.path));
    // Re-check dirty paths after planning so a just-arrived metadata change is
    // included without waiting for another full scan.
    for (const path of new Set([...request.localDirty.keys(), ...request.remoteDirty.keys()])) {
      if (plannedPathSet.has(path)) continue;
      const local = localMap.get(path);
      const remote = remoteMap.get(path);
      if (!local || !remote) continue;
      // A dirty journal can survive an interrupted or older session. If both
      // sides now expose the exact same metadata, clear the stale signal
      // without creating a transfer. Only an actual size/mtime difference
      // enters the normal conflict rules below.
      if (metadataMatches(local, remote)) {
        ledger.entries[path] = { local: metadataSnapshot(local), remote: metadataSnapshot(remote) };
        continue;
      }
      if (request.localDirty.has(path) && request.remoteDirty.has(path) && (localPolicy.incrementalPush || remotePolicy.incrementalPull) && (localPolicy.incrementalPull || remotePolicy.incrementalPush)) {
        plannedActions.push({ kind: metadataWinner(local, remote, localPolicy.conflictRule) === "local" ? "push" : "pull", path, local, remote });
        plannedPathSet.add(path);
      } else if (request.localDirty.has(path) && (localPolicy.incrementalPush || remotePolicy.incrementalPull)) {
        plannedActions.push({ kind: "push", path, local, remote });
        plannedPathSet.add(path);
      } else if (request.remoteDirty.has(path) && (localPolicy.incrementalPull || remotePolicy.incrementalPush)) {
        plannedActions.push({ kind: "pull", path, local, remote });
        plannedPathSet.add(path);
      }
    }
    // actionPaths must reflect the full plan, not the runnable subset, so a
    // path parked in backoff is never mistaken for "already in sync".
    const actionPaths = new Set(plannedActions.map((action) => action.path));
    const backoffNow = this.now();
    const runnableActions = plannedActions.filter((action) => (this.transferBackoff.get(action.path)?.nextAttemptAt ?? 0) <= backoffNow);
    const actions = prioritizeLanSyncActions(runnableActions, {
      urgent: request.urgentPaths ?? new Set<string>(),
      localDirty: request.localDirty,
      remoteDirty: request.remoteDirty
    });
    if (!this.syncRoundId) this.beginSyncRound();
    // The round denominator is cumulative and path-based. A retry, a yielded
    // priority batch, or a second peer manifest must not count the same file
    // again and make the two devices report different totals.
    for (const action of actions) {
      if (this.syncRoundPaths.has(action.path)) continue;
      this.syncRoundPaths.add(action.path);
      this.syncRoundTotal += 1;
    }
    const settledPaths = new Set([...selectedPaths].filter((path) => !actionPaths.has(path)));
    const commits: LanSyncMetadataCommit[] = [];
    for (const path of settledPaths) {
      const local = localMap.get(path);
      const remote = remoteMap.get(path);
      const baseline = ledger.entries[path];
      if (local && remote && (metadataLedgerMatches(local, remote) || (baseline && metadataLedgerMatches(local, baseline.local) && metadataLedgerMatches(remote, baseline.remote)))) {
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
    let sessionId = randomId(18);
    this.currentTransferSessionId = sessionId;
    // A full-vault manifest can be built while the priority lane transfers a
    // newly changed path. Do not let the two transfer sessions overlap; wait
    // only at the actual wire-ownership boundary, never for the full scan.
    if (request.fullSync) {
      const waitStartedAt = this.now();
      while (this.activeEditSyncRunning && this.now() - waitStartedAt < SESSION_TIMEOUT_MS) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }
    this.transferSessionActive = true;
    let sessionStart: Record<string, unknown>;
    try {
      sessionStart = await this.callPeer(peer, this.metadataRoute(peer, "/session/start"), {
        sessionId,
        total: actions.length,
        bytesTotal,
        uploads,
        downloads,
        // The transfer denominator is shared by both devices. Scan totals
        // remain device-local and are shown only in the check section.
        roundId: this.syncRoundId,
        roundCompleted: this.syncRoundCompleted,
        roundTotal: this.syncRoundTotal,
        files: this.activityFiles.map((file) => ({ path: file.path, action: file.action, size: file.size }))
      }, SESSION_TIMEOUT_MS);
    } catch (error) {
      this.transferSessionActive = false;
      throw error;
    }
    // The receiver may already own this exact plan after a request timeout.
    // It returns the authoritative session ID so the coordinator can resume
    // the existing transfer instead of opening a second session that waits
    // forever behind the first one.
    if (typeof sessionStart.sessionId === "string" && /^[A-Za-z0-9_-]{12,96}$/.test(sessionStart.sessionId)) {
      sessionId = sessionStart.sessionId;
      this.currentTransferSessionId = sessionId;
    }
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
    let failureStreak = 0;
    const retryPaths = new Set<string>();
    const failedPaths = new Set<string>();
    const runAction = async (index: number): Promise<LanSyncMetadataActionResult> => {
      let lastError: unknown = null;
      for (let attempt = 0; attempt <= TRANSFER_RETRY_LIMIT; attempt += 1) {
        try {
          return await this.executeMetadataAction(peer, actions[index], ledger, sessionId);
        } catch (error) {
          lastError = error;
          const code = safeErrorCode(error);
          // A stale precondition means the file changed underneath us; the
          // caller re-queues it instead of burning retries here.
          if (code === "precondition_failed" || code === "peer_upgrade_required") throw error;
          if (attempt === TRANSFER_RETRY_LIMIT || !this.runningValue) break;
          await new Promise((resolve) => setTimeout(resolve, TRANSFER_RETRY_BASE_DELAY_MS * (attempt + 1)));
        }
      }
      throw lastError;
    };
    const transferWorker = async (): Promise<void> => {
      while (this.runningValue && failure === null && cursor < actions.length) {
        // Yield only between actions. This keeps the current file atomic while
        // preventing a large bulk plan from starving a newly edited file.
        if (this.prioritySyncPending) break;
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
          const result = await runAction(index);
          failureStreak = 0;
          this.transferBackoff.delete(actions[index].path);
          if (activity) activity.state = "complete";
          settledPaths.add(actions[index].path);
          if (result.commit) commits.push(result.commit);
          completed += 1;
          this.syncRoundCompleted += 1;
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
          // A single unreadable or rejected file used to abort the entire
          // batch, so the next pass replanned from scratch and stalled on the
          // very same file forever. Record it, keep draining the queue, and
          // only give up when the peer itself looks gone.
          if (activity) activity.state = "error";
          this.activityUpdatedAt = this.now();
          failedPaths.add(actions[index].path);
          retryPaths.add(actions[index].path);
          this.recordTransferFailure(actions[index].path);
          completed += 1;
          failureStreak += 1;
          this.lastErrorValue = safeErrorCode(error);
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
            downloadCompleted,
            error: this.lastErrorValue
          });
          if (failureStreak >= TRANSFER_ABORT_FAILURE_STREAK || this.lastErrorValue === "peer_upgrade_required") failure = error;
        }
      }
    };
    await Promise.all(Array.from({ length: adaptiveTransferConcurrency(this.activityFiles) }, transferWorker));
    this.saveMetadataLedger(peer.deviceId, ledger);
    const priorityYielded = failure === null
      && this.prioritySyncPending
      && actions.some((action) => !settledPaths.has(action.path));
    if (priorityYielded) {
      // The receiver must keep unstarted actions resumable. They are retried by
      // the next active/bulk pass after the single-file priority session.
      for (const action of actions) {
        if (!settledPaths.has(action.path)) retryPaths.add(action.path);
      }
    }
    const success = failure === null;
    const acknowledgedRemoteDirty = [...request.remoteDirty.entries()]
      .filter(([path]) => settledPaths.has(path))
      .map(([path, generation]) => ({ path, generation }));
    let finishFailure: unknown = null;
    try {
      await this.callPeer(peer, this.metadataRoute(peer, "/session/finish"), {
        sessionId,
        success,
        partial: priorityYielded,
        commits,
        retryPaths: [...retryPaths],
        acknowledgedDirtyPaths: acknowledgedRemoteDirty,
        acknowledgedFullSyncRequestId: success ? request.remoteFullSyncRequestId : ""
      }, SESSION_TIMEOUT_MS);
    } catch (error) {
      finishFailure = error;
    }
    if (success && finishFailure === null) {
      for (const { path, generation } of acknowledgedRemoteDirty) {
        if ((peer.remoteDirtyPaths?.get(path) ?? 0) <= generation) peer.remoteDirtyPaths?.delete(path);
      }
      if (request.remoteFullSyncRequestId && peer.remoteFullSyncRequestId === request.remoteFullSyncRequestId) peer.remoteFullSyncRequestId = "";
      if (!peer.remoteFullSyncRequestId) peer.remoteForceFilesystemScan = false;
      for (const path of retryPaths) this.markDirtyPath(path, QUEUED_SYNC_DELAY_MS);
    }
    if (failure !== null) {
      this.transferSessionActive = false;
      throw failure;
    }
    if (finishFailure !== null) {
      this.transferSessionActive = false;
      throw finishFailure;
    }
    this.transferSessionActive = false;
    peer.verifiedAt = this.now();
    peer.consecutiveFailures = 0;
    peer.lastFailureAt = 0;
    this.lastErrorValue = failedPaths.size ? `partial_transfer:${failedPaths.size}` : "";
    this.emit({
      ...defaultProgress(priorityYielded ? "syncing" : "complete"),
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
      downloadCompleted,
      error: priorityYielded ? "priority_yield" : this.lastErrorValue
    });
    this.currentTransferSessionId = "";
    return {
      settledLocalPaths: new Set([...request.localDirty.keys()].filter((path) => settledPaths.has(path))),
      fullSyncComplete: Boolean(request.fullSync && success && !failedPaths.size && !priorityYielded),
      priorityYielded
    };
  }

  private async syncPeerHashed(peer: LanSyncPeer): Promise<void> {
    this.emitActivityChanged();
    const localPolicy = this.policy();
    const [localEntries, remoteResponse, ledger] = await Promise.all([
      this.buildManifest(true),
      this.callPeer(peer, "/manifest", { syncConfigFolder: true }),
      Promise.resolve(this.loadLedger(peer.deviceId))
    ]);
    this.mergeRemoteRoundHistory(remoteResponse.roundHistory);
    const remotePolicy = policyFromRaw(remoteResponse.policy);
    peer.policy = remotePolicy;
    const shareConfig = true;
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
    // Hash verification belongs to the same scan round. Never add the batch
    // size to the denominator: doing so made a stable full-vault total jump
    // every time another fingerprint batch arrived.
    const hashOnlyPaths = new Set<string>();
    for (const expected of expectedEntries) {
      let activity = scanFiles.get(expected.path);
      if (!activity) {
        activity = { path: expected.path, state: "pending", size: expected.size, reason: "fingerprint" };
        scan.files.push(activity);
        scanFiles.set(expected.path, activity);
        scan.total += 1;
        hashOnlyPaths.add(expected.path);
      }
      activity.state = "hashing";
      activity.reason = "fingerprint";
    }
    this.emitActivityChanged();
    let verified = 0;
    let hashOnlyCompleted = 0;
    let lastReportedAt = 0;
    const entries = await this.buildMetadataHashManifest(expectedEntries, includeConfigFolder, (path, cached) => {
      verified += 1;
      if (hashOnlyPaths.has(path)) {
        hashOnlyCompleted += 1;
        scan.completed = Math.min(scan.total, completedBeforeHashes + hashOnlyCompleted);
      }
      scan.hashed += 1;
      if (cached) scan.cached += 1;
      const activity = scanFiles.get(path);
      if (activity) {
        activity.state = cached ? "cached" : "complete";
        activity.reason = cached ? "fingerprint-cache" : "fingerprint";
      }
      const now = this.now();
      if (verified < expectedEntries.length && now - lastReportedAt < 40) return;
      lastReportedAt = now;
      this.wakeRealtimeProgressSignal();
      this.emitActivityChanged();
    });
    scan.phase = "complete";
    scan.completed = scan.total;
    this.emitActivityChanged();
    return entries;
  }

  // Only one scan session may own the visible counter at a time. The pass the
  // user started always wins; background reconciliation and manifests built
  // for a peer may drive the bar only while this side has nothing of its own
  // on screen. Without this arbitration two sessions overwrote each other and
  // the status bar rewound mid-sync ("3/3" back to "0/3"), which is what made
  // a healthy transfer look like an endless scan.
  // Only one scan may own the visible status-bar counter at a time. The pass
  // the user started always wins; background reconciliation and manifests built
  // for a peer may drive the bar only while this side has nothing of its own on
  // screen. Without this arbitration two sessions overwrote each other and the
  // status bar rewound mid-sync ("3/3" back to "0/3"), which is what made a
  // healthy transfer look like an endless scan.
  private canExposeScanProgress(): boolean {
    // Background reconciliation is invisible housekeeping. Letting it paint the
    // status bar made an otherwise-idle device look like it was endlessly
    // re-scanning ("反复扫描") and tangled the scan counter with the active
    // sync bar, so it never takes over the visible counter.
    if (this.backgroundReconciliation && !this.fullRoundScanVisible) return false;
    if (this.inboundManifestDepth === 0) return true;
    // A manifest built on behalf of a peer is this side's own enumerating phase
    // (the passive end of a sync) and may show — but it must not clobber a
    // foreground scan the user started.
    return !this.syncRunning
      && this.scanValue.phase !== "scanning"
      && this.progressValue.phase !== "syncing";
  }

  // Decoupled from display: decides whether a scan may own the scanValue
  // snapshot. A foreground or inbound scan always claims it (so a user's own
  // pass is never left empty or clobbered, even when a background reconciliation
  // is running alongside). A background pass may claim it only while nothing
  // else is actively scanning.
  private canClaimScanValue(): boolean {
    // A full round reserves the display. The initial filesystem manifest may
    // claim the empty snapshot once; after that, path manifests must not
    // replace its stable denominator.
    if (this.fullRoundScanVisible) return false;
    if (this.backgroundReconciliation) return this.scanValue.phase !== "scanning";
    return true;
  }

  private async withInboundManifestScope<T>(work: () => Promise<T>): Promise<T> {
    this.inboundManifestDepth += 1;
    try {
      return await work();
    } finally {
      this.inboundManifestDepth = Math.max(0, this.inboundManifestDepth - 1);
    }
  }

  private async buildMetadataManifestForPaths(
    paths: string[],
    includeConfigFolder = this.settings().syncConfigFolder
  ): Promise<LanSyncMetadataEntry[]> {
    const unique = [...new Set(paths)].slice(0, MAX_MANIFEST_FILES);
    const scan: LanSyncScanActivity = {
      id: randomId(12),
      phase: "scanning",
      completed: 0,
      total: unique.length,
      // The requested path list is already materialized before hashing starts,
      // so its denominator is known immediately as well. Keeping this true
      // prevents the UI from hiding the round total during realtime scans.
      totalKnown: true,
      cached: 0,
      hashed: 0,
      skipped: 0,
      error: "",
      files: unique.map((path) => ({ path, state: "pending", size: 0, reason: "" }))
    };
    this.publishScanSignal(scan);
    // Keep cumulative fingerprint activity visible when a tiny realtime scan
    // follows a completed full scan. The new path scan still owns its own
    // denominator, but the panel does not appear to lose all prior work.
    scan.hashed = Math.max(this.scanValue.hashed, unique.length > 0 ? 1 : 0);
    scan.cached = this.scanValue.cached;
    // A path manifest is planning for realtime transfer, not a new scan round.
    // Keep any non-empty scan snapshot stable. Replacing it with a tiny path
    // scan made the visible counter jump back to 0/1 whenever a new edit
    // arrived, which looked like the full-vault scan had restarted. Realtime
    // paths still get checked and transferred; only the visible scan owner is
    // kept stable until the next explicit full scan.
    const scanLocked = this.fullRoundScanVisible
      || this.fullSyncRequested
      || this.scanValue.total > 0
      || Boolean(this.syncRoundId && this.scanValue.total > 1);
    const exposeScanProgress = !scanLocked && this.canExposeScanProgress();
    if (!scanLocked && this.canClaimScanValue()) this.scanValue = scan;
    const report = (): void => {
      this.wakeRealtimeProgressSignal();
      if (!exposeScanProgress || this.scanValue !== scan) return;
      this.emitActivityChanged();
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
          this.metadataIndex.delete(path);
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
          this.metadataIndex.delete(path);
          activity.state = "skipped";
          activity.reason = stat.size > this.settings().maxFileBytes ? "too-large" : "invalid-metadata";
          scan.skipped += 1;
          scan.completed += 1;
          report();
          return null;
        }
        activity.state = "cached";
        activity.reason = "metadata";
        this.metadataIndex.set(path, { size: stat.size, mtime: stat.mtime });
        scan.cached += 1;
        scan.completed += 1;
        report();
        return { path, size: stat.size, mtime: stat.mtime };
      });
      scan.phase = "complete";
      scan.completed = scan.total;
      report();
      this.queueMetadataIndexSave();
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
    onProgress?: (completed: number, total: number) => void,
    forceFilesystemScan = false
  ): Promise<LanSyncMetadataEntry[]> {
    if (this.metadataManifestBuild) {
      const activeBuild = this.metadataManifestBuild;
      // An in-flight build already satisfies the caller when it walked at
      // least as much of the vault. Re-running it would double the scan time
      // for no new information, which is the main reason a large vault looked
      // like it was "scanning forever" without ever transferring anything.
      const coversConfigFolder = activeBuild.includeConfigFolder === includeConfigFolder || activeBuild.includeConfigFolder;
      const coversFilesystemScan = activeBuild.forceFilesystemScan || !forceFilesystemScan;
      const existing = await activeBuild.promise;
      if (coversConfigFolder && coversFilesystemScan) {
        onProgress?.(this.scanValue.completed, this.scanValue.total);
        const reused = existing.map((entry) => ({ ...entry }));
        return activeBuild.includeConfigFolder === includeConfigFolder
          ? reused
          : reused.filter((entry) => this.normalizePath(entry.path, includeConfigFolder) !== null);
      }
      if (this.metadataManifestBuild === activeBuild) this.metadataManifestBuild = null;
      return await this.buildMetadataManifest(includeConfigFolder, onProgress, forceFilesystemScan);
    }
    const promise = !forceFilesystemScan && this.canUseMetadataIndex(includeConfigFolder)
      ? this.buildMetadataManifestFromIndex(includeConfigFolder, onProgress)
      : this.buildMetadataManifestOnce(includeConfigFolder, onProgress);
    this.metadataManifestBuild = { includeConfigFolder, forceFilesystemScan, promise };
    this.manifestBuildStartedAt = this.now();
    try {
      return await promise;
    } finally {
      if (this.metadataManifestBuild?.promise === promise) {
        this.metadataManifestBuild = null;
        this.manifestBuildStartedAt = 0;
      }
    }
  }

  private async buildMetadataManifestFromIndex(
    includeConfigFolder: boolean,
    onProgress?: (completed: number, total: number) => void
  ): Promise<LanSyncMetadataEntry[]> {
    const dirtyEntries = [...this.dirtyPaths.entries()]
      .filter(([path, generation]) => generation > this.metadataIndexGeneration && this.normalizePath(path, includeConfigFolder) !== null)
      .slice(0, MAX_MANIFEST_FILES);
    const dirty = dirtyEntries.map(([path]) => path);
    if (dirty.length) {
      await this.buildMetadataManifestForPaths(dirty, includeConfigFolder);
      this.metadataIndexGeneration = Math.max(this.metadataIndexGeneration, ...dirtyEntries.map(([, generation]) => generation));
    } else {
      onProgress?.(0, 0);
    }
    if (dirty.length) onProgress?.(this.scanValue.completed, this.scanValue.total);
    const maxFileBytes = this.settings().maxFileBytes;
    return [...this.metadataIndex.entries()]
      .map(([path, metadata]) => ({ path, ...metadata }))
      .filter((entry) => this.normalizePath(entry.path, includeConfigFolder) !== null && entry.size <= maxFileBytes)
      .sort((left, right) => left.path.localeCompare(right.path));
  }

  private async buildMetadataManifestOnce(
    includeConfigFolder: boolean,
    onProgress?: (completed: number, total: number) => void
  ): Promise<LanSyncMetadataEntry[]> {
    const metadataMutationGenerationAtStart = this.metadataIndexMutationGeneration;
    this.metadataIndexReplaceBaselineGeneration = metadataMutationGenerationAtStart;
    const rawFiles = await this.listCurrentSyncFiles(includeConfigFolder);
    const scanFiles: LanSyncScanFileActivity[] = [];
    const candidates: Array<Omit<LanSyncFileStat, "path"> & { path: string; scanIndex: number }> = [];
    const baseEntries: LanSyncMetadataEntry[] = [];
    const seenPaths = new Set<string>();
    const establishedBaseline = this.metadataIndexReady || this.lastFullScanAt > 0;
    for (const file of rawFiles) {
      let reason = "";
      if (file.size > this.settings().maxFileBytes) reason = "too-large";
      else if (candidates.length >= MAX_MANIFEST_FILES) reason = "manifest-limit";
      const unchanged = Boolean(
        !reason
        && file.path
        && establishedBaseline
        && this.metadataIndex.get(file.path)?.size === file.size
        && this.metadataIndex.get(file.path)?.mtime === file.mtime
      );
      const scanIndex = scanFiles.push({
        path: file.path,
        state: reason ? "skipped" : unchanged ? "cached" : "pending",
        size: Math.max(0, Number(file.size) || 0),
        reason: reason || (unchanged ? "metadata-cache" : "")
      }) - 1;
      if (!reason) {
        seenPaths.add(file.path);
        baseEntries.push({ path: file.path, size: file.size, mtime: file.mtime });
        if (!unchanged) candidates.push({ path: file.path, size: file.size, mtime: file.mtime, scanIndex });
      }
    }
    const skipped = scanFiles.filter((file) => file.state === "skipped").length;
    const cached = scanFiles.filter((file) => file.state === "cached").length;
    const scan: LanSyncScanActivity = {
      id: randomId(12),
      phase: "scanning",
      completed: skipped + cached,
      total: scanFiles.length,
      // listFiles() has already returned the current device snapshot before
      // the per-file loop starts, so the local total is known even while the
      // background producer is feeding the priority transfer queue.
      totalKnown: true,
      cached,
      hashed: 0,
      skipped,
      error: "",
      syncCandidates: 0,
      syncCandidatesTotal: 0,
      files: scanFiles
    };
    this.publishScanSignal(scan, this.fullRoundScanVisible && this.fullSyncRequested);
    // Background reconciliation and manifests served on behalf of a peer are
    // secondary work: neither may repaint the counter the user's own pass is
    // showing. Letting them do it rewound the status bar mid-pass ("3/3" back
    // to "0/3"), which is exactly what makes a sync look stuck forever. When
    // this side has nothing of its own on screen they may still drive the bar,
    // so the receiving end keeps reporting real progress instead of freezing.
    const exposeScanProgress = this.canExposeScanProgress();
    if (this.fullRoundScanVisible && this.fullSyncRequested) {
      // The deep round reserved the display before enumeration began. The
      // first full manifest fills that reserved slot; all path manifests stay
      // out of it until the round finishes.
      this.scanValue = scan;
    } else if (this.canClaimScanValue()) {
      this.scanValue = scan;
    }
    let lastReportedAt = 0;
    const candidatePaths = new Set<string>();
    const queueScanCandidate = (path: string): void => {
      // A candidate discovered by the background filesystem walk is already
      // part of the active round. Put it in the same zero-delay priority lane
      // as a live Vault event so scanning and transfer advance concurrently;
      // the full scan counter remains owned by `scan` below.
      this.markDirtyPath(path, REALTIME_DIRTY_DELAY_MS, true);
      if (candidatePaths.has(path)) return;
      candidatePaths.add(path);
      // These counters are deliberately independent from raw filesystem
      // entries: they show the producer's actual sync queue, including
      // deletions discovered from the previous metadata index.
      scan.syncCandidates = candidatePaths.size;
      scan.syncCandidatesTotal = candidatePaths.size;
      // Mirror the producer count into the progress snapshot immediately so
      // the transfer panel can show the current round denominator before the
      // first metadata session has been planned.
      this.progressValue = { ...this.progressValue, scanCandidates: candidatePaths.size };
      if (this.scanValue === scan) this.emitActivityChanged();
    };
    const report = (force = false): void => {
      const now = this.now();
      if (!force && scan.completed !== scan.total && now - lastReportedAt < 40) return;
      lastReportedAt = now;
      onProgress?.(scan.completed, scan.total);
      this.wakeRealtimeProgressSignal();
      // A passive device still needs to expose its own scan while answering
      // the coordinator's manifest request. `canExposeScanProgress()` keeps
      // that scan out of the compact transfer status bar when a session is
      // active, but suppressing the activity event altogether made the panel
      // show only the peer's 9432/24231 counters and look idle locally.
      if (this.scanValue === scan && (exposeScanProgress || this.inboundManifestDepth > 0)) {
        this.emitActivityChanged();
      }
    };
    report(true);
    try {
      const scanFeedsRealtimeQueue = this.backgroundReconciliation
        || this.fullRoundScanVisible
        || this.fullSyncRequested;
      // Stat/hash metadata concurrently. Each completed item immediately feeds
      // the realtime queue, so a large vault never has to wait for the final
      // manifest before its first changed file can transfer.
      const changedEntries = (await mapWithConcurrency(candidates, HASH_CONCURRENCY, async (file) => {
        seenPaths.add(file.path);
        const previous = this.metadataIndex.get(file.path);
        if (
          scanFeedsRealtimeQueue
          && establishedBaseline
          && (!previous || previous.size !== file.size || previous.mtime !== file.mtime)
        ) queueScanCandidate(file.path);
        const activity = scan.files[file.scanIndex];
        if (!activity || activity.reason === "missing-during-scan") return null;
        // A file may be deleted or replaced between listFiles() and this
        // metadata callback. Re-stat so the manifest and scan counters reflect
        // the current device, never a stale snapshot entry.
        const current = await this.options.storage.statFile(file.path).catch(() => null);
        if (!current) {
          await this.reconcilePathInActiveScan(scan, file.path);
          return null;
        }
        if (current.size !== file.size || current.mtime !== file.mtime) {
          file.size = current.size;
          file.mtime = current.mtime;
          this.markDirtyPath(file.path, REALTIME_DIRTY_DELAY_MS, true);
        }
        activity.state = "cached";
        activity.reason = "metadata";
        scan.cached += 1;
        scan.completed += 1;
        report();
        return { path: file.path, size: file.size, mtime: file.mtime };
      })).sort((left, right) => left.path.localeCompare(right.path));
      for (const path of this.metadataIndex.keys()) {
        if (scanFeedsRealtimeQueue && establishedBaseline && !seenPaths.has(path) && this.normalizePath(path, includeConfigFolder)) {
          queueScanCandidate(path);
        }
      }
      scan.phase = "complete";
      scan.completed = Math.min(Math.max(0, scan.completed), Math.max(0, scan.total));
      if (scan.hashed === 0 && candidates.length > 0) scan.hashed = 1;
      report(true);
      const entries = [...new Map([...baseEntries, ...changedEntries].map((entry) => [entry.path, entry] as const)).values()]
        .sort((left, right) => left.path.localeCompare(right.path));
      this.replaceMetadataIndex(entries, includeConfigFolder);
      this.recordFullScan();
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
    const normalized = this.normalizePath(path, true);
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
    // Metadata is the synchronization contract. If an idempotent retry finds
    // the exact source size and mtime already present, it is complete; do not
    // reread or hash the file merely to compare content.
    if (!before || bytes.byteLength !== expected.size || !metadataMatches(before, expected)) return null;
    return metadataSnapshot(before);
  }

  private async writeLocalMetadata(
    path: string,
    bytes: Uint8Array,
    expected: LanSyncMetadataSnapshot | null,
    source: LanSyncMetadataSnapshot,
    allowExistingSame = false
  ): Promise<LanSyncMetadataSnapshot> {
    const normalized = this.normalizePath(path, true);
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
    this.markAppliedMutation(normalized);
    let written: LanSyncFileStat | null = null;
    try {
      await this.options.storage.writeBinary(normalized, arrayBuffer(bytes), source.mtime);
      written = await this.options.storage.statFile(normalized);
      if (!written || written.size !== bytes.byteLength) throw new LanSyncProtocolError("precondition_failed", 409);
    } catch (error) {
      this.clearAppliedMutation(normalized);
      throw error;
    }
    this.hashCache.delete(normalized);
    this.queueHashCacheSave();
    const writtenMetadata = metadataSnapshot(written);
    this.confirmAppliedMutation(normalized, writtenMetadata);
    this.metadataIndex.set(normalized, writtenMetadata);
    const generation = ++this.metadataIndexMutationGeneration;
    this.metadataIndexMutations.set(normalized, { generation, metadata: writtenMetadata });
    this.queueMetadataIndexSave();
    return writtenMetadata;
  }

  private async deleteLocalMetadata(path: string, expected: LanSyncMetadataSnapshot): Promise<void> {
    const normalized = this.normalizePath(path, true);
    if (!normalized) throw new LanSyncProtocolError("unsafe_delete");
    const current = await this.options.storage.statFile(normalized);
    if (!current || !metadataMatches(current, expected)) throw new LanSyncProtocolError("precondition_failed", 409);
    this.markAppliedMutation(normalized);
    try {
      await this.options.storage.deleteFile(normalized);
    } catch (error) {
      this.clearAppliedMutation(normalized);
      throw error;
    }
    this.hashCache.delete(normalized);
    this.queueHashCacheSave();
    this.confirmAppliedMutation(normalized, null);
    this.metadataIndex.delete(normalized);
    const generation = ++this.metadataIndexMutationGeneration;
    this.metadataIndexMutations.set(normalized, { generation, metadata: null });
    this.queueMetadataIndexSave();
    if (await this.options.storage.statFile(normalized)) throw new LanSyncProtocolError("precondition_failed", 409);
  }

  private async readRemoteMetadata(peer: LanSyncPeer, entry: LanSyncMetadataEntry, sessionId = ""): Promise<{ bytes: Uint8Array; metadata: LanSyncMetadataSnapshot }> {
    const expected = metadataSnapshot(entry);
    const response = await this.callPeer(peer, this.metadataRoute(peer, "/file/read"), { path: entry.path, expectedMetadata: expected, sessionId }, fileTransferTimeoutMs(entry.size));
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
    const response = await this.callPeer(peer, this.metadataRoute(peer, "/file/write"), {
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
    const response = await this.callPeer(peer, this.metadataRoute(peer, "/file/delete"), { path, expectedMetadata: expected, sessionId }, 45_000);
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
    const rawFiles = await this.listCurrentSyncFiles(includeConfigFolder);
    const scanFiles: LanSyncScanFileActivity[] = [];
    const candidates: Array<Omit<LanSyncFileStat, "path"> & { path: string; scanIndex: number }> = [];
    for (const file of rawFiles) {
      let reason = "";
      if (file.size > maxFileBytes) reason = "too-large";
      else if (candidates.length >= MAX_MANIFEST_FILES) reason = "manifest-limit";
      const scanIndex = scanFiles.push({
        path: file.path,
        state: reason ? "skipped" : "pending",
        size: Math.max(0, Number(file.size) || 0),
        reason
      }) - 1;
      if (!reason && file.path) candidates.push({ path: file.path, size: file.size, mtime: file.mtime, scanIndex });
    }
    const scan: LanSyncScanActivity = {
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
    this.publishScanSignal(scan);
    scan.hashed = Math.max(this.scanValue.hashed, candidates.length > 0 ? 1 : 0);
    scan.cached = this.scanValue.cached;
    const ownsScanDisplay = (this.fullRoundScanVisible && this.scanValue.total === 0) || this.canClaimScanValue();
    if (ownsScanDisplay) this.scanValue = scan;
    let lastReportedAt = 0;
    const report = (force = false): void => {
      const now = this.now();
      if (!force && scan.completed !== scan.total && now - lastReportedAt < 60) return;
      lastReportedAt = now;
      onProgress?.(scan.completed, scan.total);
      this.wakeRealtimeProgressSignal();
      if (ownsScanDisplay && this.scanValue === scan) this.emitActivityChanged();
    };
    report(true);
    try {
      const entries = await mapWithConcurrency(candidates, HASH_CONCURRENCY, async (file) => {
        const activity = scan.files[file.scanIndex];
        const signature = `${file.mtime}:${file.size}`;
        const cached = this.hashCache.get(file.path);
        let hash = cached?.signature === signature ? cached.hash : "";
        if (hash) {
          activity.state = "cached";
          scan.cached += 1;
        } else {
          activity.state = "hashing";
          hash = await sha256Bytes(await this.options.storage.readBinary(file.path));
          this.hashCache.set(file.path, { signature, hash });
          activity.state = "complete";
          scan.hashed += 1;
        }
        scan.completed += 1;
        if (scan.completed % 250 === 0) this.queueHashCacheSave();
        report();
        return { path: file.path, size: file.size, mtime: file.mtime, hash };
      });
      scan.phase = "complete";
      scan.completed = scan.total;
      if (scan.hashed === 0 && candidates.length > 0) scan.hashed = 1;
      this.queueHashCacheSave();
      if (!ownsScanDisplay && this.scanValue.total > 0) {
        // Keep the full-vault denominator authoritative, but retain useful
        // hash/cache activity from a concurrent legacy manifest scan.
        this.scanValue.hashed += scan.hashed;
        this.scanValue.cached += scan.cached;
        this.scanValue.skipped += scan.skipped;
        this.emitActivityChanged();
      }
      report(true);
      return entries;
    } catch (error) {
      scan.phase = "error";
      scan.error = safeErrorCode(error);
      const hashing = scan.files.find((file) => file.state === "hashing");
      if (hashing) {
        hashing.state = "error";
        hashing.reason = scan.error;
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
    const secret = this.activeSecret();
    const body = await encryptLanSyncPayload(secret, payload);
    const headers = await authHeaders({ ...this.identity, secret }, this.deviceId, "POST", path, body, this.now());
    let lastError: unknown = null;
    const addresses = sortLanAddresses(peer.addresses, this.localInterfaces());
    for (const address of addresses) {
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
        const decrypted = await decryptLanSyncPayload(secret, response.text);
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
      const secret = this.activeSecret();
      const deviceId = await verifyLanSyncRequest({
        secret,
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
      const payload = await decryptLanSyncPayload(secret, body);
      const metadataProtocol = METADATA_PROTOCOLS.find((protocol) => path.startsWith(`${API_PREFIX}${protocol.routePrefix}/`));
      const metadataRoute = metadataProtocol
        ? path.slice(`${API_PREFIX}${metadataProtocol.routePrefix}`.length)
        : "";
      const testRoute = path.slice(`${API_PREFIX}/test`.length);
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
      ) {
        throw new LanSyncProtocolError("peer_upgrade_required", 426);
      }
      this.markInboundPeer(deviceId, remoteAddress, path);
      inboundDeviceId = deviceId;
      inboundActivityIndex = this.beginInboundFileActivity(deviceId, path, payload);
      let result: Record<string, unknown>;
      if (path === `${API_PREFIX}/ping`) {
        const peer = this.peers.get(deviceId);
        let remoteRequestedSync = false;
        if (peer) {
          remoteRequestedSync = this.applyRemoteSyncSignal(peer, payload);
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
        if (peer && (remoteRequestedSync || (peer.remoteDirtyPaths?.size ?? 0) > 0)) {
          this.scheduleSync(0, true);
        }
      } else if (path === `${API_PREFIX}/events/wait`) {
        const sinceSyncRequestId = typeof payload.sinceSyncRequestId === "string"
          ? payload.sinceSyncRequestId
          : "";
        await this.waitForRealtimeSignal(sinceSyncRequestId);
        result = {
          ok: true,
          protocolVersion: PROTOCOL_VERSION,
          deviceId: this.deviceId,
          policy: this.policy(),
          messages: this.pendingMessagesFor(deviceId),
          ...this.syncSignalPayload()
        };
      } else if (testRoute === "/update/manifest") {
        if (!this.settings().testMode || !this.localTestBuild) throw new LanSyncProtocolError("test_mode_disabled", 403);
        result = { ok: true, build: this.localTestBuild };
      } else if (testRoute === "/update/file") {
        if (!this.settings().testMode || !this.localTestBuild || !this.options.readTestBuildFile) throw new LanSyncProtocolError("test_mode_disabled", 403);
        const name = TEST_BUILD_FILE_NAMES.find((candidate) => candidate === payload.name);
        const buildId = typeof payload.buildId === "string" ? payload.buildId : "";
        if (!name || buildId !== this.localTestBuild.buildId) throw new LanSyncProtocolError("invalid_test_build", 400);
        const bytes = new Uint8Array(await this.options.readTestBuildFile(name));
        const descriptor = this.localTestBuild.files.find((file) => file.name === name);
        if (!descriptor || bytes.byteLength !== descriptor.size || await sha256Bytes(bytes) !== descriptor.hash) throw new LanSyncProtocolError("test_build_changed", 409);
        result = { ok: true, name, buildId, data: bytesToBase64Url(bytes) };
      } else if (testRoute === "/debug") {
        if (!this.settings().testMode) throw new LanSyncProtocolError("test_mode_disabled", 403);
        const event = isRecord(payload.event) ? payload.event : { value: payload.event };
        await this.options.onTestDebug?.({ ...event, deviceId, receivedAt: new Date(this.now()).toISOString() });
        result = { ok: true };
      } else if (metadataRoute === "/manifest") {
        const policy = this.policy();
        const scanRequestIds = this.parseScanRequestIds(payload.scanRequestIds);
        const forceFilesystemScan = payload.forceFilesystemScan === true
          && !this.filesystemScanAlreadyServed(deviceId, scanRequestIds);
        this.emit({
          ...defaultProgress("connected"),
          stage: "enumerating",
          active: true,
          peerId: deviceId
        });
        const files = await this.withInboundManifestScope(() => this.buildMetadataManifest(
          true,
          undefined,
          forceFilesystemScan
        ));
        this.emit({
          ...defaultProgress("connected"),
          stage: "packaging-manifest",
          active: true,
          peerId: deviceId
        });
        this.recordServedFilesystemScan(deviceId, scanRequestIds);
        this.emitActivityChanged();
        result = {
          files,
          policy,
          progress: this.progressSignal(),
          roundHistory: this.roundHistory.slice(-20),
          ...this.syncSignalPayload()
        };
      } else if (metadataRoute === "/manifest/paths") {
        const policy = this.policy();
        const paths = Array.isArray(payload.paths) ? payload.paths.filter((value): value is string => typeof value === "string") : [];
        if (paths.length > MAX_MANIFEST_FILES) throw new LanSyncProtocolError("too_many_dirty_paths", 413);
        const files = await this.withInboundManifestScope(() => this.buildMetadataManifestForPaths(
          paths,
          true
        ));
        this.emitActivityChanged();
        result = {
          files,
          policy,
          roundHistory: this.roundHistory.slice(-20),
          ...this.syncSignalPayload()
        };
      } else if (metadataRoute === "/bootstrap/hashes") {
        const policy = this.policy();
        const includeConfigFolder = true;
        const expected = this.parseMetadataManifest(payload.files, includeConfigFolder);
        result = { files: await this.buildInboundMetadataHashManifest(expected, includeConfigFolder, deviceId) };
      } else if (metadataRoute === "/session/start") {
        result = await this.handleMetadataSessionStart(deviceId, payload);
      } else if (metadataRoute === "/session/finish") {
        result = await this.handleMetadataSessionFinish(deviceId, payload);
      } else if (metadataRoute === "/file/read") {
        result = await this.handleReadMetadataFile(payload);
      } else if (metadataRoute === "/file/write") {
        result = await this.handleWriteMetadataFile(payload);
      } else if (metadataRoute === "/file/delete") {
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
      const encryptedResult = await encryptLanSyncPayload(secret, result);
      sendText(response, 200, encryptedResult);
      if (metadataRoute === "/manifest") {
        this.emit({
          ...defaultProgress("connected"),
          stage: "waiting-plan",
          active: true,
          peerId: deviceId
        });
      }
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
    const roundId = typeof payload.roundId === "string" && /^[A-Za-z0-9_-]{8,96}$/.test(payload.roundId)
      ? payload.roundId
      : "";
    const roundCompleted = Number(payload.roundCompleted ?? 0);
    const roundTotal = Number(payload.roundTotal ?? total);
    if (!sessionId || !Number.isSafeInteger(total) || total < 0 || total !== rawFiles.length || total > MAX_MANIFEST_FILES
      || !Number.isSafeInteger(bytesTotal) || bytesTotal < 0
      || !Number.isSafeInteger(coordinatorUploads) || coordinatorUploads < 0
      || !Number.isSafeInteger(coordinatorDownloads) || coordinatorDownloads < 0
      || !Number.isSafeInteger(roundCompleted) || roundCompleted < 0
      || !Number.isSafeInteger(roundTotal) || roundTotal < total || roundTotal > MAX_MANIFEST_FILES) {
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
    const planKey = JSON.stringify({
      total,
      bytesTotal,
      uploads: coordinatorDownloads,
      downloads: coordinatorUploads,
      files: files.map((file) => [file.path, file.action, file.size])
    });
    if (this.inboundSession) {
      if (
        this.inboundSession.id === sessionId
        && this.inboundSession.deviceId === deviceId
        && this.inboundSession.planKey === planKey
      ) {
        this.inboundSession.updatedAt = this.now();
        return { ok: true, sessionId, resumed: true };
      }
      // If the coordinator lost the response to a start request, its retry
      // carries the same immutable plan but a fresh request ID. Reclaim only
      // after a short quiet period; an immediate different session remains a
      // real conflict and is rejected instead of overwriting active work.
      if (
        this.inboundSession.deviceId === deviceId
        && this.inboundSession.planKey === planKey
        && this.now() - this.inboundSession.updatedAt >= STALE_SESSION_RESUME_MS
      ) {
        this.inboundSession.updatedAt = this.now();
        this.currentTransferSessionId = this.inboundSession.id;
        return { ok: true, sessionId: this.inboundSession.id, resumed: true };
      }
      throw new LanSyncProtocolError("sync_session_busy", 409);
    }
    const startedAt = this.now();
    this.inboundSession = {
      id: sessionId,
      deviceId,
      planKey,
      startedAt,
      updatedAt: startedAt,
      total,
      bytesTotal,
      uploads: coordinatorDownloads,
      downloads: coordinatorUploads,
      roundId,
      roundCompleted,
      roundTotal
    };
    // Adopt the coordinator's shared transfer counters before emitting any
    // receiver progress. This prevents the phone and desktop from displaying
    // different denominators for the same transfer plan.
    if (roundId) this.syncRoundId = roundId;
    this.syncRoundCompleted = Math.max(this.syncRoundCompleted, roundCompleted);
    this.syncRoundTotal = Math.max(this.syncRoundTotal, roundTotal);
    this.currentTransferSessionId = sessionId;
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
    session.updatedAt = this.now();
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
        .slice(0, MAX_MANIFEST_FILES)
    );
    const acknowledgedDirtyPaths = this.parseDirtyPaths(payload.acknowledgedDirtyPaths);
    for (const [path, generation] of acknowledgedDirtyPaths) {
      if ((this.dirtyPaths.get(path) ?? 0) <= generation) this.dirtyPaths.delete(path);
    }
    this.queueChangeJournalSave();
    const partial = payload.partial === true;
    const acknowledgedFullSyncRequestId = typeof payload.acknowledgedFullSyncRequestId === "string" ? payload.acknowledgedFullSyncRequestId : "";
    if (!partial && acknowledgedFullSyncRequestId && this.fullSyncRequestId === acknowledgedFullSyncRequestId) {
      this.fullSyncRequested = false;
      this.forceFilesystemScanRequested = false;
      this.fullSyncOnlyPending = false;
      this.localFilesystemScanCompletedRequestId = "";
    }
    const success = payload.success === true;
    if (success && !partial) this.recordSyncCheckpoint();
    if (success) {
      for (const file of this.activityFiles) {
        if (retryPaths.has(file.path)) file.state = "deferred";
        else if (partial && (file.state === "pending" || file.state === "syncing")) file.state = "deferred";
        else if (file.state !== "error") file.state = "complete";
      }
    } else {
      for (const file of this.activityFiles) if (file.state === "pending" || file.state === "syncing") file.state = "error";
    }
    const completed = this.activityFiles.filter((file) => file.state === "complete" || file.state === "deferred").length;
    const completedForRound = this.activityFiles.filter((file) => file.state === "complete").length;
    const uploadCompleted = this.activityFiles.filter((file) => file.action === "push" && file.state === "complete").length;
    const downloadCompleted = this.activityFiles.filter((file) => file.action === "pull" && file.state === "complete").length;
    const bytesTransferred = this.activityFiles.filter((file) => file.state === "complete").reduce((sum, file) => sum + file.size, 0);
    if (session) {
      // Keep the receiver's round counters aligned with the coordinator's
      // cumulative plan. A session may be only one batch of a larger round.
      this.syncRoundId = session.roundId || this.syncRoundId;
      // Deferred/retry files are not synchronized yet and must not advance
      // the shared round counter. They remain visible in the batch as
      // deferred until the next session completes them.
      this.syncRoundCompleted = Math.max(this.syncRoundCompleted, session.roundCompleted + completedForRound);
      this.syncRoundTotal = Math.max(this.syncRoundTotal, session.roundTotal);
    }
    this.emit({
      ...defaultProgress(success ? (partial ? "syncing" : "complete") : "error"),
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
      error: success ? (partial ? "priority_yield" : "") : "inbound_transfer_failed"
    });
    this.activityUpdatedAt = this.now();
    this.inboundSession = null;
    this.currentTransferSessionId = "";
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
