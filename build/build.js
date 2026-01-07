import { serverDirectory } from "../src/server-directory.js";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import * as fflate from "fflate";

const DIST_DIR = path.join(serverDirectory, "dist");
const ZIP_NAME = `sillytavern_${os.platform()}_${os.arch()}.zip`;
const ZIP_PATH = path.join(DIST_DIR, ZIP_NAME);

console.log("🚀 Starting Build Process...");

console.log("🔨 Building backend...");
await import("./backend.js");

console.log("🎨 Building frontend...");
await import("./frontend.js");

console.log("📂 Copying default files...");
const srcDefault = path.join(serverDirectory, "default");
const destDefault = path.join(DIST_DIR, "default");
await fs.cp(srcDefault, destDefault, { recursive: true, force: true });

console.log("🗄️ Creating data directory...");
await fs.mkdir(path.join(DIST_DIR, "data"), { recursive: true });

console.log("🗜️ Archiving via API (Keeping empty folders)...");

const zipData = {};

async function scan(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    if (entries.length === 0) {
        const relativePath = path.relative(DIST_DIR, dir);
        if (relativePath) {
            const zipEntryName = relativePath.split(path.sep).join("/") + "/";
            zipData[zipEntryName] = new Uint8Array(0);
        }
        return;
    }

    for (const entry of entries) {
        if (entry.name.startsWith("_") || entry.name.endsWith(".zip")) continue;

        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(DIST_DIR, fullPath);
        const zipEntryName = relativePath.split(path.sep).join("/");

        if (entry.isDirectory()) {
            await scan(fullPath);
        } else {
            zipData[zipEntryName] = new Uint8Array(await fs.readFile(fullPath));
        }
    }
}

await scan(DIST_DIR);

const zipped = fflate.zipSync(zipData, { level: 6 });
await fs.writeFile(ZIP_PATH, zipped);

console.log(`✅ Build completed: ${ZIP_PATH}`);

export {};
