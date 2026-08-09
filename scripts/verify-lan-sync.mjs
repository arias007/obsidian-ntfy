import assert from "node:assert/strict";
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
    return [...this.files.entries()]
      .filter(([path]) => includeConfigFolder || !path.startsWith(".obsidian/"))
      .map(([path, entry]) => ({ path, size: entry.data.byteLength, mtime: entry.mtime }));
  }

  async statFile(path) {
    const entry = this.files.get(path);
    return entry ? { path, size: entry.data.byteLength, mtime: entry.mtime } : null;
  }

  async readBinary(path) {
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

async function waitFor(predicate, label, timeoutMs = 12_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await predicate()) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 80));
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
    normalizeManualLanPeer,
    planLanSyncMetadataReconciliation,
    planLanSyncReconciliation,
    verifyLanSyncRequest
  } = require(bundle);

  assert.equal(normalizeLanSyncPath("Notes/Safe.md"), "Notes/Safe.md");
  for (const unsafe of ["../secret", "/absolute", "C:/drive", ".obsidian/plugins/x", ".trash/a", "folder\\file", "a//b", "a/./b", "a/../b"]) {
    assert.equal(normalizeLanSyncPath(unsafe), null, `Unsafe path accepted: ${unsafe}`);
  }
  const configPathOptions = {
    syncConfigFolder: true,
    configDir: ".obsidian",
    identityRoot: ".obsidian/plugins/android-ntfy-notifier/lan-sync"
  };
  assert.equal(normalizeLanSyncPath(".obsidian/hotkeys.json", configPathOptions), ".obsidian/hotkeys.json");
  assert.equal(normalizeLanSyncPath(".obsidian/plugins/example/data.json", configPathOptions), ".obsidian/plugins/example/data.json");
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
  assert.equal(normalizeLanSyncPath(".obsidian/hotkeys.json"), null, "Config path was enabled without the setting");
  for (const address of ["127.0.0.1", "10.0.0.2", "172.20.1.2", "192.168.1.8", "169.254.2.3"]) assert.equal(isPrivateLanAddress(address), true);
  for (const address of ["8.8.8.8", "1.1.1.1", "example.com"]) assert.equal(isPrivateLanAddress(address), false);
  assert.equal(classifyLanLinkType("Wi-Fi"), "wifi");
  assert.equal(classifyLanLinkType("Bluetooth Network Connection"), "bluetooth-pan");
  assert.equal(classifyLanLinkType("Remote NDIS Compatible Device"), "usb");
  assert.equal(classifyLanLinkType("Local Area Connection* 10"), "hotspot");
  assert.equal(ipv4BroadcastAddress("192.168.137.1", "255.255.255.0"), "192.168.137.255");
  assert.deepEqual(normalizeManualLanPeer("192.168.137.2:43190"), { address: "192.168.137.2", port: 43190 });
  assert.deepEqual(normalizeManualLanPeer("10.0.0.5"), { address: "10.0.0.5", port: 43190 });
  for (const unsafePeer of ["example.com:43190", "8.8.8.8:43190", "https://192.168.1.2:43190", "192.168.1.2:80/path", "192.168.1.2:80", "192.168.1.2:65528"]) {
    assert.equal(normalizeManualLanPeer(unsafePeer), null, `Unsafe manual peer accepted: ${unsafePeer}`);
  }

  const secret = "s".repeat(43);
  const encrypted = await encryptLanSyncPayload(secret, { text: "private note", count: 2 });
  assert.deepEqual(await decryptLanSyncPayload(secret, encrypted), { text: "private note", count: 2 });
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
  assert.deepEqual(planLanSyncReconciliation([local], [], { "Note.md": local.hash }), [], "Deletion was resurrected");
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
  assert.equal(planLanSyncMetadataReconciliation([{ ...localMetadata, mtime: 300 }], [localMetadata], { "Note.md": metadataBaseline })[0].kind, "push");
  assert.equal(planLanSyncMetadataReconciliation([localMetadata], [remoteMetadata], {})[0].kind, "pull");
  assert.deepEqual(planLanSyncMetadataReconciliation([localMetadata], [], { "Note.md": metadataBaseline }), [], "Metadata deletion was resurrected");
  assert.equal(planLanSyncMetadataReconciliation([], [localMetadata], { "Note.md": metadataBaseline }, deletePushPolicy, passivePolicy)[0].kind, "delete-remote");
  assert.equal(planLanSyncMetadataReconciliation([localMetadata], [], { "Note.md": metadataBaseline }, deletePullPolicy, passivePolicy)[0].kind, "delete-local");
  assert.deepEqual(
    planLanSyncMetadataReconciliation([{ ...localMetadata, mtime: 300 }], [], { "Note.md": metadataBaseline }, deletePullPolicy, passivePolicy),
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
    "Notes/shared.md": { content: "older A", mtime: 200 },
    "Notes/identical.md": { content: "same", mtime: 150 },
    ".obsidian/hotkeys.json": { content: "hotkeys from A", mtime: 500 },
    ".obsidian/plugins/example/data.json": { content: "other plugin data from A", mtime: 550 },
    ".obsidian/plugins/remotely-save/data.json": { content: "protected fixture", mtime: 600 }
  });
  const storageB = new MemoryStorage(identity, {
    "Notes/from-b.md": { content: "from B", mtime: 300 },
    "Notes/shared.md": { content: "newer B", mtime: 400 },
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
    return {
      desktop: true,
      getSettings: () => runtimeSettings,
      storage,
      httpRequest,
      onProgress: (value) => progress.push(value),
      localStore: memoryLocalStore(deviceId),
      runtimeSettings
    };
  };
  let stabilityClock = 1_000;
  let stabilityPeerEvents = 0;
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
    onProgress: () => undefined,
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
    policy: { incrementalPush: false, incrementalPull: false, deletePush: false, deletePull: false, syncConfigFolder: false, deleteProtocol: true }
  };
  stabilityService.peers.set(stabilityPeer.deviceId, stabilityPeer);
  stabilityClock = 8_000;
  assert.equal(stabilityService.listPeers().length, 1, "A short probe failure should not hide an authenticated peer");
  stabilityService.emitPeersChanged();
  stabilityPeer.lastSeenAt = stabilityClock + 1_000;
  stabilityClock += 1_000;
  stabilityService.emitPeersChanged();
  assert.equal(stabilityPeerEvents, 1, "Heartbeat timestamps should not rebuild the chat contact list");
  stabilityPeer.consecutiveFailures = 3;
  stabilityClock = 31_500;
  assert.equal(stabilityService.listPeers().length, 0, "A peer should leave the list only after the stable grace window");
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
    assert.equal(serviceA.peers.get(deviceB).capabilities.has("metadata-session-v2"), true, "Authenticated ping did not negotiate metadata sync");
    serviceA.requestSync();
    await waitFor(() => storageA.text("Notes/from-b.md") === "from B" && storageB.text("Notes/from-a.md") === "from A", "automatic bidirectional LAN transfer");
    await waitFor(() => storageA.text("Notes/shared.md") === "newer B" && storageB.text("Notes/shared.md") === "newer B", "original-path convergence");
    assert.equal([...storageA.files.keys(), ...storageB.files.keys()].some((path) => path.includes("LAN conflict")), false, "LAN sync created a renamed conflict copy");
    assert.equal(storageA.readCount("Notes/identical.md"), 0, "Metadata sync read identical local content on its first scan");
    assert.equal(storageB.readCount("Notes/identical.md"), 0, "Metadata sync read identical remote content on its first scan");
    assert.equal((await storageA.statFile("Notes/from-b.md")).mtime, 300, "Pulled file did not preserve the source mtime");
    assert.equal((await storageB.statFile("Notes/from-a.md")).mtime, 100, "Pushed file did not preserve the source mtime");
    assert.ok(progressA.some((value) => value.phase === "syncing" && value.active));
    assert.ok(progressA.some((value) => value.phase === "scanning" && value.total > 0 && value.completed > 0), "LAN scan progress did not expose the full local manifest");
    let previousScanCompleted = -1;
    let previousScanTotal = 0;
    for (const value of progressA.filter((candidate) => candidate.phase === "scanning" && candidate.total > 0)) {
      if (value.total !== previousScanTotal) previousScanCompleted = -1;
      assert.ok(value.completed >= previousScanCompleted, "LAN scan progress regressed within one scan");
      previousScanCompleted = value.completed;
      previousScanTotal = value.total;
    }
    await waitFor(() => progressA.some((value) => value.phase === "complete" && value.uploads > 0 && value.downloads > 0), "bidirectional completion progress");
    assert.ok(progressA.some((value) => value.phase === "complete" && value.conflicts === 0 && value.uploads > 0 && value.downloads > 0), "Completion progress did not expose upload/download directions");
    assert.ok(progressB.some((value) => value.active), "Receiving peer did not expose LAN status");
    const activityA = serviceA.activity();
    assert.ok(activityA.scan.total > 0, "Full-vault scan snapshot did not expose total files");
    assert.equal(activityA.scan.completed, activityA.scan.total, "Full-vault scan did not finish monotonically");
    assert.ok(activityA.scan.files.some((file) => file.state === "cached" || file.state === "complete"), "Scan file states were not retained");
    assert.ok(activityA.files.some((file) => file.path === "Notes/from-a.md" && file.state === "complete"), "Coordinator did not retain completed file activity");
    assert.ok(activityA.files.some((file) => file.path === "Notes/shared.md" && file.action === "pull"), "Latest remote file was not shown as a download");
    const collapsedActivityA = serviceA.activity({ includeScanFiles: false, includeTransferFiles: false });
    assert.equal(collapsedActivityA.scan.total, activityA.scan.total, "Collapsed scan lost its summary");
    assert.deepEqual(collapsedActivityA.scan.files, [], "Collapsed scan still cloned file rows");
    assert.deepEqual(collapsedActivityA.files, [], "Collapsed transfer section still cloned file rows");
    assert.equal(storageA.readCount("Notes/from-b.md"), 0, "A verified remote write was read back only to hash it again");
    const readsBeforeCachedScan = storageA.totalReads();
    const completedScanId = activityA.scan.id;
    serviceA.requestSync();
    await waitFor(() => {
      const scan = serviceA.activity({ includeScanFiles: false, includeTransferFiles: false }).scan;
      return scan.id !== completedScanId && scan.phase === "complete";
    }, "cached follow-up full-vault scan");
    assert.equal(storageA.totalReads(), readsBeforeCachedScan, "An unchanged follow-up scan reread file contents instead of using metadata/hash cache");
    assert.ok(requestedRoutes.includes("/cancip-lan/v1/manifest/metadata"), "New peers did not use the metadata manifest route");
    assert.ok(serviceB.loadMetadataLedger(deviceA).entries["Notes/identical.md"], "Receiving peer did not persist the reverse metadata ledger");

    const negotiatedPeer = serviceA.peers.get(deviceB);
    negotiatedPeer.capabilities.clear();
    requestedRoutes.length = 0;
    const beforeLegacyAttempt = new Map([...storageA.files].map(([path, value]) => [path, { data: new Uint8Array(value.data), mtime: value.mtime }]));
    await assert.rejects(() => serviceA.syncPeer(negotiatedPeer), /peer_upgrade_required/);
    assert.deepEqual(requestedRoutes, [], "An outdated peer initiated legacy synchronization requests");
    assert.deepEqual(storageA.files, beforeLegacyAttempt, "Rejecting an outdated peer changed local files");
    await assert.rejects(() => serviceA.callPeer(negotiatedPeer, "/manifest", {}), /peer_upgrade_required/);
    assert.ok(requestedRoutes.includes("/cancip-lan/v1/manifest"), "The server-side legacy route rejection was not exercised");
    negotiatedPeer.capabilities.add("metadata-session-v2");

    storageA.putText("Notes/identical.md", "changed on A", 700);
    const incrementalRouteStart = requestedRoutes.length;
    const incrementalProgressA = progressA.length;
    const incrementalProgressB = progressB.length;
    serviceA.notifyVaultChange("Notes/identical.md");
    await waitFor(() => storageB.text("Notes/identical.md") === "changed on A", "metadata push after a local edit");
    assert.equal((await storageB.statFile("Notes/identical.md")).mtime, 700, "Metadata push lost the source mtime");
    assert.ok(requestedRoutes.slice(incrementalRouteStart).includes("/cancip-lan/v1/manifest/metadata/paths"), "A file event still requested a full-vault manifest");
    assert.ok(serviceA.activity().scan.total <= 1, "A single file event scanned more than its dirty path");
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
    assert.equal(storageB.text(".obsidian/hotkeys.json"), null, "Config folder synced while disabled");

    optionsA.runtimeSettings.syncConfigFolder = true;
    serviceA.requestSync();
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
    assert.equal(storageB.text(".obsidian/hotkeys.json"), null, "Config folder synced before both peers enabled it");
    optionsB.runtimeSettings.syncConfigFolder = true;
    serviceA.requestSync();
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
    const progressBeforeSteadyScan = exactProgress.length;
    exactService.requestSync();
    await waitFor(() => exactProgress.slice(progressBeforeSteadyScan).some((value) => value.phase === "complete"), "steady-state full-vault calibration");
    const steady = exactProgress.slice(progressBeforeSteadyScan).filter((value) => value.phase === "complete").at(-1);
    assert.equal(steady.total, 0, "A just-synchronized Android-like Vault scheduled files again");
    assert.equal(steady.bytesTotal, 0, "A just-synchronized Android-like Vault scheduled bytes again");
    assert.equal(roundedStorage.totalWrites(), writesBeforeSteadyScan, "Steady-state calibration rewrote an unchanged file");
    assert.equal(exactStorage.totalReads() + roundedStorage.totalReads(), readsBeforeSteadyScan, "Steady-state calibration reread unchanged file content");
  } finally {
    await Promise.all([exactService.stop(), roundedService.stop()]);
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
  const desktopOptions = commonOptions(desktopStorage, desktopPort, desktopDevice, desktopProgress);
  desktopOptions.onMessage = (message) => desktopMessages.push(message);
  const desktopService = new NtfyLanSync(desktopOptions);
  const mobileOptions = commonOptions(mobileStorage, 43190, mobileDevice, mobileProgress, { autoDiscovery: false });
  mobileOptions.onMessage = (message) => mobileMessages.push(message);
  const mobileService = new NtfyLanSync({
    ...mobileOptions,
    desktop: false
  });
  try {
    await desktopService.start();
    await mobileService.start();
    await waitFor(() => mobileService.status().peerCount === 1, "mobile authenticated desktop endpoint");
    await waitFor(() => desktopService.status().peerCount === 1, "desktop observed authenticated mobile client");
    await waitFor(() => desktopStorage.text("Mobile/client-created.md") === "from mobile client", "automatic full-vault sync");
    desktopService.requestSync();
    await waitFor(() => desktopStorage.text("Mobile/client-created.md") === "from mobile client", "desktop-requested mobile LAN synchronization");
    await waitFor(() => mobileProgress.some((value) => value.phase === "complete"), "mobile synchronization completion");
    assert.ok(mobileProgress.some((value) => value.phase === "complete"), "Mobile client did not honor the desktop sync request");
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

  const source = await readFile(join(root, "main.js"), "utf8");
  const lanSource = await readFile(join(root, "src", "lanSync.ts"), "utf8");
  const takeoverStart = source.indexOf("remotelySaveStatusBarElement()");
  const takeoverSource = source.slice(takeoverStart, source.indexOf("\n  normalizeChannelHealth(", takeoverStart));
  const statusTextStart = source.indexOf("lanSyncStatusText()");
  const statusTextSource = source.slice(statusTextStart, source.indexOf("\n  lanSyncActivitySnapshot(", statusTextStart));
  assert.match(statusTextSource, /return `\$\{progress\.completed\}\/\$\{progress\.total\}`;/, "LAN progress should stay compact beside the Wi-Fi icon");
  assert.doesNotMatch(statusTextSource, /progress\.completed.*percent|·.*%/, "LAN progress should not append a percentage or LAN label");
  assert.doesNotMatch(statusTextSource, /LAN (?:connected|scanning|syncing|synced|unavailable)|局域网|已连接|扫描中|同步中|已同步|暂不可用/, "LAN status text should not show visible words");
  assert.match(statusTextSource, /return "";/, "Non-transfer LAN status should leave the visible text empty");
  assert.match(source, /setIcon\(icon, "wifi"\)/, "Connected LAN status should keep the Wi-Fi icon");
  assert.match(source, /registerDomEvent\(item, "click", \(\) => this\.openLanSyncDetails\(\)\)/, "LAN status item should open live details on click");
  assert.match(source, /class NtfyLanSyncDetailsModal extends Modal/, "LAN sync details modal is missing");
  assert.match(source, /renderScanSection\(body, scan, chinese\)/, "LAN scan section is missing");
  assert.match(source, /renderTransferSection\(body, progress, files, chinese\)/, "LAN transfer section is missing");
  assert.match(source, /上传/, "LAN transfer details do not label uploads");
  assert.match(source, /下载/, "LAN transfer details do not label downloads");
  assert.match(source, /this\.sectionState = \{ scan: false, transfer: false \}/, "LAN activity file lists should be collapsed by default");
  assert.match(source, /includeScanFiles: this\.sectionState\.scan/, "Collapsed scans should not materialize hidden file rows");
  assert.match(source, /includeTransferFiles: this\.sectionState\.transfer/, "Collapsed transfers should not materialize hidden file rows");
  assert.match(source, /createEl\("progress"/, "LAN details should expose progress bars");
  assert.match(source, /this\.app\.vault\.on\("create"/, "New Vault files should trigger LAN sync");
  assert.match(source, /attachment\/write/, "LAN attachments should use the temporary inbox route");
  assert.match(source, /saveConversationAttachment/, "Received attachments should be saveable into the Vault");
  assert.match(source, /getLeaf\("tab"\)\.openFile\(target, \{ active: true \}\)/, "LAN Markdown activity should open the note in Obsidian");
  assert.match(source, /lanSyncDetailsModal\?\.refresh\(\)/, "LAN details should refresh with transfer progress");
  for (const mode of ["bidirectional", "incremental-push", "incremental-pull", "delete-push", "delete-pull"]) {
    assert.match(source, new RegExp(`(?:\\"|^)${mode.replace("-", "\\-")}(?:\\"|$)`), `LAN settings are missing mode ${mode}`);
  }
  assert.match(source, /lanSyncMaxFileMb[^\n]*512/, "LAN settings should allow selecting files larger than 100 MB");
  assert.match(source, /lanSyncCheckIntervalSeconds[^\n]*60/, "LAN full-vault scan default should be 60 seconds");
  assert.match(source, /lanSyncSyncConfigFolder[^\n]*true/, "LAN config-folder sync should default to enabled");
  assert.match(source, /lanSyncConflictRule/, "LAN conflict rule setting is missing");
  assert.doesNotMatch(lanSource, /buildLanConflictPath\s*\(/, "LAN sync still contains a conflict-copy path generator");
  assert.doesNotMatch(lanSource, /action\.kind === "conflict"/, "LAN sync still contains a conflict-copy executor");
  assert.match(lanSource, /peer_upgrade_required/, "Outdated LAN peers are not isolated from the original-path protocol");
  assert.match(takeoverSource, /plugins\?\.\["remotely-save"\]\?\.statusBarElement/);
  assert.doesNotMatch(takeoverSource, /isSyncing|currSyncMsg|syncEvent|remotelySave\.settings|candidate\.settings|start-sync/);
  assert.doesNotMatch(takeoverSource, /plugins\/remotely-save|plugins\\remotely-save/);

  console.log("PASS Ntfy encrypted full-vault LAN sync, original-path convergence, direction progress, replay defense, and Remotely Save isolation checks");
} finally {
  await rm(temp, { recursive: true, force: true });
}
