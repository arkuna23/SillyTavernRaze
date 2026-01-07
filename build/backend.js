import esbuild from "esbuild";
import { fileURLToPath } from "url";
import path, { dirname, join } from "path";
import fs from "fs";
import modclean from "modclean";
import { execSync } from "child_process";

// --- Configuration & Helpers ---
const __filename = fileURLToPath(import.meta.url);
const PROJECT_ROOT = path.resolve(dirname(__filename), "..");
const isProd = process.env.NODE_ENV === "production";
const NODE_VERSION = "v18.18.2";

const rootPkgPath = join(PROJECT_ROOT, "package.json");
const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, "utf-8"));
const PROJECT_VERSION = rootPkg.version || "1.0.0";

/**
 * Downloads and extracts the Node executable.
 * Stores all caches (download and decompression) in dist/_node.
 */
async function setupNodeRuntime(distDir) {
    const platform = process.platform;
    const arch = process.arch;

    // Everything related to node download/extraction goes here
    const nodeCacheDir = join(distDir, "_node");
    const finalNodeFile =
        platform === "win32"
            ? join(distDir, "node.exe")
            : join(distDir, "node");

    if (fs.existsSync(finalNodeFile)) {
        console.log(
            ">> Node executable already exists, skipping runtime setup.",
        );
        return;
    }

    let archiveName = "";
    let downloadUrl = "";
    if (platform === "win32") {
        archiveName = `node-${NODE_VERSION}-win-${arch}.zip`;
        downloadUrl = `https://nodejs.org/dist/${NODE_VERSION}/${archiveName}`;
    } else {
        const osMap = { darwin: "darwin", linux: "linux" };
        const osName = osMap[platform] || "linux";
        archiveName = `node-${NODE_VERSION}-${osName}-${arch}.tar.gz`;
        downloadUrl = `https://nodejs.org/dist/${NODE_VERSION}/${archiveName}`;
    }

    if (!fs.existsSync(nodeCacheDir))
        fs.mkdirSync(nodeCacheDir, { recursive: true });
    const cachedArchivePath = join(nodeCacheDir, archiveName);

    // 1. Download if not in dist/_node
    if (!fs.existsSync(cachedArchivePath)) {
        console.log(
            `>> Downloading Node.js ${NODE_VERSION} to ${nodeCacheDir}...`,
        );
        if (platform === "win32") {
            execSync(
                `powershell -Command "Invoke-WebRequest -Uri '${downloadUrl}' -OutFile '${cachedArchivePath}'"`,
                { stdio: "inherit" },
            );
        } else {
            try {
                execSync(`curl -L "${downloadUrl}" -o "${cachedArchivePath}"`, {
                    stdio: "inherit",
                });
            } catch (e) {
                execSync(`wget "${downloadUrl}" -O "${cachedArchivePath}"`, {
                    stdio: "inherit",
                });
            }
        }
    }

    // 2. Extract into dist/_node
    console.log(`>> Extracting runtime in ${nodeCacheDir}...`);
    if (platform === "win32") {
        execSync(
            `powershell -Command "Expand-Archive -Path '${cachedArchivePath}' -DestinationPath '${nodeCacheDir}' -Force"`,
            { stdio: "inherit" },
        );
    } else {
        execSync(`tar -xzf "${cachedArchivePath}" -C "${nodeCacheDir}"`, {
            stdio: "inherit",
        });
    }

    // 3. Locate and move only the binary
    const extractedRoot = fs
        .readdirSync(nodeCacheDir)
        .find(
            (f) =>
                f.startsWith("node-") &&
                fs.statSync(join(nodeCacheDir, f)).isDirectory(),
        );
    const sourceExecPath =
        platform === "win32"
            ? join(nodeCacheDir, extractedRoot, "node.exe")
            : join(nodeCacheDir, extractedRoot, "bin", "node");

    if (fs.existsSync(sourceExecPath)) {
        fs.copyFileSync(sourceExecPath, finalNodeFile);
        if (platform !== "win32") fs.chmodSync(finalNodeFile, "755");
    }

    // 4. Cleanup extracted folder but keep the archive cache
    fs.rmSync(join(nodeCacheDir, extractedRoot), {
        recursive: true,
        force: true,
    });
    console.log(">> Runtime binary positioned in dist root.");
}

