import { serverDirectory } from '../src/server-directory.js';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import * as fflate from 'fflate';
import fsAsync from 'node:fs/promises';
import * as tar from 'tar'; // Use the tar library API

const DIST_DIR = path.join(serverDirectory, 'dist');

// --- Determine platform and archive format ---
const PLATFORM = os.platform();
const ARCH = os.arch();
const IS_WIN = PLATFORM === 'win32';
const EXT = IS_WIN ? 'zip' : 'tar.gz';

const ARCHIVE_NAME = `sillytavern_${PLATFORM}_${ARCH}.${EXT}`;
const ARCHIVE_PATH = path.join(DIST_DIR, ARCHIVE_NAME);

console.log('🚀 Starting Build Process...');

console.log('🔨 Building backend...');
await import('./backend.js');

console.log('🎨 Building frontend...');
await import('./frontend.js');

console.log('📂 Copying default files...');
const srcDefault = path.join(serverDirectory, 'default');
const destDefault = path.join(DIST_DIR, 'default');
await fs.cp(srcDefault, destDefault, { recursive: true, force: true });

console.log('🗄️ Creating data directory...');
await fs.mkdir(path.join(DIST_DIR, 'data'), { recursive: true });

console.log(`🗜️ Archiving via API into ${EXT}...`);

if (IS_WIN) {
    // === Windows: Use fflate API for ZIP ===
    console.log('   Generating ZIP archive for Windows...');
    const zipData = {};

    /**
     * Recursively scans the directory to prepare zipData object.
     * Respects the requirement to ignore "_node" and existing archives.
     */
    async function scan(dir, depth = 0) {
        const entries = await fsAsync.readdir(dir, { withFileTypes: true });

        // Handle empty directories for fflate
        if (entries.length === 0) {
            const relativePath = path.relative(DIST_DIR, dir);
            if (relativePath) {
                const zipEntryName = relativePath.split(path.sep).join('/') + '/';
                zipData[zipEntryName] = new Uint8Array(0);
            }
            return;
        }

        for (const entry of entries) {
            // Ignore cache and existing archives at root level
            if (depth === 0) {
                if (entry.name === '_node' || entry.name.endsWith('.zip') || entry.name.endsWith('.tar.gz')) {
                    continue;
                }
            }

            const fullPath = path.join(dir, entry.name);
            const relativePath = path.relative(DIST_DIR, fullPath);
            const zipEntryName = relativePath.split(path.sep).join('/');

            if (entry.isDirectory()) {
                await scan(fullPath, depth + 1);
            } else {
                zipData[zipEntryName] = new Uint8Array(
                    await fsAsync.readFile(fullPath),
                );
            }
        }
    }

    await scan(DIST_DIR);
    const zipped = fflate.zipSync(zipData, { level: 6 });
    await fs.writeFile(ARCHIVE_PATH, zipped);

} else {
    // === Linux/macOS: Use node-tar API for TAR.GZ ===
    console.log('   Generating TAR.GZ archive for Linux/macOS...');

    await tar.create(
        {
            gzip: true,
            file: ARCHIVE_PATH,
            cwd: DIST_DIR,
            // Filter API to exclude unnecessary files/folders
            filter: (filePath) => {
                // Remove leading dot/slash for comparison
                const relativePath = filePath.replace(/^\.?\//, '');

                // 1. Ignore the _node cache directory
                if (relativePath === '_node' || relativePath.startsWith('_node/')) {
                    return false;
                }

                // 2. Ignore existing archives in the dist folder
                if (relativePath.endsWith('.zip') || relativePath.endsWith('.tar.gz')) {
                    return false;
                }

                return true;
            },
        },
        ['.'], // Pack all files in the current working directory (dist)
    );
}

console.log(`✅ Build completed: ${ARCHIVE_PATH}`);

export {};
