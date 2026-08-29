import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const temp = await mkdtemp(join(tmpdir(), "ntfy-lan-sync-"));

function memoryLocalStore(deviceId) {
  const values = new Map([["cancip.lan-sync.device-id.v1", deviceId]]);
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };
}

function bytes(value) {
  return new TextEncoder().encode(value);
}

function arrayBuffer(value) {
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
}

class MemoryStorage {
  constructor(identity, files = {}, options = {}) {
    this.identityRoot = ".obsidian/plugins/android-ntfy-notifier/lan-sync";
    this.files = new Map();
    this.folders = new Set([
      ".obsidian",
      ".obsidian/plugins",
      ".obsidian/plugins/android-ntfy-notifier",
      this.identityRoot,
      `${this.identityRoot}/peers`
    ]);
    this.clock = 1000;
    this.readCounts = new Map();
    this.writeCounts = new Map();
    this.listFilesCalls = 0;
    this.listFilesChangedSinceCalls = 0;
    this.beforeRead = null;
    this.afterWrite = null;
    this.mtimeTransform = typeof options.mtimeTransform === "function" ? options.mtimeTransform : (mtime) => mtime;
    this.putText(`${this.identityRoot}/identity.json`, `${JSON.stringify(identity)}\n`, 1);
    for (const [path, value] of Object.entries(files)) this.putText(path, value.content, value.mtime);
  }

  putText(path, content, mtime = ++this.clock) {
    const value = bytes(content);
    this.files.set(path, { data: value, mtime });
    const segments = path.split("/");
    for (let index = 1; index < segments.length; index += 1) this.folders.add(segments.slice(0, index).join("/"));
  }

  text(path) {
    const entry = this.files.get(path);
    return entry ? new TextDecoder().decode(entry.data) : null;
  }

  async listFiles(includeConfigFolder = false) {
    this.listFilesCalls += 1;
    return [...this.files.entries()]
      .filter(([path]) => includeConfigFolder || !path.startsWith(".obsidian/"))
      .map(([path, entry]) => ({ path, size: entry.data.byteLength, mtime: entry.mtime }));
  }

  async listFilesChangedSince(since, includeConfigFolder = false) {
    this.listFilesChangedSinceCalls += 1;
    return [...this.files.entries()]
      .filter(([path, entry]) => (includeConfigFolder || !path.startsWith(".obsidian/")) && entry.mtime >= since)
      .map(([path, entry]) => ({ path, size: entry.data.byteLength, mtime: entry.mtime }));
  }

  async statFile(path) {
    const entry = this.files.get(path);
    return entry ? { path, size: entry.data.byteLength, mtime: entry.mtime } : null;
  }

  async readBinary(path) {
    if (typeof this.beforeRead === "function") await this.beforeRead(path, this);
    const entry = this.files.get(path);
    if (!entry) throw new Error("missing_file");
    this.readCounts.set(path, (this.readCounts.get(path) || 0) + 1);
    return arrayBuffer(entry.data);
  }

  readCount(path) {
    return this.readCounts.get(path) || 0;
  }

  totalReads() {
    return [...this.readCounts.values()].reduce((sum, count) => sum + count, 0);
  }

  totalWrites() {
    return [...this.writeCounts.values()].reduce((sum, count) => sum + count, 0);
  }

  async writeBinary(path, data, mtime) {
    const requestedMtime = Number.isFinite(mtime) ? mtime : ++this.clock;
    this.files.set(path, { data: new Uint8Array(data), mtime: this.mtimeTransform(requestedMtime, path) });
    this.writeCounts.set(path, (this.writeCounts.get(path) || 0) + 1);
    if (typeof this.afterWrite === "function") await this.afterWrite(path, this);
  }

  async deleteFile(path) {
    if (!this.files.delete(path)) throw new Error("missing_file");
  }

  async exists(path) {
    return this.files.has(path) || this.folders.has(path);
  }

  async readText(path) {
    const value = this.text(path);
    if (value === null) throw new Error("missing_file");
    return value;
  }

  async writeText(path, content) {
    this.putText(path, content);
  }

  async ensureFolder(path) {
    const segments = path.split("/");
    for (let index = 1; index <= segments.length; index += 1) this.folders.add(segments.slice(0, index).join("/"));
  }

  async listDirectory(path) {
    const prefix = `${path.replace(/\/+$/, "")}/`;
    return [...this.files.keys()].filter((file) => file.startsWith(prefix) && !file.slice(prefix.length).includes("/"));
  }
}

async function freePort() {
  const server = createServer();
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolvePromise) => server.close(resolvePromise));
  return port;
}

async function waitFor(predicate, label, timeoutMs = 12_000, intervalMs = 80) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await predicate()) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, intervalMs));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

