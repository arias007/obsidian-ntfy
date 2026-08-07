import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const mainPath = resolve(root, "main.js");
const sourcePath = resolve(root, "src", "lanSync.ts");
const startMarker = "// <ntfy-lan-runtime>";
const endMarker = "// </ntfy-lan-runtime>";

const result = await esbuild.build({
  entryPoints: [sourcePath],
  bundle: true,
  write: false,
  platform: "browser",
  format: "iife",
  globalName: "NtfyLanSyncRuntime",
  target: "chrome100",
  legalComments: "none",
  logLevel: "silent"
});

const runtime = result.outputFiles[0].text.trim();
const main = await readFile(mainPath, "utf8");
const start = main.indexOf(startMarker);
const end = main.indexOf(endMarker);
if (start < 0 || end < start) throw new Error("LAN runtime markers are missing from main.js");

const next = `${main.slice(0, start)}${startMarker}\n${runtime}\n${endMarker}${main.slice(end + endMarker.length)}`;
if (next !== main) await writeFile(mainPath, next, "utf8");
console.log(`Embedded LAN runtime from ${sourcePath}`);
