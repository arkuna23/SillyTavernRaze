import { $ } from "bun";
import { serverDirectory } from "../src/server-directory.js";
import path from "node:path";
import fs from "node:fs/promises";

const DIST_DIR = path.join(serverDirectory, "dist");

console.log("🚀 Starting Build Process...");

console.log("🔨 Building backend (JS generation)...");
await import("./backend.js");

console.log("🎨 Building frontend...");
await import("./frontend.js");

console.log("📂 Copying default files...");
const srcDefault = path.join(serverDirectory, "default");
const destDefault = path.join(DIST_DIR, "default");
await fs.cp(srcDefault, destDefault, { recursive: true, force: true });

console.log("🗄️ Creating data directory...");
const dataDir = path.join(DIST_DIR, "data");
await fs.mkdir(dataDir, { recursive: true });

console.log("✅ Build completed successfully!");

export {};
