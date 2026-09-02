import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const temp = await mkdtemp(join(tmpdir(), "ntfy-lan-smoke-"));
const bundle = join(temp, "lanSync.cjs");
await esbuild.build({ entryPoints: [join(root, "src", "lanSync.ts")], bundle: true, platform: "node", format: "cjs", target: "node20", outfile: bundle, logLevel: "silent" });
const require = createRequire(import.meta.url);
globalThis.require = require;
const { NtfyLanSync } = require(bundle);

const enc = new TextEncoder();
const ab = (value) => value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
class Store {
  constructor(identity, files) {
    this.identityRoot = ".obsidian/plugins/android-ntfy-notifier/lan-sync";
    this.files = new Map([[`${this.identityRoot}/identity.json`, { data: enc.encode(JSON.stringify(identity)), mtime: 1 }]]);
    for (const [path, content] of Object.entries(files)) this.put(path, content, 100);
  }
  put(path, content, mtime = 100) { this.files.set(path, { data: enc.encode(content), mtime }); }
  async listFiles() { return [...this.files].filter(([path]) => !path.startsWith(`${this.identityRoot}/`)).map(([path, v]) => ({ path, size: v.data.byteLength, mtime: v.mtime })); }
  async listFilesLive(includeConfig) { return this.listFiles(includeConfig); }
  async statFile(path) { const v = this.files.get(path); return v ? { path, size: v.data.byteLength, mtime: v.mtime } : null; }
  async readBinary(path) { const v = this.files.get(path); if (!v) throw new Error("missing_file"); return ab(v.data); }
  async writeBinary(path, data, mtime = 200) { this.files.set(path, { data: new Uint8Array(data), mtime }); }
  async deleteFile(path) { this.files.delete(path); }
  async exists(path) { return this.files.has(path); }
  async readText(path) { return new TextDecoder().decode(await this.readBinary(path)); }
  async writeText(path, content) { this.put(path, content); }
  async ensureFolder() {}
  async listDirectory() { return []; }
}
const identity = { schemaVersion: 1, vaultId: "SMOKEVault123456789", secret: "s".repeat(48), createdAt: new Date().toISOString() };
const a = new Store(identity, { "Notes/from-desktop.md": "desktop" });
const b = new Store(identity, { "Notes/from-phone.md": "phone" });
const ports = [43191, 43192];
const progressA = [], progressB = [];
const make = (storage, port, deviceId, progress, desktop) => {
  const values = new Map([["cancip.lan-sync.device-id.v1", deviceId]]);
  return new NtfyLanSync({
  desktop,
  getSettings: () => ({ enabled: true, autoDiscovery: false, checkIntervalSeconds: 1, mode: "bidirectional", syncConfigFolder: false, configDir: ".obsidian", port, maxFileBytes: 10 * 1024 * 1024, manualPeers: desktop ? [`127.0.0.1:${ports[1]}`] : [`127.0.0.1:${ports[0]}`] }),
  storage,
  httpRequest: async (request) => { const response = await fetch(request.url, { method: request.method, headers: request.headers, body: request.body }); return { status: response.status, text: await response.text() }; },
  onProgress: (value) => progress.push(value),
  localStore: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) }
  });
};
const desktop = make(a, ports[0], "DESKTOPSMOKETEST01", progressA, true);
const phone = make(b, ports[1], "PHONESMOKETEST0001", progressB, false);
await phone.start();
await desktop.start();
const started = Date.now();
while (Date.now() - started < 15_000 && (!a.files.has("Notes/from-phone.md") || !b.files.has("Notes/from-desktop.md") || desktop.syncRunning || phone.syncRunning || desktop.inboundSession || phone.inboundSession)) await new Promise((r) => setTimeout(r, 80));
await new Promise((r) => setTimeout(r, 1_000));
if (!a.files.has("Notes/from-phone.md") || !b.files.has("Notes/from-desktop.md")) {
  console.error(JSON.stringify({ desktop: desktop.status(), phone: phone.status(), desktopProgress: desktop.progress(), phoneProgress: phone.progress(), desktopPeers: desktop.listPeers(), phonePeers: phone.listPeers(), desktopFiles: [...a.files.keys()], phoneFiles: [...b.files.keys()] }, null, 2));
}
assert.equal(new TextDecoder().decode(b.files.get("Notes/from-desktop.md")?.data), "desktop");
assert.equal(new TextDecoder().decode(a.files.get("Notes/from-phone.md")?.data), "phone");
assert.ok(phone.scanProgress().total >= 1, `phone local scan was ${phone.scanProgress().completed}/${phone.scanProgress().total}`);
assert.ok(progressA.some((p) => p.downloads > 0 || p.uploads > 0), "desktop never exposed transfer direction");
assert.ok(progressB.some((p) => p.downloads > 0 || p.uploads > 0), "phone never exposed transfer direction");
const phoneScan = phone.scanProgress();
const desktopTransfer = progressA.filter((p) => p.total > 0).at(-1);
const phoneTransfer = progressB.filter((p) => p.total > 0).at(-1);
await Promise.all([desktop.stop(), phone.stop()]);
console.log("lan sync smoke passed", JSON.stringify({ phoneScan, desktopTransfer, phoneTransfer, desktopBest: progressA.filter((p) => p.total > 0).reduce((best, p) => (p.completed > best.completed ? p : best), { completed: -1 }), phoneBest: progressB.filter((p) => p.total > 0).reduce((best, p) => (p.completed > best.completed ? p : best), { completed: -1 }) }));
