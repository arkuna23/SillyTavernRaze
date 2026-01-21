import { serverDirectory } from '../src/server-directory.js';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import * as fflate from 'fflate';
import fsAsync from 'node:fs/promises';
import * as tar from 'tar';

// --- 1. 处理参数 ---
const args = process.argv.slice(2);
globalThis.IS_PACK_MODE = args.includes('--pack');
const IS_PACK_MODE = globalThis.IS_PACK_MODE;

const DIST_DIR = path.join(serverDirectory, 'dist');
const PLATFORM = os.platform();
const ARCH = os.arch();
const IS_WIN = PLATFORM === 'win32';

const EXT = (IS_PACK_MODE || IS_WIN) ? 'zip' : 'tar.gz';

const ARCHIVE_NAME = `silly_tavern_${PLATFORM}_${ARCH}${IS_PACK_MODE ? '_packed' : ''}.${EXT}`;
const ARCHIVE_PATH = IS_PACK_MODE ? path.join(DIST_DIR, `silly_tavern.${EXT}`) : path.join(DIST_DIR, ARCHIVE_NAME);

console.log(`🚀 Starting Build Process... ${IS_PACK_MODE ? '(PACK MODE)' : ''}`);

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

const shouldExclude = (fileName) => {
    if (fileName.startsWith('_') || fileName.endsWith('.zip') || fileName.endsWith('.tar.gz')) {
        return true;
    }
    if (IS_PACK_MODE) {
        const excludes = ['node', 'node.exe', 'start.sh', 'start.bat'];
        if (excludes.includes(fileName)) return true;
    }
    return false;
};

console.log(`🗜️ Archiving via API into ${EXT}...`);

if (IS_WIN || IS_PACK_MODE) {
    console.log(`   Generating ZIP archive...`);
    const zipData = {};

    async function scan(dir, depth = 0) {
        const entries = await fsAsync.readdir(dir, { withFileTypes: true });

        if (entries.length === 0) {
            const relativePath = path.relative(DIST_DIR, dir);
            if (relativePath) {
                const zipEntryName = relativePath.split(path.sep).join('/') + '/';
                zipData[zipEntryName] = new Uint8Array(0);
            }
            return;
        }

        for (const entry of entries) {
            // 排除逻辑
            if (depth === 0 && shouldExclude(entry.name)) {
                continue;
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
    // 非 pack 模式下的 Linux/macOS 走 TAR 逻辑
    console.log('   Generating TAR.GZ archive for Linux/macOS...');

    await tar.create(
        {
            gzip: true,
            file: ARCHIVE_PATH,
            cwd: DIST_DIR,
            filter: (filePath) => {
                const relativePath = filePath.replace(/^\.?\//, '');
                const rootName = relativePath.split('/')[0];
                return !shouldExclude(rootName);
            },
        },
        ['.'],
    );
}

console.log(`✅ Build completed: ${ARCHIVE_PATH}`);

export {};