try {
  const bundle = join(temp, "lanSync.cjs");
  await esbuild.build({
    entryPoints: [join(root, "src", "lanSync.ts")],
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node20",
    outfile: bundle,
    logLevel: "silent"
  });
  const require = createRequire(import.meta.url);
  globalThis.require = require;
  const {
    NtfyLanSync,
    LanStatusBarTakeover,
    classifyLanLinkType,
    createLanSyncRequestHeaders,
    decryptLanSyncPayload,
    encryptLanSyncPayload,
    isPrivateLanAddress,
    ipv4BroadcastAddress,
    normalizeLanSyncPath,
    normalizeLanInboxAttachmentPath,
    isLanInboxAttachmentPath,
    lanSyncTopLevelGroup,
    normalizeManualLanPeer,
    sortLanAddresses,
    planLanSyncMetadataReconciliation,
    planLanSyncReconciliation,
    verifyLanSyncRequest
  } = require(bundle);

  assert.equal(normalizeLanSyncPath("Notes/Safe.md"), "Notes/Safe.md");
  for (const unsafe of ["../secret", "/absolute", "C:/drive", ".trash/a", "folder\\file", "a//b", "a/./b", "a/../b"]) {
    assert.equal(normalizeLanSyncPath(unsafe), null, `Unsafe path accepted: ${unsafe}`);
  }
  const configPathOptions = {
    syncConfigFolder: true,
    configDir: ".obsidian",
    identityRoot: ".obsidian/plugins/android-ntfy-notifier/lan-sync"
  };
  assert.equal(normalizeLanSyncPath(".obsidian/hotkeys.json", configPathOptions), ".obsidian/hotkeys.json");
  assert.equal(normalizeLanSyncPath(".obsidian/plugins/example/data.json", configPathOptions), ".obsidian/plugins/example/data.json");
  assert.equal(lanSyncTopLevelGroup("Notes/Daily/Today.md"), "Notes");
  assert.equal(lanSyncTopLevelGroup("README.md"), "");
  assert.equal(lanSyncTopLevelGroup(".obsidian/hotkeys.json"), ".obsidian");
  assert.equal(normalizeLanSyncPath("Folder/Note (LAN conflict device hash).md", configPathOptions), null, "Generated conflict copies must never propagate");
  for (const protectedPath of [
    ".obsidian/workspace.json",
    ".obsidian/workspace-mobile.json",
    ".obsidian/plugins/remotely-save/data.json",
    ".obsidian/plugins/android-ntfy-notifier/data.json",
    ".obsidian/plugins/android-ntfy-notifier/lan-sync/identity.json",
    ".obsidian/plugins/example/node_modules/cache.bin"
  ]) {
    assert.equal(normalizeLanSyncPath(protectedPath, configPathOptions), null, `Protected config path accepted: ${protectedPath}`);
  }
  for (const sharedPluginPath of [
    ".obsidian/plugins/android-ntfy-notifier/main.js",
    ".obsidian/plugins/android-ntfy-notifier/manifest.json",
    ".obsidian/plugins/android-ntfy-notifier/styles.css"
  ]) {
    assert.equal(normalizeLanSyncPath(sharedPluginPath, configPathOptions), sharedPluginPath, `Plugin release file was excluded: ${sharedPluginPath}`);
  }
  assert.equal(normalizeLanSyncPath(".obsidian/hotkeys.json"), ".obsidian/hotkeys.json", "Whole-vault config path was dropped");
  for (const address of ["127.0.0.1", "10.0.0.2", "172.20.1.2", "192.168.1.8", "169.254.2.3"]) assert.equal(isPrivateLanAddress(address), true);
  for (const address of ["8.8.8.8", "1.1.1.1", "example.com"]) assert.equal(isPrivateLanAddress(address), false);
  assert.equal(classifyLanLinkType("Wi-Fi"), "wifi");
  assert.equal(classifyLanLinkType("Bluetooth Network Connection"), "bluetooth-pan");
  assert.equal(classifyLanLinkType("Remote NDIS Compatible Device"), "usb");
  assert.equal(classifyLanLinkType("Local Area Connection* 10"), "hotspot");
  const interfaceRows = [
    { name: "vEthernet (Default Switch)", address: "172.21.16.1", netmask: "255.255.255.0", broadcast: "172.21.16.255", linkType: "lan" },
    { name: "WLAN", address: "192.168.1.4", netmask: "255.255.255.0", broadcast: "192.168.1.255", linkType: "wifi" }
  ];
  assert.deepEqual(
    sortLanAddresses(["172.21.16.1", "192.168.1.4"], interfaceRows),
    ["192.168.1.4", "172.21.16.1"],
    "Wi-Fi address was not preferred over a virtual adapter"
  );
  assert.equal(ipv4BroadcastAddress("192.168.137.1", "255.255.255.0"), "192.168.137.255");
  assert.deepEqual(normalizeManualLanPeer("192.168.137.2:43190"), { address: "192.168.137.2", port: 43190 });
  assert.deepEqual(normalizeManualLanPeer("10.0.0.5"), { address: "10.0.0.5", port: 43190 });
  for (const unsafePeer of ["example.com:43190", "8.8.8.8:43190", "https://192.168.1.2:43190", "192.168.1.2:80/path", "192.168.1.2:80", "192.168.1.2:65528"]) {
    assert.equal(normalizeManualLanPeer(unsafePeer), null, `Unsafe manual peer accepted: ${unsafePeer}`);
  }

  const secret = "s".repeat(43);
  const encrypted = await encryptLanSyncPayload(secret, { text: "private note", count: 2 });
  assert.deepEqual(await decryptLanSyncPayload(secret, encrypted), { text: "private note", count: 2 });
  assert.deepEqual(await decryptLanSyncPayload(secret, encrypted), { text: "private note", count: 2 }, "shared-key payload remains decryptable");
  const tampered = JSON.parse(encrypted);
  tampered.ciphertext = `${tampered.ciphertext.startsWith("A") ? "B" : "A"}${tampered.ciphertext.slice(1)}`;
  await assert.rejects(() => decryptLanSyncPayload(secret, JSON.stringify(tampered)), /decrypt_failed/);

  const now = Date.now();
  const requestInput = {
    secret,
    vaultId: "v".repeat(24),
    deviceId: "d".repeat(24),
    method: "POST",
    path: "/cancip-lan/v1/ping",
    body: encrypted,
    now
  };
  const requestHeaders = await createLanSyncRequestHeaders(requestInput);
  const lowerHeaders = Object.fromEntries(Object.entries(requestHeaders).map(([key, value]) => [key.toLowerCase(), value]));
  const replayCache = new Map();
  assert.equal(await verifyLanSyncRequest({ ...requestInput, headers: lowerHeaders, replayCache }), requestInput.deviceId);
  await assert.rejects(() => verifyLanSyncRequest({ ...requestInput, headers: lowerHeaders, replayCache }), /replayed_request/);
  await assert.rejects(() => verifyLanSyncRequest({ ...requestInput, vaultId: "x".repeat(24), headers: lowerHeaders, replayCache: new Map() }), /vault_mismatch/);

  const local = { path: "Note.md", size: 5, mtime: 100, hash: "a".repeat(43) };
  const remote = { path: "Note.md", size: 6, mtime: 200, hash: "b".repeat(43) };
  assert.equal(planLanSyncReconciliation([local], [remote], { "Note.md": local.hash })[0].kind, "pull");
  assert.equal(planLanSyncReconciliation([local], [remote], { "Note.md": remote.hash })[0].kind, "push");
  const firstReconciliation = planLanSyncReconciliation([local], [remote], {});
  assert.equal(firstReconciliation[0].kind, "pull", "The latest first-scan version should replace the original path");
  const largerConflict = planLanSyncReconciliation(
    [{ ...local, size: 5, mtime: 999 }],
    [{ ...remote, size: 8, mtime: 1 }],
    {},
    { incrementalPush: true, incrementalPull: true, deletePush: false, deletePull: false, syncConfigFolder: false, deleteProtocol: true, conflictRule: "larger" },
    { incrementalPush: false, incrementalPull: false, deletePush: false, deletePull: false, syncConfigFolder: false, deleteProtocol: false, conflictRule: "larger" }
  );
  assert.equal(largerConflict[0].kind, "pull", "Larger-file rule did not select the remote file for the original path");
  const inboxPath = normalizeLanInboxAttachmentPath(".trash/ntfy-inbox/attachment_12345678/demo.txt");
  assert.equal(inboxPath, ".trash/ntfy-inbox/attachment_12345678/demo.txt");
  assert.equal(isLanInboxAttachmentPath(inboxPath), true);
  assert.equal(normalizeLanInboxAttachmentPath(".trash/ntfy-inbox/attachment_12345678/../bad.txt"), null);

  const passivePolicy = {
    incrementalPush: false,
    incrementalPull: false,
    deletePush: false,
    deletePull: false,
    syncConfigFolder: false,
    deleteProtocol: true,
    conflictRule: "latest"
  };
  const incrementalPushPolicy = { ...passivePolicy, incrementalPush: true };
  const incrementalPullPolicy = { ...passivePolicy, incrementalPull: true };
  const contentBidirectionalPolicy = {
    ...incrementalPushPolicy,
    incrementalPull: true,
    deletePush: true,
    deletePull: true
  };
  assert.equal(
    planLanSyncReconciliation([local], [], { "Note.md": local.hash }, contentBidirectionalPolicy, passivePolicy)[0].kind,
    "delete-local",
    "Default bidirectional mode did not carry a deletion"
  );
  assert.deepEqual(
    planLanSyncReconciliation([local], [], { "Note.md": local.hash }, incrementalPushPolicy, passivePolicy),
    [],
    "Deletion was resurrected in incremental-push mode"
  );
  const deletePushPolicy = { ...incrementalPushPolicy, deletePush: true };
  const deletePullPolicy = { ...incrementalPullPolicy, deletePull: true };
  assert.equal(planLanSyncReconciliation([local], [remote], { "Note.md": remote.hash }, incrementalPushPolicy, passivePolicy)[0].kind, "push");
  assert.equal(planLanSyncReconciliation([local], [remote], { "Note.md": local.hash }, incrementalPullPolicy, passivePolicy)[0].kind, "pull");
  assert.deepEqual(planLanSyncReconciliation([local], [remote], { "Note.md": local.hash }, incrementalPushPolicy, passivePolicy), []);
  assert.equal(planLanSyncReconciliation([], [remote], { "Note.md": remote.hash }, deletePushPolicy, passivePolicy)[0].kind, "delete-remote");
  assert.equal(planLanSyncReconciliation([local], [], { "Note.md": local.hash }, deletePullPolicy, passivePolicy)[0].kind, "delete-local");
  const locallyChanged = { ...local, hash: "c".repeat(43), mtime: 300 };
  assert.deepEqual(planLanSyncReconciliation([locallyChanged], [], { "Note.md": local.hash }, deletePullPolicy, passivePolicy), [], "A remote deletion removed a locally changed file");

  const localMetadata = { path: "Note.md", size: 5, mtime: 100 };
  const remoteMetadata = { path: "Note.md", size: 6, mtime: 200 };
  const metadataBaseline = { local: { size: 5, mtime: 100 }, remote: { size: 5, mtime: 100 } };
  assert.equal(planLanSyncMetadataReconciliation([localMetadata], [remoteMetadata], { "Note.md": metadataBaseline })[0].kind, "pull");
  assert.equal(planLanSyncMetadataReconciliation([{ ...localMetadata, mtime: 3_000 }], [localMetadata], { "Note.md": metadataBaseline })[0].kind, "push");
  assert.equal(planLanSyncMetadataReconciliation([localMetadata], [remoteMetadata], {})[0].kind, "pull");
  assert.deepEqual(
    planLanSyncMetadataReconciliation(
      [{ ...localMetadata, mtime: 1_000 }],
      [{ ...localMetadata, mtime: 2_500 }],
      { "Note.md": { local: localMetadata, remote: localMetadata } }
    ),
    [],
    "Small cross-device mtime quantization created a false transfer"
  );
  assert.equal(
    planLanSyncMetadataReconciliation([localMetadata], [], { "Note.md": metadataBaseline }, contentBidirectionalPolicy, passivePolicy)[0].kind,
    "delete-local",
    "Default bidirectional metadata mode did not carry a deletion"
  );
  assert.deepEqual(
    planLanSyncMetadataReconciliation([localMetadata], [], { "Note.md": metadataBaseline }, incrementalPushPolicy, passivePolicy),
    [],
    "Metadata deletion was resurrected in incremental-push mode"
  );
  assert.equal(planLanSyncMetadataReconciliation([], [localMetadata], { "Note.md": metadataBaseline }, deletePushPolicy, passivePolicy)[0].kind, "delete-remote");
  assert.equal(planLanSyncMetadataReconciliation([localMetadata], [], { "Note.md": metadataBaseline }, deletePullPolicy, passivePolicy)[0].kind, "delete-local");
  assert.deepEqual(
    planLanSyncMetadataReconciliation([{ ...localMetadata, mtime: 3_000 }], [], { "Note.md": metadataBaseline }, deletePullPolicy, passivePolicy),
    [],
    "A remote deletion removed a locally changed metadata version"
  );

  class FakeElement {
    constructor() {
      this.hidden = false;
      this.style = { display: "inline-flex" };
      this.attributes = new Map([["style", "display: inline-flex; color: red"], ["aria-hidden", "false"]]);
    }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    removeAttribute(name) { this.attributes.delete(name); }
  }
  const remotelySave = {
    isSyncing: true,
    currSyncMsg: "cloud sync",
    settings: { serviceType: "onedrive", syncDirection: "bidirectional" },
    statusBarElement: new FakeElement()
  };
  const remotelySaveState = JSON.stringify({ isSyncing: remotelySave.isSyncing, currSyncMsg: remotelySave.currSyncMsg, settings: remotelySave.settings });
  const takeover = new LanStatusBarTakeover();
  takeover.takeOver(remotelySave.statusBarElement);
  assert.equal(remotelySave.statusBarElement.hidden, true);
  assert.equal(remotelySave.statusBarElement.getAttribute("aria-hidden"), "true");
  takeover.restore();
  assert.equal(remotelySave.statusBarElement.hidden, false);
  assert.equal(remotelySave.statusBarElement.getAttribute("style"), "display: inline-flex; color: red");
  assert.equal(remotelySave.statusBarElement.getAttribute("aria-hidden"), "false");
  assert.equal(JSON.stringify({ isSyncing: remotelySave.isSyncing, currSyncMsg: remotelySave.currSyncMsg, settings: remotelySave.settings }), remotelySaveState);

  const identity = {
    schemaVersion: 1,
    vaultId: "vault_identity_1234567890",
    secret: "shared_secret_12345678901234567890123456789012",
    createdAt: new Date().toISOString()
  };
  const deviceA = "AAAAAAAAAAAAAAAAAAAAAAAA";
  const deviceB = "BBBBBBBBBBBBBBBBBBBBBBBB";
  const [portA, portB] = await Promise.all([freePort(), freePort()]);
  assert.notEqual(portA, portB);
  const storageA = new MemoryStorage(identity, {
    "Notes/from-a.md": { content: "from A", mtime: 100 },
    "Notes/shared.md": { content: "older A", mtime: 200_000 },
    "Notes/identical.md": { content: "same", mtime: 150 },
    ".obsidian/hotkeys.json": { content: "hotkeys from A", mtime: 500 },
    ".obsidian/plugins/example/data.json": { content: "other plugin data from A", mtime: 550 },
    ".obsidian/plugins/remotely-save/data.json": { content: "protected fixture", mtime: 600 }
  });
  const storageB = new MemoryStorage(identity, {
    "Notes/from-b.md": { content: "from B", mtime: 300 },
    "Notes/shared.md": { content: "newer B", mtime: 400_000 },
    "Notes/identical.md": { content: "same", mtime: 150 }
  });
  const descriptor = (deviceId, port) => JSON.stringify({
    schemaVersion: 1,
    protocolVersion: 1,
    vaultId: identity.vaultId,
    deviceId,
    port,
    addresses: ["127.0.0.1"],
    updatedAt: new Date().toISOString()
  });
  const requestedRoutes = [];
  const httpRequest = async (request) => {
    requestedRoutes.push(new URL(request.url).pathname);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), request.timeoutMs);
    try {
      const response = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        signal: controller.signal
      });
      return { status: response.status, text: await response.text() };
    } finally {
      clearTimeout(timer);
    }
  };
  const progressA = [];
  const progressB = [];
  const commonOptions = (storage, port, deviceId, progress, overrides = {}) => {
    const runtimeSettings = {
      enabled: true,
      autoDiscovery: true,
      checkIntervalSeconds: 1,
      mode: "bidirectional",
      syncConfigFolder: false,
      configDir: ".obsidian",
      port,
      maxFileBytes: 1024 * 1024,
      manualPeers: [],
      ...overrides
    };
    const activityChanges = [];
    return {
      desktop: true,
      getSettings: () => runtimeSettings,
      storage,
      httpRequest,
      onProgress: (value) => progress.push(value),
      onActivityChanged: () => activityChanges.push(Date.now()),
      localStore: memoryLocalStore(deviceId),
      runtimeSettings,
      activityChanges
    };
  };
  // Shared-key compatibility: device identities may differ while a
  // user-supplied key keeps the authenticated LAN channel common. This guards
  // the runtime settings normalization path as well as the wire handshake.
  const sharedKey = "lan-shared-key-compatibility";
  const sharedVaultId = "vault_shared_key_1234567890";
  const sharedIdentityA = {
    schemaVersion: 1,
    vaultId: sharedVaultId,
    secret: "device_a_identity_secret_123456789012345678901234567890",
    createdAt: new Date().toISOString()
  };
  const sharedIdentityB = {
    schemaVersion: 1,
    vaultId: sharedVaultId,
    secret: "device_b_identity_secret_123456789012345678901234567890",
    createdAt: new Date().toISOString()
  };
  const sharedPortA = await freePort();
  const sharedPortB = await freePort();
  const sharedStorageA = new MemoryStorage(sharedIdentityA, { "Notes/shared-key-a.md": { content: "A", mtime: 100 } });
  const sharedStorageB = new MemoryStorage(sharedIdentityB, { "Notes/shared-key-b.md": { content: "B", mtime: 100 } });
  const sharedOptionsB = commonOptions(sharedStorageB, sharedPortB, "SHAREDKEYBBBBBBBBBBBB", [], {
    autoDiscovery: false,
    sharedSecret: sharedKey
  });
  const sharedOptionsA = commonOptions(sharedStorageA, sharedPortA, "SHAREDKEYAAAAAAAAAAAA", [], {
    autoDiscovery: false,
    manualPeers: [`127.0.0.1:${sharedPortB}`],
    sharedSecret: sharedKey
  });
  const sharedServiceA = new NtfyLanSync(sharedOptionsA);
  const sharedServiceB = new NtfyLanSync(sharedOptionsB);
  try {
    await sharedServiceB.start();
    await sharedServiceA.start();
    await waitFor(() => sharedServiceA.status().peerCount === 1, "same shared-key peer with different identity secrets");
    assert.equal(sharedServiceA.listPeers()[0].compatible, true, "Shared-key handshake did not negotiate metadata compatibility");
  } finally {
    await Promise.all([sharedServiceA.stop(), sharedServiceB.stop()]);
  }
  let stabilityClock = 1_000;
  let stabilityPeerEvents = 0;
  const stabilityProgress = [];
  const stabilitySettings = {
    enabled: true,
    autoDiscovery: true,
    checkIntervalSeconds: 1,
    mode: "bidirectional",
    syncConfigFolder: false,
    configDir: ".obsidian",
    port: 43190,
    maxFileBytes: 1024 * 1024,
    manualPeers: []
  };
  const stabilityService = new NtfyLanSync({
    desktop: false,
    getSettings: () => stabilitySettings,
    storage: new MemoryStorage(identity, {}),
    httpRequest,
    onProgress: (value) => stabilityProgress.push(value),
    onPeersChanged: () => { stabilityPeerEvents += 1; },
    localStore: memoryLocalStore("STABILITYSTABILITY01"),
    now: () => stabilityClock
  });
  const stabilityPeer = {
    deviceId: "STABILITYPEER123456",
    port: 43190,
    addresses: new Set(["127.0.0.1"]),
    canHost: true,
    lastSeenAt: stabilityClock,
    verifiedAt: stabilityClock,
    lastProbeAt: 0,
    lastSyncAt: 0,
    consecutiveFailures: 1,
    lastFailureAt: stabilityClock,
    probing: false,
    manual: false,
    lastRemoteSyncRequestId: "",
    remoteFullSyncRequestId: "",
    remoteDirtyPaths: new Map(),
    policy: { incrementalPush: false, incrementalPull: false, deletePush: false, deletePull: false, syncConfigFolder: false, deleteProtocol: true },
    capabilities: new Set(),
    compatibilityPendingSince: 0
  };
  stabilityService.peers.set(stabilityPeer.deviceId, stabilityPeer);
  stabilityClock = 8_000;
  assert.equal(stabilityService.listPeers().length, 1, "A short probe failure should not hide an authenticated peer");
  stabilityService.emitPeersChanged();
  stabilityPeer.lastSeenAt = stabilityClock + 1_000;
  stabilityClock += 1_000;
  stabilityService.emitPeersChanged();
  assert.equal(stabilityPeerEvents, 1, "Heartbeat timestamps should not rebuild the chat contact list");
  stabilityPeer.canHost = false;
  stabilityService.requestSync();
  assert.equal(stabilityService.progress().stage, "waiting-peer-scan", "An empty incremental wakeup pretended to start a full-vault scan");
  stabilityService.applyRemoteSyncSignal(stabilityPeer, {});
  stabilityClock += 3_000;
  stabilityService.emitPeerConnectionStage(stabilityPeer);
  assert.equal(stabilityService.progress().stage, "peer-upgrade-required", "An incompatible passive mobile peer stayed at an unexplained 0/0 state");
  stabilityService.applyRemoteSyncSignal(stabilityPeer, { capabilities: ["metadata-session-v3"] });
  stabilityService.emitPeerConnectionStage(stabilityPeer);
  assert.equal(stabilityService.progress().stage, "waiting-peer-scan", "A compatible peer incorrectly resumed a full-scan stage without discovered changes");
  assert.ok(stabilityProgress.some((value) => value.stage === "checking-peer" || value.stage === "peer-upgrade-required"), "Peer compatibility stages were not emitted");
  stabilityPeer.consecutiveFailures = 3;
  stabilityClock = 31_500;
  assert.equal(stabilityService.listPeers().length, 0, "A peer should leave the list only after the stable grace window");

  const journalPort = await freePort();
  const journalDevice = "JOURNALCHECKPOINT123456";
  const journalStore = memoryLocalStore(journalDevice);
  const journalStorage = new MemoryStorage(identity, {
    "Notes/existing-before-checkpoint.md": { content: "existing", mtime: 10 }
  });
  const journalOptions = commonOptions(journalStorage, journalPort, journalDevice, [], { autoDiscovery: false });
  journalOptions.localStore = journalStore;
  const journalService = new NtfyLanSync(journalOptions);
  await journalService.start();
  journalService.recordFullScan();
  journalService.recordSyncCheckpoint();
  const savedCheckpoint = journalService.lastSyncCheckpointAt;
  journalService.notifyVaultChange("Notes/deleted-while-running.md");
  await journalService.stop();
  journalStorage.putText("Notes/created-while-stopped.md", "offline change", savedCheckpoint + 100);
  journalStorage.putText(
    ".obsidian/plugins/example-plugin/settings/config.json",
    "offline config change",
    savedCheckpoint + 101
  );
  journalStorage.listFilesCalls = 0;
  journalStorage.listFilesChangedSinceCalls = 0;
  const reloadOptions = commonOptions(journalStorage, journalPort, journalDevice, [], { autoDiscovery: false });
  reloadOptions.localStore = journalStore;
  const reloadedJournalService = new NtfyLanSync(reloadOptions);
  await reloadedJournalService.start();
  assert.equal(reloadedJournalService.fullSyncRequested, false, "A recent checkpoint still forced a full-vault scan after reload");
  assert.ok(reloadedJournalService.dirtyPaths.has("Notes/deleted-while-running.md"), "The durable deletion journal was lost across reload");
  assert.ok(reloadedJournalService.dirtyPaths.has("Notes/created-while-stopped.md"), "Checkpoint catch-up missed a file changed while the watcher was stopped");
  assert.ok(
    reloadedJournalService.dirtyPaths.has(".obsidian/plugins/example-plugin/settings/config.json"),
    "Checkpoint catch-up missed a configuration file changed while the watcher was stopped"
  );
  assert.equal(journalStorage.listFilesCalls, 0, "Checkpoint restoration called the full-Vault enumerator");
  assert.equal(journalStorage.listFilesChangedSinceCalls, 1, "Checkpoint restoration did not use the changed-since index exactly once");
  await reloadedJournalService.stop();

  const corruptJournalPort = await freePort();
  const corruptJournalDevice = "CORRUPTJOURNAL12345678";
  const corruptJournalStore = memoryLocalStore(corruptJournalDevice);
  corruptJournalStore.setItem(`ntfy.lan-sync.last-full-scan.v1.${identity.vaultId}`, String(Date.now()));
  corruptJournalStore.setItem(`ntfy.lan-sync.change-journal.v1.${identity.vaultId}`, JSON.stringify({ schemaVersion: 99, entries: [] }));
  const corruptJournalOptions = commonOptions(new MemoryStorage(identity, {}), corruptJournalPort, corruptJournalDevice, [], { autoDiscovery: false });
  corruptJournalOptions.localStore = corruptJournalStore;
  const corruptJournalService = new NtfyLanSync(corruptJournalOptions);
  await corruptJournalService.start();
  assert.equal(corruptJournalService.fullSyncRequested, true, "A corrupt durable journal suppressed the safety reconciliation");
  await corruptJournalService.stop();

  const overflowPort = await freePort();
  const overflowDevice = "OVERFLOWJOURNAL123456";
  const overflowStore = memoryLocalStore(overflowDevice);
  overflowStore.setItem(`ntfy.lan-sync.last-full-scan.v1.${identity.vaultId}`, String(Date.now()));
  overflowStore.setItem(`ntfy.lan-sync.change-journal.v1.${identity.vaultId}`, JSON.stringify({
    schemaVersion: 1,
    checkpointAt: Date.now(),
    sequence: 0,
    entries: []
  }));
  const overflowOptions = commonOptions(
    new MemoryStorage(identity, {}),
    overflowPort,
    overflowDevice,
    [],
    { autoDiscovery: false }
  );
  overflowOptions.localStore = overflowStore;
  const overflowService = new NtfyLanSync(overflowOptions);
  await overflowService.start();
  for (let index = 0; index < 4_097; index += 1) overflowService.notifyVaultChange(`Overflow/f-${index}.md`);
  assert.equal(overflowService.dirtyPaths.size, 4_097, "The change queue discarded real paths at an implementation limit");
  assert.equal(overflowService.fullSyncRequested, false, "A large change queue incorrectly promoted itself to a blocking full scan");
  assert.equal(overflowService.forceFilesystemScanRequested, false, "A large change queue incorrectly requested a filesystem scan");
  await overflowService.stop();

  // Manual strict sync must start both full filesystem walks concurrently.
  // A serial coordinator scan made the phone sit at "waiting for manifest"
  // until a large desktop vault had already finished all 16k paths.
  const concurrentPortB = await freePort();
  const concurrentStorageA = new MemoryStorage(identity, { "Concurrent/a.md": { content: "A", mtime: 10 } });
  const concurrentStorageB = new MemoryStorage(identity, { "Concurrent/b.md": { content: "B", mtime: 20 } });
  let concurrentScanAStarted = false;
  let concurrentScanBStarted = false;
  let releaseConcurrentScanA;
  let releaseConcurrentScanB;
  const concurrentScanAGate = new Promise((resolvePromise) => { releaseConcurrentScanA = resolvePromise; });
  const concurrentScanBGate = new Promise((resolvePromise) => { releaseConcurrentScanB = resolvePromise; });
  const concurrentListA = concurrentStorageA.listFiles.bind(concurrentStorageA);
  const concurrentListB = concurrentStorageB.listFiles.bind(concurrentStorageB);
  concurrentStorageA.listFiles = async (...args) => {
    concurrentScanAStarted = true;
    await concurrentScanAGate;
    return await concurrentListA(...args);
  };
  concurrentStorageB.listFiles = async (...args) => {
    concurrentScanBStarted = true;
    await concurrentScanBGate;
    return await concurrentListB(...args);
  };
  const concurrentServiceB = new NtfyLanSync(commonOptions(
    concurrentStorageB,
    concurrentPortB,
    "CONCURRENTBBBBBBBBBBB",
    [],
    { autoDiscovery: false }
  ));
  const concurrentOptionsA = commonOptions(
    concurrentStorageA,
    await freePort(),
    "CONCURRENTAAAAAAAAAAA",
    [],
    { autoDiscovery: false, manualPeers: [`127.0.0.1:${concurrentPortB}`] }
  );
  const concurrentServiceA = new NtfyLanSync(concurrentOptionsA);
  let concurrentGatesReleased = false;
  try {
    await concurrentServiceB.start();
    await concurrentServiceA.start();
    await waitFor(() => concurrentServiceA.status().peerCount === 1, "concurrent full-scan peer");
    concurrentServiceA.requestSync({ deep: true, strict: true });
    await waitFor(() => concurrentScanAStarted && concurrentScanBStarted, "both full filesystem walks to start before either completes");
    assert.equal(concurrentServiceA.progress().phase === "syncing", false, "Transfer started before both strict scans completed");
    releaseConcurrentScanA();
    releaseConcurrentScanB();
    concurrentGatesReleased = true;
    await waitFor(
      () => concurrentStorageA.text("Concurrent/b.md") === "B" && concurrentStorageB.text("Concurrent/a.md") === "A",
      "concurrent strict full scan to hand off to transfer"
    );
    assert.equal(concurrentStorageA.listFilesCalls, 1, "Manual strict sync enumerated the coordinator vault more than once");
    assert.equal(concurrentStorageB.listFilesCalls, 1, "Manual strict sync enumerated the peer vault more than once");
  } finally {
    if (!concurrentGatesReleased) {
      releaseConcurrentScanA?.();
      releaseConcurrentScanB?.();
    }
    await Promise.all([concurrentServiceA.stop(), concurrentServiceB.stop()]);
  }

  const optionsB = commonOptions(storageB, portB, deviceB, progressB);
  const optionsA = commonOptions(storageA, portA, deviceA, progressA, { autoDiscovery: false, manualPeers: [`127.0.0.1:${portB}`] });
  const messagesB = [];
  optionsB.onMessage = (message) => messagesB.push(message);
  const serviceB = new NtfyLanSync(optionsB);
  const serviceA = new NtfyLanSync(optionsA);
  try {
    await serviceB.start();
    await serviceA.start();
    await waitFor(() => serviceA.status().peerCount === 1, "authenticated same-Vault peer");
    assert.equal(serviceA.listPeers()[0].deviceId, deviceB, "Manual endpoint was not rebound to the authenticated device ID");
    assert.equal(serviceA.listPeers()[0].linkType, "manual");
    assert.equal(serviceA.peers.get(deviceB).capabilities.has("metadata-session-v4"), true, "Authenticated ping did not negotiate metadata sync");
    assert.equal(serviceA.peers.get(deviceB).capabilities.has("metadata-session-v3"), true, "Authenticated ping did not advertise rolling-upgrade compatibility");
    serviceA.requestSync();
    await waitFor(() => storageA.text("Notes/from-b.md") === "from B" && storageB.text("Notes/from-a.md") === "from A", "automatic bidirectional LAN transfer");
    await waitFor(() => storageA.text("Notes/shared.md") === "newer B" && storageB.text("Notes/shared.md") === "newer B", "original-path convergence");
    assert.equal([...storageA.files.keys(), ...storageB.files.keys()].some((path) => path.includes("LAN conflict")), false, "LAN sync created a renamed conflict copy");
    assert.equal(storageA.readCount("Notes/identical.md"), 0, "Metadata sync read identical local content on its first scan");
    assert.equal(storageB.readCount("Notes/identical.md"), 0, "Metadata sync read identical remote content on its first scan");
    assert.equal((await storageA.statFile("Notes/from-b.md")).mtime, 300, "Pulled file did not preserve the source mtime");
    assert.equal((await storageB.statFile("Notes/from-a.md")).mtime, 100, "Pushed file did not preserve the source mtime");
    assert.ok(progressA.some((value) => value.phase === "syncing" && value.active));
    assert.equal(progressA.some((value) => value.phase === "scanning"), false, "Local scanning still overwrote the transfer progress channel");
    assert.ok(optionsA.activityChanges.length > 0, "Independent scan activity did not notify the UI");
    await waitFor(() => progressA.some((value) => value.phase === "complete" && value.uploads > 0 && value.downloads > 0), "bidirectional completion progress");
    assert.ok(progressA.some((value) => value.phase === "complete"
      && value.conflicts === 0
      && value.uploadCompleted === value.uploads
      && value.downloadCompleted === value.downloads
      && value.uploads > 0
      && value.downloads > 0), "Completion progress did not expose separate upload/download completion counts");
    assert.ok(progressB.some((value) => value.active), "Receiving peer did not expose LAN status");
    assert.ok(
      progressB.some((value) => ["enumerating", "packaging-manifest", "waiting-plan"].includes(value.stage)),
      "Receiving peer did not expose its manifest lifecycle"
    );
    const mirroredPeerScan = [serviceA.activity({ includeScanFiles: false, includeTransferFiles: false }).remote, ...serviceA.peers.values()].some((value) => {
      const remote = value?.remoteProgress || value;
      return (remote?.scanTotal || 0) > 0;
    });
    assert.ok(mirroredPeerScan || progressB.some((value) => value.stage === "packaging-manifest"), "The peer scan produced neither a mirrored counter nor a visible completion stage");
    const firstInboundTransfer = progressB.findIndex((value) => value.phase === "syncing" && value.total > 0);
    assert.ok(firstInboundTransfer >= 0, "Receiving peer did not start a counted transfer session");
    assert.equal(progressB.slice(firstInboundTransfer).some((value) => value.phase === "syncing" && value.total === 0), false, "Receiving progress reset to zero during file requests");
    const activityA = serviceA.activity();
    assert.ok(activityA.roundHistory.length > 0, "Completed incremental/full sync round was not persisted to activity history");
    assert.ok(activityA.scan.total > 0, "Full-vault scan snapshot did not expose total files");
    assert.equal(activityA.scan.completed, activityA.scan.total, "Full-vault scan did not finish monotonically");
    assert.ok(activityA.scan.files.some((file) => file.state === "cached" || file.state === "complete"), "Scan file states were not retained");
    assert.ok(activityA.files.some((file) => file.path === "Notes/from-a.md" && file.state === "complete"), "Coordinator did not retain completed file activity");
    assert.ok(activityA.files.some((file) => file.path === "Notes/shared.md" && file.action === "pull"), "Latest remote file was not shown as a download");
    assert.ok(activityA.scanGroups.some((group) => group.key === "Notes" && group.completed === group.total), "Scan activity was not grouped by top-level folder");
    assert.ok(activityA.transferGroups.some((group) => group.key === "Notes" && group.completed === group.total), "Transfer activity was not grouped by top-level folder");
    const collapsedActivityA = serviceA.activity({ includeScanFiles: false, includeTransferFiles: false });
    assert.equal(collapsedActivityA.scan.total, activityA.scan.total, "Collapsed scan lost its summary");
    assert.deepEqual(collapsedActivityA.scan.files, [], "Collapsed scan still cloned file rows");
    assert.deepEqual(collapsedActivityA.files, [], "Collapsed transfer section still cloned file rows");
    const notesOnlyActivity = serviceA.activity({ scanGroups: ["Notes"], transferGroups: ["Notes"] });
    assert.ok(notesOnlyActivity.scan.files.length > 0 && notesOnlyActivity.scan.files.every((file) => lanSyncTopLevelGroup(file.path) === "Notes"), "Expanded scan group materialized another folder");
    assert.ok(notesOnlyActivity.files.length > 0 && notesOnlyActivity.files.every((file) => lanSyncTopLevelGroup(file.path) === "Notes"), "Expanded transfer group materialized another folder");

    // A second explicit full round must retain the same denominator and reuse
    // the metadata index for unchanged files instead of walking every file
    // through the producer again.
    const previousFullScan = serviceA.activity().scan;
    serviceA.requestSync({ deep: true, strict: true });
    await waitFor(
      () => !serviceA.fullSyncRequested
        && serviceA.activity().scan.phase === "complete"
        && serviceA.activity().scan.total >= previousFullScan.total,
      "cached full-vault scan settlement",
      30_000
    );
    const cachedFullScan = serviceA.activity().scan;
    // The first follow-up may legitimately discover a file that was pulled
    // into this device during the preceding transfer. That file belongs in
    // the new denominator once; the next unchanged round must then be stable.
    assert.ok(cachedFullScan.total >= previousFullScan.total, "A full round lost files from the scan denominator");
    assert.equal(cachedFullScan.completed, cachedFullScan.total, "A cached full round did not finish monotonically");
    assert.ok(cachedFullScan.cached >= Math.max(0, cachedFullScan.total - cachedFullScan.skipped - 1), "Unchanged files were not skipped by the metadata index");
    const stableScanBaseline = cachedFullScan;
    serviceA.requestSync({ deep: true, strict: true });
    await waitFor(
      () => !serviceA.fullSyncRequested
        && serviceA.activity().scan.phase === "complete"
        && serviceA.activity().scan.total === stableScanBaseline.total,
      "unchanged cached full-vault scan settlement",
      30_000
    );
    const stableCachedFullScan = serviceA.activity().scan;
    assert.equal(stableCachedFullScan.total, stableScanBaseline.total, "An unchanged full round changed the scan denominator");
    assert.equal(stableCachedFullScan.completed, stableCachedFullScan.total, "An unchanged cached round did not finish monotonically");
    assert.ok(stableCachedFullScan.cached >= Math.max(0, stableCachedFullScan.total - stableCachedFullScan.skipped - 1), "The unchanged round did not reuse the metadata index");

    // The default bidirectional mode must carry file operations as well as
    // content. A rename is represented by the old-path delete plus the new
    // path create, so both sides converge without a conflict copy.
    storageA.files.delete("Notes/from-a.md");
    serviceA.notifyVaultChange("Notes/from-a.md");
    storageA.putText("Notes/renamed-from-a.md", "renamed A", 910);
    serviceA.notifyVaultChange("Notes/renamed-from-a.md");
    serviceA.requestSync();
    await waitFor(
      () => storageB.text("Notes/from-a.md") === null && storageB.text("Notes/renamed-from-a.md") === "renamed A",
      "bidirectional delete and rename convergence"
    );
    const periodicRequestId = serviceA.fullSyncRequestId;
    serviceA.syncRunning = true;
    serviceA.requestPeriodicSync();
    assert.equal(serviceA.fullSyncRequestId, periodicRequestId, "Periodic calibration replaced the active synchronization request");
    assert.equal(serviceA.syncQueued, false, "Periodic calibration queued a redundant scan during active synchronization");
    serviceA.syncRunning = false;
    serviceA.requestPeriodicSync();
    assert.equal(serviceA.fullSyncRequestId, periodicRequestId, "A recent completed full scan was immediately scheduled again");
    assert.equal(storageA.readCount("Notes/from-b.md"), 0, "A verified remote write was read back only to hash it again");
    const readsBeforeCachedScan = storageA.totalReads();
    const fullEnumerationsBeforeCachedScanA = storageA.listFilesCalls;
    const fullEnumerationsBeforeCachedScanB = storageB.listFilesCalls;
    await serviceA.buildMetadataManifest(false);
    await serviceA.callPeer(
      serviceA.peers.get(deviceB),
      "/metadata/v4/manifest",
      { syncConfigFolder: false }
    );
    assert.equal(storageA.totalReads(), readsBeforeCachedScan, "An unchanged follow-up scan reread file contents instead of using metadata/hash cache");
    assert.equal(storageA.listFilesCalls, fullEnumerationsBeforeCachedScanA, "A cached local manifest ignored the persistent metadata index");
    assert.equal(storageB.listFilesCalls, fullEnumerationsBeforeCachedScanB, "An ordinary remote full-manifest request forced the peer to enumerate its filesystem again");
    const forcedRemoteEnumerationsBefore = storageB.listFilesCalls;
    const stableScanRequestId = "SCANREQUEST123456789";
    await serviceA.callPeer(serviceA.peers.get(deviceB), "/metadata/v4/manifest", {
      syncConfigFolder: false,
      forceFilesystemScan: true,
      scanRequestIds: [stableScanRequestId]
    });
    await serviceA.callPeer(serviceA.peers.get(deviceB), "/metadata/v4/manifest", {
      syncConfigFolder: false,
      forceFilesystemScan: true,
      scanRequestIds: [stableScanRequestId]
    });
    assert.equal(storageB.listFilesCalls, forcedRemoteEnumerationsBefore + 1, "A retried full-scan request enumerated the peer filesystem twice");
    await serviceA.saveMetadataIndex();
    assert.equal(await storageA.exists(`${storageA.identityRoot}/metadata-index-v1.json`), true, "The full metadata index was not persisted outside the synchronized Vault data plane");
    assert.ok(requestedRoutes.includes("/cancip-lan/v1/metadata/v4/manifest"), "New peers did not use the metadata manifest route");
    assert.ok(serviceB.loadMetadataLedger(deviceA).entries["Notes/identical.md"], "Receiving peer did not persist the reverse metadata ledger");

    const originalListFilesA = storageA.listFiles.bind(storageA);
    let releaseBackgroundScan;
    let backgroundScanStarted;
    const backgroundScanGate = new Promise((resolvePromise) => { releaseBackgroundScan = resolvePromise; });
    const backgroundScanEntered = new Promise((resolvePromise) => { backgroundScanStarted = resolvePromise; });
    storageA.listFiles = async (...args) => {
      backgroundScanStarted();
      await backgroundScanGate;
      return await originalListFilesA(...args);
    };
    serviceA.requestSync({ deep: true });
    await backgroundScanEntered;
    storageA.putText("Realtime/new-during-scan.md", "event lane", 625);
    serviceA.notifyVaultChange("Realtime/new-during-scan.md");
    await waitFor(() => storageB.text("Realtime/new-during-scan.md") === "event lane", "new-file transfer while the background reconciliation was still blocked");
    assert.ok(serviceA.backgroundReconciliation, "The background reconciliation finished before the event-priority transfer was proven");
    releaseBackgroundScan();
    await serviceA.backgroundReconciliation;
    storageA.listFiles = originalListFilesA;
    await waitFor(
      () => !serviceA.syncRunning && !serviceA.fullSyncRequested && serviceA.dirtyPaths.size === 0,
      "background reconciliation settlement"
    ).catch((error) => {
      throw new Error(`${error.message}; state=${JSON.stringify({
        syncRunning: serviceA.syncRunning,
        syncQueued: serviceA.syncQueued,
        fullSyncRequested: serviceA.fullSyncRequested,
        forceFilesystemScanRequested: serviceA.forceFilesystemScanRequested,
        dirtyPaths: serviceA.dirtyPaths.size,
        urgentDirtyPaths: serviceA.urgentDirtyPaths.size,
        activeEditDirty: serviceA.activeEditDirty.size,
        backgroundReconciliation: Boolean(serviceA.backgroundReconciliation),
        inboundSession: Boolean(serviceA.inboundSession),
        progress: serviceA.progress()
      })}`);
    });

    const negotiatedPeer = serviceA.peers.get(deviceB);
    const serviceBSyncSignalPayload = serviceB.syncSignalPayload.bind(serviceB);
    serviceB.syncSignalPayload = () => ({ ...serviceBSyncSignalPayload(), capabilities: ["metadata-session-v3"] });
    negotiatedPeer.capabilities = new Set(["metadata-session-v3"]);
    requestedRoutes.length = 0;
    storageA.putText("Notes/v3-compatible.md", "rolling upgrade", 650);
    serviceA.notifyVaultChange("Notes/v3-compatible.md");
    await waitFor(() => storageB.text("Notes/v3-compatible.md") === "rolling upgrade", "v3 rolling-upgrade synchronization");
    await waitFor(() => !serviceA.syncRunning && serviceA.dirtyPaths.size === 0, "v3 rolling-upgrade session settlement");
    assert.equal(serviceA.listPeers()[0].compatible, true, "A v3 peer was treated as a blocking version conflict");
    assert.ok(requestedRoutes.includes("/cancip-lan/v1/metadata/v3/manifest/paths"), "A v3 peer did not use the negotiated compatibility route");
    assert.equal(requestedRoutes.some((route) => route.includes("/metadata/v4/")), false, "The v3 compatibility pass mixed protocol routes");
    serviceB.syncSignalPayload = serviceBSyncSignalPayload;

    negotiatedPeer.capabilities = new Set(["metadata-session-v2"]);
    requestedRoutes.length = 0;
    const beforeLegacyAttempt = new Map([...storageA.files].map(([path, value]) => [path, { data: new Uint8Array(value.data), mtime: value.mtime }]));
    await assert.rejects(() => serviceA.syncPeer(negotiatedPeer), /peer_upgrade_required/);
    assert.deepEqual(requestedRoutes, [], "An outdated peer initiated legacy synchronization requests");
    assert.deepEqual(storageA.files, beforeLegacyAttempt, "Rejecting an outdated peer changed local files");
    await assert.rejects(() => serviceA.callPeer(negotiatedPeer, "/manifest", {}), /peer_upgrade_required/);
    assert.ok(requestedRoutes.includes("/cancip-lan/v1/manifest"), "The server-side legacy route rejection was not exercised");
    await assert.rejects(() => serviceA.callPeer(negotiatedPeer, "/manifest/metadata", {}), /peer_upgrade_required/);
    assert.ok(requestedRoutes.includes("/cancip-lan/v1/manifest/metadata"), "The server-side v2 metadata route rejection was not exercised");
    negotiatedPeer.capabilities = new Set(["metadata-session-v4"]);

    storageA.putText("Notes/identical.md", "changed on A", 700);
    const incrementalRouteStart = requestedRoutes.length;
    const incrementalProgressA = progressA.length;
    const scanBeforeIncrementalEdit = serviceA.activity().scan;
    const incrementalProgressB = progressB.length;
    serviceA.notifyVaultChange("Notes/identical.md");
    const immediateIncrementalActivity = serviceA.activity();
    assert.ok(
      immediateIncrementalActivity.files.some((file) => file.path === "Notes/identical.md" && file.state === "pending"),
      "A changed file did not appear in the transfer activity immediately"
    );
    await waitFor(() => storageB.text("Notes/identical.md") === "changed on A", "metadata push after a local edit");
    assert.equal((await storageB.statFile("Notes/identical.md")).mtime, 700, "Metadata push lost the source mtime");
    assert.ok(requestedRoutes.slice(incrementalRouteStart).includes("/cancip-lan/v1/metadata/v4/manifest/paths"), "A file event still requested a full-vault manifest");
    const scanAfterIncrementalEdit = serviceA.activity().scan;
    if (scanBeforeIncrementalEdit.total > 0) {
      assert.equal(scanAfterIncrementalEdit.id, scanBeforeIncrementalEdit.id, "A single file event replaced the existing scan snapshot");
      assert.equal(scanAfterIncrementalEdit.total, scanBeforeIncrementalEdit.total, "A single file event changed the existing scan denominator");
    } else {
      assert.ok(scanAfterIncrementalEdit.total <= 1, "A first single file event scanned more than its dirty path");
    }
    await waitFor(
      () => progressA.slice(incrementalProgressA).some((value) => value.phase === "complete" && value.total === 1)
        && progressB.slice(incrementalProgressB).some((value) => value.phase === "complete" && value.total === 1),
      "mirrored incremental completion"
    );
    const mirroredPushA = progressA.slice(incrementalProgressA).filter((value) => value.phase === "complete" && value.total === 1).at(-1);
    const mirroredPushB = progressB.slice(incrementalProgressB).filter((value) => value.phase === "complete" && value.total === 1).at(-1);
    assert.ok(mirroredPushA && mirroredPushB, "Both peers did not finish the same incremental session");
    assert.equal(mirroredPushA.uploads, mirroredPushB.downloads, "Coordinator uploads did not mirror peer downloads");
    assert.equal(mirroredPushA.downloads, mirroredPushB.uploads, "Coordinator downloads did not mirror peer uploads");
    assert.equal(mirroredPushA.uploadCompleted, mirroredPushB.downloadCompleted, "Coordinator completed uploads did not mirror peer completed downloads");
    assert.equal(mirroredPushA.downloadCompleted, mirroredPushB.uploadCompleted, "Coordinator completed downloads did not mirror peer completed uploads");
    assert.ok(mirroredPushA.sessionId, "Coordinator completion did not retain a transfer session ID");
    assert.equal(mirroredPushA.sessionId, mirroredPushB.sessionId, "The two peers did not report the same immutable transfer session");

    await waitFor(() => serviceB.dirtyPaths.size === 0, "receiver dirty journal settlement");
    serviceB.notifyVaultChange("Notes/identical.md");
    serviceB.notifyVaultChange("Notes/identical.md");
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 60));
  assert.equal(serviceB.dirtyPaths.has("Notes/identical.md"), false, "A LAN-applied write echoed back into the receiver dirty journal");
  assert.match(
    (await readFile(join(root, "src", "lanSync.ts"), "utf8")),
    /echoWindowActive = this\.now\(\) - token\.appliedAt <= 2_000/,
    "LAN-applied mutation suppression must use a short echo window"
  );

    const burstPaths = Array.from({ length: 40 }, (_value, index) => `Burst/f-${String(index).padStart(2, "0")}.md`);
    const scanBeforeBurst = serviceA.activity().scan;
    for (const [index, path] of burstPaths.entries()) {
      storageA.putText(path, `burst-${index}`, 1_000 + index);
      serviceA.notifyVaultChange(path);
    }
    await waitFor(() => storageB.text("Burst/f-00.md") === "burst-0", "first incremental burst batch");
    const scanAfterBurst = serviceA.activity().scan;
    if (scanBeforeBurst.total > 0) {
      assert.equal(scanAfterBurst.id, scanBeforeBurst.id, "Realtime burst replaced the existing scan snapshot");
      assert.equal(scanAfterBurst.total, scanBeforeBurst.total, "Realtime burst changed the existing scan denominator");
    }
    await waitFor(() => storageB.text("Burst/f-39.md") === "burst-39", "all incremental burst batches");
    await waitFor(() => serviceA.dirtyPaths.size === 0 && serviceA.activeEditDirty.size === 0, "incremental burst journal settlement");

    const activeRouteStart = requestedRoutes.length;
    storageA.putText("Notes/active-fast-lane.md", "active lane", 805);
    serviceA.notifyActiveEdit("Notes/active-fast-lane.md");
    await waitFor(() => storageB.text("Notes/active-fast-lane.md") === "active lane", "active-edit fast-lane transfer");
    await waitFor(
      () => !serviceA.dirtyPaths.has("Notes/active-fast-lane.md") && !serviceA.activeEditDirty.has("Notes/active-fast-lane.md"),
      "active-edit dirty checkpoint settlement"
    );
    serviceA.clearActiveEdit();
    const activeManifestRequests = requestedRoutes.slice(activeRouteStart)
      .filter((route) => route === "/cancip-lan/v1/metadata/v4/manifest/paths");
    assert.equal(activeManifestRequests.length, 1, "A successful active-edit session immediately started a duplicate bulk comparison");

    const sessionProbe = {
      sessionId: "SESSIONPROBE123456",
      total: 0,
      bytesTotal: 0,
      uploads: 0,
      downloads: 0,
      files: []
    };
    const firstSessionProbe = await serviceB.handleMetadataSessionStart(deviceA, sessionProbe);
    const resumedSessionProbe = await serviceB.handleMetadataSessionStart(deviceA, sessionProbe);
    assert.equal(firstSessionProbe.sessionId, sessionProbe.sessionId);
    assert.equal(resumedSessionProbe.resumed, true, "A retried session start reset the receiver plan");
    await assert.rejects(
      () => serviceB.handleMetadataSessionStart(deviceA, { ...sessionProbe, sessionId: "SESSIONPROBE654321" }),
      /sync_session_busy/,
      "A second session replaced the active receiver plan"
    );
    await serviceB.handleMetadataSessionFinish(deviceA, {
      sessionId: sessionProbe.sessionId,
      success: true,
      commits: [],
      retryPaths: [],
      acknowledgedDirtyPaths: [],
      acknowledgedFullSyncRequestId: ""
    });

    storageA.putText("Notes/steady-during-volatile.md", "steady", 810);
    storageA.putText("Notes/volatile.md", "volatile-v1", 811);
    let mutatedVolatileRead = false;
    storageA.beforeRead = async (path, storage) => {
      if (path !== "Notes/volatile.md" || mutatedVolatileRead) return;
      mutatedVolatileRead = true;
      storage.putText(path, "volatile-v2", 812);
    };
    const volatileRouteStart = requestedRoutes.length;
    serviceA.notifyVaultChange("Notes/steady-during-volatile.md");
    serviceA.notifyVaultChange("Notes/volatile.md");
    await waitFor(() => storageB.text("Notes/steady-during-volatile.md") === "steady", "unrelated transfer continued after a volatile-file precondition change");
    await waitFor(() => storageB.text("Notes/volatile.md") === "volatile-v2", "volatile file path-only retry", 30_000);
    storageA.beforeRead = null;
    assert.equal(mutatedVolatileRead, true, "Volatile-file precondition regression did not execute");
    assert.equal(requestedRoutes.slice(volatileRouteStart).includes("/cancip-lan/v1/metadata/v4/manifest"), false, "A volatile file retry restarted a full-vault scan");
    assert.ok(progressA.some((value) => value.phase === "complete" && value.total >= 1), "Deferred retry never returned to a completed session");
    assert.ok(serviceA.loadMetadataLedger(deviceB).entries["Notes/identical.md"], "An unrelated incremental pass erased an existing metadata baseline");

    storageA.putText("Notes/steady-during-write-race.md", "steady write", 820);
    storageA.putText("Notes/receiver-write-race.md", "incoming value", 821);
    let receiverWriteRace = false;
    storageB.afterWrite = async (path, storage) => {
      if (path !== "Notes/receiver-write-race.md" || receiverWriteRace) return;
      receiverWriteRace = true;
      storage.putText(path, "receiver changed after write", 900);
    };
    const receiverRaceRouteStart = requestedRoutes.length;
    serviceA.notifyVaultChange("Notes/steady-during-write-race.md");
    serviceA.notifyVaultChange("Notes/receiver-write-race.md");
    await waitFor(() => storageB.text("Notes/steady-during-write-race.md") === "steady write", "unrelated transfer continued after receiver write race");
    await waitFor(() => storageA.text("Notes/receiver-write-race.md") === "receiver changed after write", "receiver write-race path-only retry", 30_000);
    storageB.afterWrite = null;
    assert.equal(receiverWriteRace, true, "Receiver write-race regression did not execute");
    assert.equal(requestedRoutes.slice(receiverRaceRouteStart).includes("/cancip-lan/v1/metadata/v4/manifest"), false, "A receiver write race restarted a full-vault scan");
    assert.equal(mirroredPushA.bytesTotal, mirroredPushB.bytesTotal, "The two peers did not share the same byte total");
    assert.equal(mirroredPushA.bytesTransferred, mirroredPushB.bytesTransferred, "The two peers did not finish the same transferred bytes");
    storageB.putText("Notes/identical.md", "changed on B", 710);
    serviceB.notifyVaultChange("Notes/identical.md");
    await waitFor(() => storageA.text("Notes/identical.md") === "changed on B", "metadata pull after a remote edit");
    assert.equal((await storageA.statFile("Notes/identical.md")).mtime, 710, "Metadata pull lost the source mtime");
    const activityB = serviceB.activity();
    assert.ok(activityB.files.some((file) => file.path.endsWith(".md")), "Receiving peer did not expose inbound file activity");
    const firstProgress = progressA.find((value) => value.phase === "syncing" && value.total > 0 && value.completed === 0);
    assert.ok(firstProgress, "LAN progress did not start at 0/N");
    for (let completed = 0; completed <= firstProgress.total; completed += 1) {
      assert.ok(progressA.some((value) => value.total === firstProgress.total && value.completed === completed), `LAN progress skipped ${completed}/${firstProgress.total}`);
    }
    // Configuration files are part of the full-vault contract by default.
    serviceA.requestSync({ deep: true });
    await waitFor(
      () => storageB.text(".obsidian/hotkeys.json") === "hotkeys from A"
        && storageB.text(".obsidian/plugins/example/data.json") === "other plugin data from A",
      "two-sided full config and plugin-data synchronization"
    );
    assert.equal(storageB.text(".obsidian/plugins/remotely-save/data.json"), null, "Protected Remotely Save data was transferred");
    const eligiblePaths = (storage) => [...storage.files.keys()]
      .filter((path) => normalizeLanSyncPath(path, configPathOptions))
      .sort();
    assert.deepEqual(eligiblePaths(storageA), eligiblePaths(storageB), "The two peers did not converge to the same full-vault path set");
    assert.equal([...storageA.files.keys(), ...storageB.files.keys()].some((path) => path.includes("LAN conflict")), false, "Full-vault sync propagated a renamed conflict copy");

    const nestedConfigPath = ".obsidian/plugins/example-plugin/settings/config.json";
    storageA.putText(nestedConfigPath, "config-v1", 1_600);
    serviceA.notifyVaultChange(nestedConfigPath);
    await waitFor(() => storageB.text(nestedConfigPath) === "config-v1", "new nested configuration file synchronization");
    storageA.putText(nestedConfigPath, "config-v2", 1_700);
    serviceA.notifyVaultChange(nestedConfigPath);
    await waitFor(() => storageB.text(nestedConfigPath) === "config-v2", "updated nested configuration file synchronization");
    storageA.files.delete(nestedConfigPath);
    serviceA.notifyVaultChange(nestedConfigPath);
    await waitFor(() => storageB.text(nestedConfigPath) === null, "deleted nested configuration file synchronization");

    optionsA.runtimeSettings.mode = "delete-push";
    optionsB.runtimeSettings.mode = "bidirectional";
    storageA.files.delete("Notes/from-a.md");
    serviceA.notifyVaultChange("Notes/from-a.md");
    serviceA.requestSync();
    await waitFor(() => storageB.text("Notes/from-a.md") === null, "deletion push");
    storageA.putText("Notes/from-a.md", "recreated A", 900);
    serviceA.notifyVaultChange("Notes/from-a.md");
    serviceA.requestSync();
    await waitFor(() => storageB.text("Notes/from-a.md") === "recreated A", "recreated path after cloud deletion");

    optionsA.runtimeSettings.mode = "delete-pull";
    storageB.files.delete("Notes/from-b.md");
    serviceB.notifyVaultChange("Notes/from-b.md");
    serviceA.requestSync();
    await waitFor(() => storageA.text("Notes/from-b.md") === null, "deletion pull");

    storageA.putText("Share/manual.txt", "explicit file from A", 800);
    storageB.putText("Share/manual.txt", "existing file from B", 801);
    const sentAttachment = await serviceA.sendFile(deviceB, "Share/manual.txt");
    assert.notEqual(sentAttachment.path, "Share/manual.txt", "Explicit file send overwrote a conflicting remote path");
    assert.equal(storageB.text(sentAttachment.path), "explicit file from A");
    const sentMessage = await serviceA.sendMessage(deviceB, { text: "encrypted hello", attachments: [sentAttachment] });
    await waitFor(() => messagesB.some((message) => message.id === sentMessage.id), "authenticated LAN message delivery");
    assert.equal(messagesB.find((message) => message.id === sentMessage.id).text, "encrypted hello");
    assert.equal(messagesB.find((message) => message.id === sentMessage.id).attachments[0].path, sentAttachment.path);
    const deviceAttachment = await serviceA.sendDeviceFile(deviceB, {
      name: "phone-note.txt",
      type: "text/plain",
      data: arrayBuffer(bytes("from phone"))
    });
    assert.match(deviceAttachment.path, /^\.trash\/ntfy-inbox\/[A-Za-z0-9_-]+\/phone-note\.txt$/);
    assert.equal(storageB.text(deviceAttachment.path), "from phone");
    const deviceMessage = await serviceA.sendMessage(deviceB, { text: "device attachment", attachments: [deviceAttachment] });
    await waitFor(() => messagesB.some((message) => message.id === deviceMessage.id), "device attachment message delivery");
    assert.equal(messagesB.find((message) => message.id === deviceMessage.id).attachments[0].temporary, true);
  } finally {
    await Promise.all([serviceA.stop(), serviceB.stop()]);
  }

  const [exactPort, roundedPort] = await Promise.all([freePort(), freePort()]);
  const exactDevice = "DDDDDDDDDDDDDDDDDDDDDDDD";
  const roundedDevice = "EEEEEEEEEEEEEEEEEEEEEEEE";
  const exactStorage = new MemoryStorage(identity, {
    "Notes/android-mtime.md": { content: "stable content", mtime: 123456 }
  });
  const roundedStorage = new MemoryStorage(identity, {}, {
    mtimeTransform: (mtime) => Math.floor(mtime / 1000) * 1000 + 37
  });
  const exactProgress = [];
  const roundedProgress = [];
  const roundedService = new NtfyLanSync(commonOptions(roundedStorage, roundedPort, roundedDevice, roundedProgress));
  const exactService = new NtfyLanSync(commonOptions(exactStorage, exactPort, exactDevice, exactProgress, {
    autoDiscovery: false,
    manualPeers: [`127.0.0.1:${roundedPort}`]
  }));
  try {
    await roundedService.start();
    await exactService.start();
    await waitFor(() => roundedStorage.text("Notes/android-mtime.md") === "stable content", "Android-like initial transfer");
    await waitFor(() => exactProgress.some((value) => value.phase === "complete" && value.total === 1), "Android-like initial session completion");
    const exactMetadata = await exactStorage.statFile("Notes/android-mtime.md");
    const roundedMetadata = await roundedStorage.statFile("Notes/android-mtime.md");
    assert.notEqual(exactMetadata.mtime, roundedMetadata.mtime, "Android-like storage unexpectedly preserved the source mtime exactly");
    assert.deepEqual(exactService.loadMetadataLedger(roundedDevice).entries["Notes/android-mtime.md"], {
      local: { size: exactMetadata.size, mtime: exactMetadata.mtime },
      remote: { size: roundedMetadata.size, mtime: roundedMetadata.mtime }
    }, "Coordinator ledger did not retain both real mtimes");
    assert.deepEqual(roundedService.loadMetadataLedger(exactDevice).entries["Notes/android-mtime.md"], {
      local: { size: roundedMetadata.size, mtime: roundedMetadata.mtime },
      remote: { size: exactMetadata.size, mtime: exactMetadata.mtime }
    }, "Receiving peer ledger was not the coordinator ledger inverse");
    const writesBeforeSteadyScan = roundedStorage.totalWrites();
    const readsBeforeSteadyScan = exactStorage.totalReads() + roundedStorage.totalReads();
    const exactEnumerationsBeforeIdleWakeup = exactStorage.listFilesCalls;
    const roundedEnumerationsBeforeIdleWakeup = roundedStorage.listFilesCalls;
    exactService.requestSync();
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
    assert.equal(roundedStorage.totalWrites(), writesBeforeSteadyScan, "An empty incremental wakeup rewrote an unchanged file");
    assert.equal(exactStorage.totalReads() + roundedStorage.totalReads(), readsBeforeSteadyScan, "An empty incremental wakeup reread unchanged file content");
    assert.equal(exactStorage.listFilesCalls, exactEnumerationsBeforeIdleWakeup, "An empty incremental wakeup enumerated the local Vault");
    assert.equal(roundedStorage.listFilesCalls, roundedEnumerationsBeforeIdleWakeup, "An empty incremental wakeup enumerated the peer Vault");
  } finally {
    await Promise.all([exactService.stop(), roundedService.stop()]);
  }

  const [baselinePortA, baselinePortB] = await Promise.all([freePort(), freePort()]);
  const baselineDeviceA = "FFFFFFFFFFFFFFFFFFFFFFFF";
  const baselineDeviceB = "GGGGGGGGGGGGGGGGGGGGGGGG";
  const baselineFilesA = {};
  const baselineFilesB = {};
  for (let index = 0; index < 3000; index += 1) {
    const path = `Bulk/f-${String(index).padStart(4, "0")}.bin`;
    const content = `same-${String(index).padStart(4, "0")}`;
    baselineFilesA[path] = { content, mtime: 10_000 + index };
    baselineFilesB[path] = { content, mtime: 90_000_000 + index };
  }
  baselineFilesA["Bulk/rounded.bin"] = { content: "rounded", mtime: 123_000 };
  baselineFilesB["Bulk/rounded.bin"] = { content: "rounded", mtime: 124_500 };
  baselineFilesA["Bulk/changed.bin"] = { content: "local-xx", mtime: 200_000 };
  baselineFilesB["Bulk/changed.bin"] = { content: "remote-x", mtime: 300_000 };
  baselineFilesA["Only-A/new.md"] = { content: "from A", mtime: 400_000 };
  baselineFilesB["Only-B/new.md"] = { content: "from B", mtime: 500_000 };
  const baselineStorageA = new MemoryStorage(identity, baselineFilesA);
  const baselineStorageB = new MemoryStorage(identity, baselineFilesB);
  const baselineProgressA = [];
  const baselineProgressB = [];
  const baselineOptionsB = commonOptions(baselineStorageB, baselinePortB, baselineDeviceB, baselineProgressB, {
    autoDiscovery: false,
    checkIntervalSeconds: 60
  });
  const baselineOptionsA = commonOptions(baselineStorageA, baselinePortA, baselineDeviceA, baselineProgressA, {
    autoDiscovery: false,
    manualPeers: [`127.0.0.1:${baselinePortB}`],
    checkIntervalSeconds: 60
  });
  const baselineServiceB = new NtfyLanSync(baselineOptionsB);
  const baselineServiceA = new NtfyLanSync(baselineOptionsA);
  try {
    await baselineServiceB.start();
    await baselineServiceA.start();
    await waitFor(() => baselineServiceA.status().peerCount === 1, "large baseline peer");
    const firstBaselineProgress = baselineProgressA.length;
    baselineServiceA.requestSync({ deep: true });
    await waitFor(
      () => baselineProgressA.slice(firstBaselineProgress).some((value) => value.phase === "complete" && value.total === 3),
      "large Remotely Save baseline",
      30_000
    );
    const firstBaseline = baselineProgressA.slice(firstBaselineProgress).filter((value) => value.phase === "complete").at(-1);
    assert.equal(firstBaseline.total, 3, "Thousands of metadata-only mtime differences entered the transfer plan");
    assert.equal(firstBaseline.uploads, 1, "Large baseline upload count included metadata-equivalent files");
    assert.equal(firstBaseline.downloads, 2, "Large baseline download count included metadata-equivalent files");
    assert.ok(baselineServiceA.activity().scan.hashed > 0, "Ambiguous baseline hashing did not expose independent scan activity");
    assert.equal(baselineProgressA.some((value) => value.phase === "scanning"), false, "Large-vault scanning leaked into transfer progress");
    assert.equal(baselineStorageA.text("Bulk/changed.bin"), "remote-x", "A real same-size content change was not reconciled");
    assert.equal(baselineStorageB.text("Only-A/new.md"), "from A", "A unique local file was not uploaded");
    assert.equal(baselineStorageA.text("Only-B/new.md"), "from B", "A unique remote file was not downloaded");
    assert.equal(baselineStorageA.readCount("Bulk/rounded.bin"), 0, "Small filesystem mtime rounding triggered a content read");
    assert.equal(baselineStorageB.readCount("Bulk/rounded.bin"), 0, "Remote small mtime rounding triggered a content read");
    assert.ok(requestedRoutes.includes("/cancip-lan/v1/metadata/v4/bootstrap/hashes"), "Ambiguous first-baseline metadata was not fingerprinted");
    assert.equal(baselineServiceA.activity().files.length, 3, "The transfer list exposed baseline-only files");

    const beforeIncrementalProgress = baselineProgressA.length;
    baselineOptionsA.runtimeSettings.mode = "delete-push";
    baselineStorageA.putText("Bulk/f-0001.bin", "edit-0001", 100_000_000);
    baselineStorageA.files.delete("Bulk/f-0002.bin");
    baselineStorageA.putText("Only-A/second.md", "second A", 100_000_001);
    baselineServiceA.notifyVaultChange("Bulk/f-0001.bin");
    baselineServiceA.notifyVaultChange("Bulk/f-0002.bin");
    baselineServiceA.notifyVaultChange("Only-A/second.md");
    baselineServiceA.requestSync();
    await waitFor(
      () => baselineStorageB.text("Bulk/f-0001.bin") === "edit-0001"
        && baselineStorageB.text("Bulk/f-0002.bin") === null
        && baselineStorageB.text("Only-A/second.md") === "second A"
        && baselineServiceA.dirtyPaths.size === 0,
      "post-baseline real changes",
      30_000
    ).catch((error) => {
      const completed = baselineProgressA.slice(beforeIncrementalProgress).filter((value) => value.phase === "complete");
      throw new Error(`${error.message}; completions=${JSON.stringify(completed)}`);
    });
    assert.equal(baselineServiceA.dirtyPaths.size, 0, "Post-baseline changes did not drain from the producer queue");
    assert.equal(baselineStorageB.text("Bulk/f-0001.bin"), "edit-0001", "A later same-size edit was not detected");
    assert.equal(baselineStorageB.text("Bulk/f-0002.bin"), null, "A later deletion was not propagated");
    assert.equal(baselineStorageB.text("Only-A/second.md"), "second A", "A later local file was not uploaded");
    baselineOptionsA.runtimeSettings.mode = "bidirectional";
    baselineStorageB.putText("Only-B/second.md", "second B", 100_000_002);
    baselineServiceB.notifyVaultChange("Only-B/second.md");
    await waitFor(() => baselineStorageA.text("Only-B/second.md") === "second B", "A later remote file was not downloaded in bidirectional mode").catch((error) => {
      throw new Error(`${error.message}; state=${JSON.stringify({
        aDirty: baselineServiceA.dirtyPaths.size,
        bDirty: baselineServiceB.dirtyPaths.size,
        aPeers: baselineServiceA.listPeers(),
        bPeers: baselineServiceB.listPeers(),
        aRemoteDirty: [...(baselineServiceA.peers.get(baselineDeviceB)?.remoteDirtyPaths ?? [])],
        aProgress: baselineServiceA.progress(),
        bProgress: baselineServiceB.progress()
      })}`);
    });
    // Adapter safety net: an external write with no Vault event must still be
    // observed by the metadata poll and transferred without a manual scan.
    await waitFor(() => baselineServiceA.changePollInitialized === true, "metadata poll baseline");
    baselineStorageA.putText("Only-A/poll-without-event.md", "poll detected", 100_000_010);
    await baselineServiceA.pollFilesystemChanges();
    await waitFor(
      () => baselineStorageB.text("Only-A/poll-without-event.md") === "poll detected",
      "external write without a Vault event",
      10_000,
      50
    );
    assert.equal([...baselineStorageA.files.keys(), ...baselineStorageB.files.keys()].some((path) => path.includes("LAN conflict")), false, "Baseline reconciliation created a renamed conflict copy");
  } finally {
    await Promise.all([baselineServiceA.stop(), baselineServiceB.stop()]);
  }

  const [desktopPort] = await Promise.all([freePort()]);
  const desktopDevice = "CCCCCCCCCCCCCCCCCCCCCCCC";
  const mobileDevice = "ZZZZZZZZZZZZZZZZZZZZZZZZ";
  const desktopStorage = new MemoryStorage(identity, {});
  const mobileStorage = new MemoryStorage(identity, {
    "Mobile/client-created.md": { content: "from mobile client", mtime: 1200 }
  });
  mobileStorage.putText(`${mobileStorage.identityRoot}/peers/${desktopDevice}.json`, descriptor(desktopDevice, desktopPort));
  const desktopProgress = [];
  const mobileProgress = [];
  const desktopMessages = [];
  const mobileMessages = [];
  const desktopOptions = commonOptions(desktopStorage, desktopPort, desktopDevice, desktopProgress, { autoDiscovery: false });
  desktopOptions.onMessage = (message) => desktopMessages.push(message);
  const desktopService = new NtfyLanSync(desktopOptions);
  // Keep the fixture independent from a real Obsidian instance that may use
  // the default LAN port. The passive mobile service does not bind a server,
  // but its advertised endpoint still needs a valid, non-conflicting port.
  const mobilePort = await freePort();
  const mobileOptions = commonOptions(mobileStorage, mobilePort, mobileDevice, mobileProgress, { autoDiscovery: false });
  mobileOptions.onMessage = (message) => mobileMessages.push(message);
  const mobileService = new NtfyLanSync({
    ...mobileOptions,
    desktop: false
  });
  const mobileSyncSignalPayload = mobileService.syncSignalPayload.bind(mobileService);
  mobileService.syncSignalPayload = () => ({
    ...mobileSyncSignalPayload(),
    capabilities: ["metadata-session-v3", "realtime-wakeup-v1"]
  });
  mobileService.metadataProtocol = (peer) => peer.capabilities.has("metadata-session-v3")
    ? { capability: "metadata-session-v3", routePrefix: "/metadata/v3" }
    : null;
  try {
    await desktopService.start();
    await mobileService.start();
    await waitFor(() => mobileService.status().peerCount === 1, "mobile authenticated desktop endpoint");
    await waitFor(() => desktopService.status().peerCount === 1, "desktop observed authenticated mobile client");
    assert.equal(desktopService.listPeers()[0].compatible, true, "Desktop did not learn the passive mobile peer capability from its inbound ping");
    assert.equal(desktopService.peers.get(mobileDevice).capabilities.has("metadata-session-v3"), true, "Desktop did not accept the mobile v3 compatibility capability");
    assert.equal(desktopService.peers.get(mobileDevice).capabilities.has("metadata-session-v4"), false, "The old-mobile fixture unexpectedly advertised v4");
    // The poll map is populated before the first network await. Waiting only
    // for its size races the request recording and intermittently asserted
    // before the encrypted route had actually been opened.
    await waitFor(
      () => requestedRoutes.includes("/cancip-lan/v1/events/wait"),
      "mobile realtime wakeup route"
    );
    await waitFor(() => desktopStorage.text("Mobile/client-created.md") === "from mobile client", "automatic full-vault sync");
    await waitFor(
      () => !mobileService.syncRunning && !mobileService.activeEditSyncRunning && !mobileService.fullSyncRequested,
      "automatic full-vault sync settlement",
      30_000
    );
    assert.ok(desktopOptions.activityChanges.length > 0, "Passive desktop did not report independent scan activity");
    assert.equal(desktopProgress.some((value) => value.phase === "scanning"), false, "Passive desktop scan overwrote mirrored transfer progress");

    const originalMobileListFiles = mobileStorage.listFiles.bind(mobileStorage);
    let releaseMobileScan;
    let mobileScanEntered;
    const mobileScanGate = new Promise((resolvePromise) => { releaseMobileScan = resolvePromise; });
    const mobileScanStarted = new Promise((resolvePromise) => { mobileScanEntered = resolvePromise; });
    mobileStorage.listFiles = async (...args) => {
      mobileScanEntered();
      await mobileScanGate;
      return await originalMobileListFiles(...args);
    };
    const historyBeforeConcurrentPriority = mobileService.activity().roundHistory.length;
    try {
      mobileService.requestSync({ deep: true, strict: true });
      await Promise.race([
        mobileScanStarted,
        new Promise((_resolve, reject) => setTimeout(() => reject(new Error("Timed out waiting for mobile full scan")), 10_000))
      ]);
      await waitFor(
        () => mobileService.syncRunning && !mobileService.transferSessionActive,
        "mobile full scan waiting for passive desktop manifest"
      );
      const scanBeforeRemoteEdit = mobileService.activity().scan;
      desktopStorage.putText(".obsidian/realtime-priority.json", "priority config", 1250);
      desktopService.notifyVaultChange(".obsidian/realtime-priority.json");
      await waitFor(
        () => mobileStorage.text(".obsidian/realtime-priority.json") === "priority config",
        "passive desktop priority transfer during blocked full scan",
        5_000
      ).catch((error) => {
        throw new Error(`${error.message}; state=${JSON.stringify({
          desktopDirty: [...desktopService.dirtyPaths],
          mobileRemoteDirty: [...(mobileService.peers.get(desktopDevice)?.remoteDirtyPaths ?? [])],
          mobileRemotePriority: [...(mobileService.peers.get(desktopDevice)?.remotePriorityDirtyPaths ?? [])],
          mobileSyncRunning: mobileService.syncRunning,
          mobileActiveEditSyncRunning: mobileService.activeEditSyncRunning,
          mobileActiveEditTimer: Boolean(mobileService.activeEditTimer),
          mobileActiveEditTimerDueAt: mobileService.activeEditTimerDueAt,
          mobileNow: mobileService.now(),
          mobileTransferSessionActive: mobileService.transferSessionActive,
          mobilePriorityPending: mobileService.prioritySyncPending,
          mobileLastError: mobileService.lastErrorValue,
          mobileProgress: mobileService.progress(),
          desktopProgress: desktopService.progress()
        })}`);
      });
      assert.equal(mobileService.activity().roundHistory.length, historyBeforeConcurrentPriority, "A concurrent priority transfer entered history before the full scan finished");
      const scanAfterRemoteEdit = mobileService.activity().scan;
      if (scanBeforeRemoteEdit.id) assert.equal(scanAfterRemoteEdit.id, scanBeforeRemoteEdit.id, "A remote priority edit replaced the active full-scan snapshot");
      if (scanBeforeRemoteEdit.total > 0) assert.equal(scanAfterRemoteEdit.total, scanBeforeRemoteEdit.total, "A remote priority edit reset the full-scan denominator");
    } finally {
      releaseMobileScan();
      mobileStorage.listFiles = originalMobileListFiles;
    }
    await waitFor(
      () => !mobileService.syncRunning
        && !mobileService.activeEditSyncRunning
        && !mobileService.transferSessionActive
        && !mobileService.fullSyncRequested,
      "concurrent full-scan round settlement",
      30_000
    );

    desktopStorage.putText("Desktop/desktop-initiated.md", "started on desktop", 1300);
    const desktopRealtimeStartedAt = Date.now();
    desktopService.notifyVaultChange("Desktop/desktop-initiated.md");
    const beforeDesktopInitiatedProgress = desktopProgress.length;
    await waitFor(
      () => mobileService.peers.get(desktopDevice)?.remoteDirtyPaths.has("Desktop/desktop-initiated.md"),
      "desktop realtime wakeup signal",
      1_000,
      5
    );
    const desktopWakeupLatency = Date.now() - desktopRealtimeStartedAt;
    // The route is event-driven; allow normal Windows scheduler jitter while
    // still rejecting a fallback-to-polling delay.
    assert.ok(desktopWakeupLatency < 1_000, `Realtime desktop-to-mobile wakeup took ${desktopWakeupLatency}ms`);
    await waitFor(() => mobileStorage.text("Desktop/desktop-initiated.md") === "started on desktop", "desktop-initiated LAN synchronization", 10_000, 5).catch((error) => {
      throw new Error(`${error.message}; state=${JSON.stringify({
        desktopDirty: [...desktopService.dirtyPaths],
        mobileDirty: [...mobileService.dirtyPaths],
        mobileRemoteDirty: [...(mobileService.peers.get(desktopDevice)?.remoteDirtyPaths ?? [])],
        desktopProgress: desktopService.progress(),
        mobileProgress: mobileService.progress()
      })}`);
    });
    const desktopRealtimeLatency = Date.now() - desktopRealtimeStartedAt;
    // Keep the check meaningful without making a full Node test run flaky on
    // a busy Windows host; the wakeup assertion above still guards the fast
    // signal path and this assertion guards eventual transfer completion.
    assert.ok(desktopRealtimeLatency < 2_000, `Realtime desktop-to-mobile sync took ${desktopRealtimeLatency}ms`);
    console.log(`Realtime LAN wakeup ${desktopWakeupLatency}ms; one-file sync ${desktopRealtimeLatency}ms`);
    assert.ok(desktopProgress.slice(beforeDesktopInitiatedProgress).some((value) => ["requesting-peer-scan", "enumerating", "planning", "transferring"].includes(value.stage)), "Desktop initiation exposed no active progress");
    mobileStorage.putText("Mobile/mobile-initiated.md", "started on mobile", 1400);
    mobileService.notifyVaultChange("Mobile/mobile-initiated.md");
    const beforeMobileInitiatedProgress = mobileProgress.length;
    mobileService.requestSync();
    await waitFor(() => desktopStorage.text("Mobile/mobile-initiated.md") === "started on mobile", "mobile-initiated LAN synchronization");
    assert.ok(mobileProgress.slice(beforeMobileInitiatedProgress).some((value) => value.phase === "scanning" || value.phase === "syncing" || value.phase === "complete"), "Mobile could not actively initiate a LAN synchronization session");
    const mobileToDesktop = await mobileService.sendMessage(desktopDevice, { text: "mobile to desktop" });
    await waitFor(() => desktopMessages.some((message) => message.id === mobileToDesktop.id), "mobile-to-desktop LAN message");
    const desktopToMobile = await desktopService.sendMessage(mobileDevice, { text: "desktop to mobile" });
    await waitFor(() => mobileMessages.some((message) => message.id === desktopToMobile.id), "desktop-to-mobile queued LAN message");
    const desktopAttachment = await desktopService.sendDeviceFile(mobileDevice, {
      name: "desktop-file.txt",
      type: "text/plain",
      data: arrayBuffer(bytes("desktop attachment"))
    });
    const desktopFileMessage = await desktopService.sendMessage(mobileDevice, { text: "desktop file", attachments: [desktopAttachment] });
    await waitFor(() => mobileMessages.some((message) => message.id === desktopFileMessage.id), "desktop-to-mobile queued LAN file message");
    assert.equal(mobileStorage.text(desktopAttachment.path), "desktop attachment", "Mobile did not pull the queued desktop attachment");
    await waitFor(() => (desktopService.pendingMessages.get(mobileDevice) || []).length === 0, "mobile message acknowledgement");
  } finally {
    await Promise.all([mobileService.stop(), desktopService.stop()]);
  }

  // Test-channel loopback: a lower test build must fetch the higher build
  // through the authenticated LAN routes, verify every bundle hash, invoke
  // the installer callback, and still be able to exchange debug events.
  const testPortA = await freePort();
  const testPortB = await freePort();
  const testStorageA = new MemoryStorage(identity);
  const testStorageB = new MemoryStorage(identity);
  const sha256Base64Url = (data) => createHash("sha256").update(data).digest("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  const testBuildFiles = (version, suffix) => {
    const source = {
      "main.js": bytes(`console.log("${suffix}");`),
      "manifest.json": bytes(JSON.stringify({ id: "android-ntfy-notifier", version })),
      "styles.css": bytes(`.test-${suffix} { display: block; }`)
    };
    const descriptors = Object.entries(source).map(([name, data]) => ({
      name,
      size: data.byteLength,
      hash: sha256Base64Url(data)
    }));
    return {
      build: {
        version,
        buildId: sha256Base64Url(`${version}:${suffix}`),
        createdAt: new Date().toISOString(),
        files: descriptors
      },
      source
    };
  };
  const oldTestBuild = testBuildFiles("1.0.92-test.2", "old");
  const newTestBuild = testBuildFiles("1.0.92-test.3", "new");
  const installedTestBuilds = [];
  const receivedTestDebug = [];
  const testOptionsA = commonOptions(testStorageA, testPortA, "TEST_AAAAAAAAAAAAAAAAA", [], {
    autoDiscovery: false,
    manualPeers: [`127.0.0.1:${testPortB}`],
    testMode: true,
    testAutoUpdate: true,
    testDebug: true
  });
  Object.assign(testOptionsA, {
    getTestBuild: async () => oldTestBuild.build,
    readTestBuildFile: async (name) => arrayBuffer(oldTestBuild.source[name]),
    installTestBuild: async (build, files) => installedTestBuilds.push({ build, files })
  });
  const testOptionsB = commonOptions(testStorageB, testPortB, "TEST_BBBBBBBBBBBBBBBBB", [], {
    autoDiscovery: false,
    manualPeers: [`127.0.0.1:${testPortA}`],
    testMode: true,
    testAutoUpdate: true,
    testDebug: true
  });
  Object.assign(testOptionsB, {
    getTestBuild: async () => newTestBuild.build,
    readTestBuildFile: async (name) => arrayBuffer(newTestBuild.source[name]),
    onTestDebug: async (event) => receivedTestDebug.push(event)
  });
  const testServiceA = new NtfyLanSync(testOptionsA);
  const testServiceB = new NtfyLanSync(testOptionsB);
  try {
    await Promise.all([testServiceA.start(), testServiceB.start()]);
    await waitFor(() => testServiceA.status().peerCount === 1 && testServiceB.status().peerCount === 1, "test peers authenticated");
    await waitFor(
      () => installedTestBuilds.length === 1 || testServiceA.status().error.startsWith("test_update:"),
      "automatic test build installation"
    );
    if (installedTestBuilds.length !== 1) {
      const peer = testServiceA.peers.get("TEST_BBBBBBBBBBBBBBBBB");
      throw new Error(`automatic test build update failed: ${testServiceA.status().error}; capabilities=${JSON.stringify(peer ? [...peer.capabilities] : [])}; remoteBuild=${JSON.stringify(peer?.testBuild)}`);
    }
    assert.equal(installedTestBuilds[0].build.version, newTestBuild.build.version, "Lower test build did not install the higher build");
    for (const descriptor of newTestBuild.build.files) {
      const received = installedTestBuilds[0].files[descriptor.name];
      assert.ok(received instanceof ArrayBuffer, `Missing received test bundle file ${descriptor.name}`);
      assert.equal(received.byteLength, descriptor.size, `Test bundle file size mismatch for ${descriptor.name}`);
    }
    await testServiceA.sendTestDebug({ type: "loopback", value: "ok" });
    await waitFor(() => receivedTestDebug.some((event) => event.type === "loopback" && event.value === "ok"), "test debug event delivery");
  } finally {
    await Promise.all([testServiceA.stop(), testServiceB.stop()]);
  }

  const source = await readFile(join(root, "main.js"), "utf8");
  const lanSource = await readFile(join(root, "src", "lanSync.ts"), "utf8");
  const stylesSource = await readFile(join(root, "styles.css"), "utf8");
  const takeoverStart = source.indexOf("remotelySaveStatusBarElement()");
  const takeoverSource = source.slice(takeoverStart, source.indexOf("\n  normalizeChannelHealth(", takeoverStart));
  const statusTextStart = source.indexOf("lanSyncStatusText()");
  const statusTextSource = source.slice(statusTextStart, source.indexOf("\n  lanSyncActivitySnapshot(", statusTextStart));
  assert.match(statusTextSource, /return `\$\{syncCompleted\}\/\$\{syncTotal\}`;/, "LAN status should show completed/needed sync counts beside the Wi-Fi icon");
  assert.doesNotMatch(statusTextSource, /scanCompleted|scanTotal/, "LAN status should leave scan inspection counts in the details panel");
  assert.doesNotMatch(statusTextSource, /progress\.completed.*percent|·.*%/, "LAN progress should not append a percentage or LAN label");
  assert.doesNotMatch(statusTextSource, /LAN (?:connected|scanning|syncing|synced|unavailable)|局域网|已连接|扫描中|同步中|已同步|暂不可用/, "LAN status text should not show visible words");
  assert.match(statusTextSource, /return "";/, "Non-transfer LAN status should leave the visible text empty");
  assert.match(source, /setIcon\(icon, "wifi"\)/, "Connected LAN status should keep the Wi-Fi icon");
  assert.match(source, /registerDomEvent\(item, "click", \(\) => this\.openLanSyncDetails\(\)\)/, "LAN status item should open live details on click");
  assert.match(source, /class NtfyLanSyncDetailsModal extends Modal/, "LAN sync details modal is missing");
  assert.match(source, /this\.sectionState = \{ history: false, scan: false, transfer: false \}/, "LAN history/check/sync sections should be collapsed by default");
  assert.doesNotMatch(source, /historyRoundState|row\.open = this\.historyRoundState/, "LAN history rounds should not hide their details behind nested disclosure controls");
  assert.match(source, /this\.sectionState\.history = details\.open/, "LAN history section does not preserve its expanded state during live refresh");
  assert.match(source, /obsidian-ntfy-lan-round-history-heading/, "LAN history entries do not expose a stable always-visible heading");
  assert.match(source, /本机已检查.*对端已检查/s, "LAN history details do not use check-style progress");
  assert.match(source, /已同步.*上传.*下载/s, "LAN history details do not use transfer-style progress");
  assert.match(stylesSource, /\.obsidian-ntfy-lan-details-summary \{[\s\S]*?align-items: start;[\s\S]*?min-height: 0;/, "Current LAN status does not reserve enough height for multiline progress");
  assert.match(stylesSource, /\.obsidian-ntfy-lan-current-status \{[\s\S]*?display: flow-root;[\s\S]*?flex: 0 0 auto;[\s\S]*?padding-bottom: 16px;/, "Current LAN status has no independent flow boundary");
  assert.match(stylesSource, /\.obsidian-ntfy-lan-round-history \{[\s\S]*?flex: 0 0 auto;[\s\S]*?margin-top: 8px;[\s\S]*?position: relative;/, "LAN history has no stable gap after the isolated current status box");
  assert.match(stylesSource, /\.obsidian-ntfy-lan-round-history-heading \{[\s\S]*?display: flex;[\s\S]*?flex-wrap: wrap;/, "LAN history headings cannot wrap without overlap");
  assert.match(stylesSource, /@media \(max-width: 520px\) \{[\s\S]*?\.obsidian-ntfy-lan-details-progress-stats \{[\s\S]*?flex-direction: column;/, "LAN history progress text cannot wrap into stable mobile rows");
  assert.match(source, /renderScanSection\(body, scan, remote, scanGroups, chinese, progress, effectiveStage, stageDescriptions\)/, "LAN scan section is missing local/peer stage context");
  assert.match(source, /renderTransferSection\(body, progress, files, transferGroups, chinese, effectiveStage, stageDescriptions\)/, "LAN transfer section is missing stage context");
   assert.match(source, /"requesting-peer-scan": "正在交换变化清单"/, "LAN details do not show changed-path exchange");
   assert.match(source, /"waiting-peer-scan": "等待新的变化文件"/, "LAN details do not explain the idle incremental wait stage");
   assert.doesNotMatch(source, /电脑和手机都可主动发起|Both devices may initiate/, "LAN details still show non-actionable initiator text");
  assert.match(source, /"peer-upgrade-required": "对端插件需要升级"/, "LAN details do not explain an incompatible peer");
  assert.match(source, /正在核对内容指纹/, "LAN details do not expose first-baseline fingerprinting");
  assert.match(source, /"packaging-manifest": "正在封装并发送清单"/, "LAN details hide manifest packaging after a completed scan");
  assert.match(source, /"waiting-plan": "清单已发送，等待同步计划"/, "LAN details hide the post-manifest plan wait");
  assert.match(source, /本机已检查/, "LAN details do not identify the local check counter");
  assert.match(source, /对端已检查/, "LAN details do not expose peer check progress");
  assert.match(source, /const idleLabel = chinese/, "An idle scan does not derive a meaningful stage label");
  assert.match(source, /同步：发现文件即开始/, "The transfer section does not explain that discovered files start immediately");
  assert.match(lanSource, /INCREMENTAL_PATH_BATCH_SIZE = Number\.MAX_SAFE_INTEGER/, "Dirty journal must not stop at an arbitrary 32-path limit");
  assert.match(lanSource, /this\.scheduleActiveEditSync\(REALTIME_DIRTY_DELAY_MS\)/, "Vault events do not enter the immediate transfer lane");
  assert.match(lanSource, /const RECONNECT_REPROBE_DELAY_MS = 250/, "LAN reconnect does not have a fast reprobe path");
  assert.match(lanSource, /this\.scheduleReconnectProbe\(\)/, "LAN peer failures do not schedule immediate reconnect probing");
  assert.match(lanSource, /deletePush: settings\.mode === "bidirectional" \|\| settings\.mode === "delete-push"/, "Default bidirectional mode does not push deletions");
  assert.match(lanSource, /deletePull: settings\.mode === "bidirectional" \|\| settings\.mode === "delete-pull"/, "Default bidirectional mode does not pull deletions");
  assert.match(lanSource, /remoteRequestedSync \|\| \(peer\.remoteDirtyPaths\?\.size \?\? 0\) > 0/, "Inbound mobile dirty signals do not immediately schedule synchronization");
  assert.doesNotMatch(source, /const label = `\$\{chinese \? "扫描" : "Scan"\} \$\{scan\.completed \|\| 0\}\/\$\{scan\.total \|\| 0\}`/, "LAN details still render an unexplained scan 0/0");
  assert.match(source, /上传/, "LAN transfer details do not label uploads");
  assert.match(source, /下载/, "LAN transfer details do not label downloads");
  assert.match(source, /progress\.uploadCompleted[^\n]*progress\.uploads/, "LAN details do not show completed/total uploads");
  assert.match(source, /progress\.downloadCompleted[^\n]*progress\.downloads/, "LAN details do not show completed/total downloads");
  assert.match(source, /已检查 \$\{scan\.completed \|\| 0\} \/ 本轮总检查 \$\{scan\.total \|\| 0\}/, "LAN details do not show local checked/round-total progress");
  assert.match(source, /已同步 \$\{roundCompleted\}\/\$\{roundTotal\}/, "LAN details do not show round sync progress");
  assert.match(source, /animationDelay = `-\$\{Date\.now\(\) % 700\}/, "LAN spinner phase is reset on every live panel refresh");
   assert.match(source, /title: chinese \? "立即扫描并同步全库" : "Scan and synchronize the whole vault now"/, "LAN details do not identify the manual button as a full-vault sync");
   assert.match(source, /this\.lanSync\?\.requestSync\(\{ deep: true \}\)/, "Manual sync button must start a full-vault producer round");
  assert.match(lanSource, /syncCandidatesTotal/, "Full-vault scan does not expose the discovered sync-candidate counter");
  assert.match(lanSource, /syncRoundCompleted/, "Transfer progress is missing the monotonic round completion counter");
  assert.match(lanSource, /queueScanCandidate\(file\.path\)/, "Filesystem producer does not queue changed files as soon as they are discovered");
  assert.match(source, /发现待同步/, "LAN details do not show discovered-vs-completed counters");
   assert.doesNotMatch(lanSource, /MAX_DIRTY_PATHS|4096/, "LAN runtime still contains the obsolete fixed dirty-path ceiling");
    assert.match(lanSource, /fullSyncOnlyPending/, "Manual full scan state is missing");
    assert.doesNotMatch(lanSource, /if \(this\.fullSyncOnlyPending && this\.backgroundReconciliation\) return;/, "A manual full scan still blocks incremental transfer during enumeration");
   assert.doesNotMatch(lanSource, /if \(this\.fullSyncOnlyPending && \(this\.backgroundReconciliation \|\| this\.metadataManifestBuild\)\) return;/, "A completed shared manifest can still strand a manual sync before plan calculation");
   assert.match(lanSource, /const \[localEntries, remoteResponse, ledger\] = await Promise\.all/, "Full-vault scans are not started concurrently on both devices");
   assert.doesNotMatch(lanSource, /if \(this\.fullSyncOnlyPending\) \{[\s\S]{0,900}await this\.buildMetadataManifest/, "The coordinator still finishes its full scan before asking the peer to scan");
  assert.match(source, /this\.sectionState = \{ history: false, scan: false, transfer: false \}/, "LAN history and activity file lists should be collapsed by default");
  assert.match(source, /includeScanFiles: this\.sectionState\.scan && expandedScanGroups\.length > 0/, "Collapsed scan groups should not materialize hidden file rows");
  assert.match(source, /includeTransferFiles: this\.sectionState\.transfer && expandedTransferGroups\.length > 0/, "Collapsed transfer groups should not materialize hidden file rows");
  assert.match(source, /renderActivityGroups\(panel, groups, scanFiles, "scan", chinese\)/, "Scan files are not grouped by top-level folder");
  assert.match(source, /renderActivityGroups\(panel, groups, Array\.isArray\(files\) \? files : \[\], "transfer", chinese\)/, "Transfer files are not grouped by top-level folder");
  assert.match(source, /obsidian-ntfy-lan-stage-progress/, "LAN details should expose stage progress before file totals exist");
  assert.match(source, /createEl\("progress"/, "LAN details should expose progress bars");
  assert.match(source, /this\.app\.vault\.on\("create"/, "New Vault files should trigger LAN sync");
  assert.match(source, /attachment\/write/, "LAN attachments should use the temporary inbox route");
  assert.match(source, /saveConversationAttachment/, "Received attachments should be saveable into the Vault");
  assert.match(source, /getLeaf\("tab"\)\.openFile\(target, \{ active: true \}\)/, "LAN Markdown activity should open the note in Obsidian");
  assert.match(source, /lanSyncDetailsModal\?\.refresh\(\)/, "LAN details should refresh with transfer progress");
  assert.match(source, /const currentStatus = body\.createDiv\(\{ cls: "obsidian-ntfy-lan-current-status" \}\);[\s\S]{0,120}currentStatus\.createDiv/, "The live LAN status is not isolated from history layout");
  assert.match(stylesSource, /\.obsidian-ntfy-lan-current-status\s*\{[\s\S]{0,220}display: flow-root;[\s\S]{0,220}padding-bottom: 16px;/, "The live LAN status has no intrinsic layout boundary");
  for (const mode of ["bidirectional", "incremental-push", "incremental-pull", "delete-push", "delete-pull"]) {
    assert.match(source, new RegExp(`(?:\\"|^)${mode.replace("-", "\\-")}(?:\\"|$)`), `LAN settings are missing mode ${mode}`);
  }
  assert.match(source, /lanSyncMaxFileMb[^\n]*512/, "LAN settings should allow selecting files larger than 100 MB");
  assert.match(source, /lanSyncCheckIntervalSeconds[^\n]*60/, "LAN durable-journal check default should be 60 seconds");
  assert.match(source, /lanSyncSyncConfigFolder[^\n]*true/, "LAN config-folder sync should default to enabled");
  assert.match(source, /lanSyncConflictRule/, "LAN conflict rule setting is missing");
  assert.doesNotMatch(lanSource, /buildLanConflictPath\s*\(/, "LAN sync still contains a conflict-copy path generator");
  assert.doesNotMatch(lanSource, /action\.kind === "conflict"/, "LAN sync still contains a conflict-copy executor");
  assert.match(lanSource, /peer_upgrade_required/, "Outdated LAN peers are not isolated from the original-path protocol");
  assert.match(lanSource, /capability: "metadata-session-v4", routePrefix: "\/metadata\/v4"/, "The preferred metadata protocol is missing");
  assert.match(lanSource, /capability: "metadata-session-v3", routePrefix: "\/metadata\/v3"/, "Rolling-upgrade metadata compatibility is missing");
  assert.match(lanSource, /REALTIME_WAKEUP_CAPABILITY = "realtime-wakeup-v1"/, "The realtime wakeup capability is missing");
  assert.match(lanSource, /TEST_UPDATE_CAPABILITY = "test-update-v1"/, "The encrypted test update capability is missing");
  assert.match(lanSource, /TEST_DEBUG_CAPABILITY = "test-debug-v1"/, "The encrypted test debug capability is missing");
  assert.match(lanSource, /test\/update\/manifest/, "The test build manifest route is missing");
  assert.match(lanSource, /test\/update\/file/, "The test build file route is missing");
  assert.match(lanSource, /TEST_BUILD_FILE_NAMES = \["main\.js", "manifest\.json", "styles\.css"\]/, "Test updates are not restricted to the plugin bundle files");
  assert.match(lanSource, /\.\.\.METADATA_PROTOCOLS\.map\(\(protocol\) => protocol\.capability\)[\s\S]{0,120}REALTIME_WAKEUP_CAPABILITY/, "Peers do not advertise metadata and realtime capabilities together");
  assert.match(lanSource, /path === `\$\{API_PREFIX\}\/events\/wait`/, "The encrypted realtime wait route is missing");
  assert.match(lanSource, /this\.wakeRealtimeSignalWaiters\(\);[\s\S]{0,180}this\.announce\(\)/, "Vault events do not wake waiting mobile peers before the compatibility announcement");
  assert.doesNotMatch(lanSource, /path\.startsWith\(`\$\{API_PREFIX\}\/metadata\/v3\/`\)/, "The server still blocks the v3 rolling-upgrade route");
  assert.match(lanSource, /const SMALL_TRANSFER_CONCURRENCY = 12/, "Small-file LAN transfers are not using the fast bounded worker pool");
  assert.match(lanSource, /function yieldToLanEventLoop\(\)/, "Full-vault enumeration does not yield to UI and heartbeat updates");
  assert.match(lanSource, /mapWithConcurrency\(candidates, HASH_CONCURRENCY/, "Large scans are not processed concurrently");
  assert.match(lanSource, /if \(!this\.runningValue \|\| this\.syncRunning \|\| this\.inboundSession \|\| this\.metadataManifestBuild \|\| this\.manifestBuild\) return;/, "Periodic full scans can still interrupt an active transfer or manifest enumeration");
  assert.match(lanSource, /private isPeriodicInitiator\(peers = this\.activePeers\(\)\)/, "Periodic synchronization is still permanently assigned to one device role");
  assert.match(lanSource, /BACKGROUND_FULL_RESCAN_INTERVAL_MS = 24 \* 60 \* 60_000/, "Converged Vaults can still run frequent background full scans");
  assert.match(lanSource, /ntfy\.lan-sync\.change-journal\.v1\./, "Dirty paths are not stored in a durable journal");
  assert.match(lanSource, /captureChangesSinceCheckpoint\(\)/, "Plugin reload does not catch up from the last successful checkpoint");
  assert.match(lanSource, /this\.recordSyncCheckpoint\(\)/, "Successful synchronization does not record a checkpoint");
  assert.match(lanSource, /metadata-index-v1\.json/, "The last complete metadata manifest is not persisted");
  assert.match(lanSource, /buildMetadataManifestFromIndex\(/, "Peer full requests cannot reuse the persistent metadata index");
  assert.match(lanSource, /this\.replaceMetadataIndex\(entries, includeConfigFolder\)/, "A completed filesystem reconciliation does not refresh the metadata index");
  assert.match(source, /this\.app\.vault\.on\("raw"/, "Hidden configuration changes are not added to the path journal");
  assert.match(source, /listFilesChangedSince: async \(since, includeConfigFolder\)/, "Startup catch-up does not expose configuration-folder recovery");
  assert.match(source, /const configFiles = await listNtfyLanConfigFiles\(adapter, configDir, identityRoot\);[\s\S]{0,300}file\.mtime >= since/, "Startup catch-up still omits configuration files changed while the plugin was stopped");
  assert.match(source, /while \(pending\.length\)/, "Configuration enumeration no longer walks every pending folder");
  assert.doesNotMatch(source, /pending\.length && paths\.length < 25_000|paths\.length >= 25_000/, "Configuration enumeration still truncates the Vault at 25,000 files");
  assert.match(lanSource, /this\.buildManifest\(true\),\s*this\.callPeer\(peer, "\/manifest", \{ syncConfigFolder: true \}\)/, "Rolling-upgrade manifest compatibility can still omit configuration files");
  assert.match(lanSource, /this\.metadataManifestBuild \|\| this\.manifestBuild/, "Periodic calibration can still overlap manifest enumeration");
  assert.match(lanSource, /safeErrorCode\(error\) === "precondition_failed"/, "One changing file can still abort the entire transfer batch");
  assert.match(lanSource, /written\.size !== bytes\.byteLength\) throw new LanSyncProtocolError\("precondition_failed", 409\)/, "A receiver-side write race can still abort the entire batch");
  assert.match(lanSource, /retryPaths: \[\.\.\.retryPaths\]/, "Deferred paths are not mirrored to the peer retry queue");
  assert.match(lanSource, /onActivityChanged\?\.\(\)/, "Scan activity is not reported on its independent channel");
  assert.doesNotMatch(lanSource, /defaultProgress\("scanning"\)/, "Scanning still writes into the transfer progress state");
  assert.match(lanSource, /sync_session_busy/, "A second transfer session can still overwrite an active session");
  assert.match(lanSource, /scanRequestIds/, "Full-vault scan requests are not deduplicated across peers");
  assert.match(lanSource, /classifyAppliedMutationEvent\(normalized\)/, "LAN-applied writes can still echo back into the dirty journal");
  assert.match(takeoverSource, /plugins\?\.\["remotely-save"\]\?\.statusBarElement/);
  assert.doesNotMatch(takeoverSource, /isSyncing|currSyncMsg|syncEvent|remotelySave\.settings|candidate\.settings|start-sync/);
  assert.doesNotMatch(takeoverSource, /plugins\/remotely-save|plugins\\remotely-save/);

  console.log("PASS Ntfy encrypted full-vault LAN sync, original-path convergence, direction progress, replay defense, and Remotely Save isolation checks");
} finally {
  await rm(temp, { recursive: true, force: true });
}