function copyRecursive(src, dest) {
    if (!fs.existsSync(src)) return;
    const stats = fs.lstatSync(src);
    if (stats.isDirectory()) {
        if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
        fs.readdirSync(src).forEach((file) =>
            copyRecursive(join(src, file), join(dest, file)),
        );
    } else {
        fs.copyFileSync(src, dest);
    }
}

async function build() {
    console.log("--- Starting Portable Build Process ---");

    const distDir = join(PROJECT_ROOT, "dist");
    const distNM = join(distDir, "node_modules");

    // Ensure dist exists
    if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });

    // 1. Runtime Setup
    await setupNodeRuntime(distDir);

    // 2. Dependency Analysis
    const analysis = await esbuild.build({
        entryPoints: ["server.js"],
        bundle: true,
        platform: "node",
        target: "node18",
        metafile: true,
        format: "esm",
        write: false,
        external: ["wink-*"],
    });

    const dependencies = new Set([
        "wink-bm25-text-search",
        "wink-distance",
        "wink-eng-lite-web-model",
        "wink-helpers",
        "wink-jaro-distance",
        "wink-nlp",
        "wink-nlp-utils",
        "wink-porter2-stemmer",
        "wink-tokenizer",
    ]);

    Object.keys(analysis.metafile.inputs).forEach((filePath) => {
        if (filePath.includes("node_modules")) {
            const match = filePath.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/);
            if (match) dependencies.add(match[1]);
        }
    });

    // 3. Bundle App
    console.log(">> Bundling application...");
    await esbuild.build({
        entryPoints: ["server.js"],
        bundle: true,
        platform: "node",
        target: "node18",
        format: "esm",
        outfile: join(distDir, "app.js"),
        sourcemap: !isProd,
        minify: isProd,
        treeShaking: true,
        packages: "external",
    });

    // 4. Physical Copy
    console.log(`>> Copying ${dependencies.size} modules...`);
    if (!fs.existsSync(distNM)) fs.mkdirSync(distNM, { recursive: true });

    dependencies.forEach((dep) => {
        const srcPath = join(PROJECT_ROOT, "node_modules", dep);
        const destPath = join(distNM, dep);
        if (fs.existsSync(srcPath)) {
            if (dep.startsWith("@")) {
                const scopeDir = dirname(destPath);
                if (!fs.existsSync(scopeDir))
                    fs.mkdirSync(scopeDir, { recursive: true });
            }
            copyRecursive(srcPath, destPath);
        }
    });

    // 5. Cleanup with Modclean
    if (fs.existsSync(distNM)) {
        console.log(">> Cleaning node_modules...");
        const cleaner = modclean({
            cwd: distNM,
            removeEmptyDirs: true,
            recursive: true,
            ignorePatterns: ["**/examples-compiler.js"],
        });

        try {
            await cleaner.clean();
        } catch (err) {
            console.warn(">> Modclean warning (ignored):", err.message);
        }
    }

    // 5.5 Generate minimal package.json in dist
    console.log(`>> Generating dist/package.json (v${PROJECT_VERSION})...`);
    const minimalPkg = {
        name: rootPkg.name || "portable-app", // 建议同时保留名称
        version: PROJECT_VERSION, // 设定为项目的版本号
        type: "module",
    };
    fs.writeFileSync(
        join(distDir, "package.json"),
        JSON.stringify(minimalPkg, null, 2),
    );

    // 6. Launch Scripts
    const isWin = process.platform === "win32";
    const nodeBin = isWin ? "node.exe" : "./node";
    const command = `"${nodeBin}" --enable-source-maps app.js`;

    if (isWin) {
        fs.writeFileSync(
            join(distDir, "start.bat"),
            `@echo off\nSETLOCAL\ncd /d "%~dp0"\n${command}\npause`,
        );
    } else {
        const shPath = join(distDir, "start.sh");
        fs.writeFileSync(
            shPath,
            `#!/bin/bash\ncd "$(dirname "$0")"\n${command}`,
        );
        fs.chmodSync(shPath, "755");
    }

    console.log("--- Build Complete! ---");
}

await build().catch((err) => {
    console.error("!! Fatal Error:", err);
    process.exit(1);
});
