import { serverDirectory } from '../src/server-directory.js';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import * as fflate from 'fflate';
import fsAsync from 'node:fs/promises';
import * as tar from 'tar';
import { getBuildVersion, hashFile } from './utils.js';

// --- 1. 处理参数 ---
const args = process.argv.slice(2);
globalThis.IS_PACK_MODE = args.includes('--pack');
globalThis.IS_SPLIT_MODE = args.includes('--split');
const IS_PACK_MODE = globalThis.IS_PACK_MODE;
const IS_SPLIT_MODE = globalThis.IS_SPLIT_MODE;

const DIST_DIR = path.join(serverDirectory, 'dist');
const PLATFORM = os.platform();
const ARCH = os.arch();
const IS_WIN = PLATFORM === 'win32';

const EXT = IS_PACK_MODE || IS_WIN ? 'zip' : 'tar.gz';

const ARCHIVE_NAME = `sillytavern_${PLATFORM}_${ARCH}${IS_PACK_MODE ? '_packed' : ''}.${EXT}`;
const ARCHIVE_PATH = IS_PACK_MODE
    ? path.join(DIST_DIR, `sillytavern.${EXT}`)
    : path.join(DIST_DIR, ARCHIVE_NAME);

console.log(
    `🚀 Starting Build Process... ${IS_PACK_MODE ? '(PACK MODE)' : ''}`,
);

console.log('🔨 Building backend...');
await import('./backend.js').then((pkg) => pkg.build());

console.log('🎨 Building frontend...');
await import('./frontend.js').then((pkg) => pkg.build());

console.log('📂 Copying default files...');
const srcDefault = path.join(serverDirectory, 'default');
const destDefault = path.join(DIST_DIR, 'default');
await fs.cp(srcDefault, destDefault, { recursive: true, force: true });

console.log('🗄️ Creating data directory...');
await fs.mkdir(path.join(DIST_DIR, 'data'), { recursive: true });

const shouldExclude = (fileName) => {
    if (
        fileName.startsWith('_') ||
		fileName.endsWith('.zip') ||
		fileName.endsWith('.tar.gz')
    ) {
        return true;
    }
    if (IS_PACK_MODE || IS_SPLIT_MODE) {
        const excludes = ['node', 'node.exe', 'start.sh', 'start.bat'];
        if (excludes.includes(fileName)) return true;
    }
    return false;
};

console.log(`🗜️ Archiving via API into ${EXT}...`);

async function scanZip({
    zipData = {},
    dir = '',
    fromDir = DIST_DIR,
    exclude = true,
    depth = 0,
} = {}) {
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
        if (depth === 0 && exclude && shouldExclude(entry.name)) {
            continue;
        }

        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(fromDir, fullPath);
        const zipEntryName = relativePath.split(path.sep).join('/');

        if (entry.isDirectory()) {
            await scanZip({ zipData, dir: fullPath, exclude, depth: depth + 1 });
        } else {
            zipData[zipEntryName] = new Uint8Array(await fsAsync.readFile(fullPath));
        }
    }
}

async function createZip(archivePath, dir, zipData = {}) {
    if (dir) {
        await scanZip({
            zipData,
            dir,
        });
    }
    const zipped = fflate.zipSync(zipData, { level: 6 });
    await fs.writeFile(archivePath, zipped);
}

async function createTar(archivePath, cwd) {
    await tar.create(
        {
            gzip: true,
            file: archivePath,
            cwd,
            filter: (filePath) => {
                const relativePath = filePath.replace(/^\.?\//, '');
                const rootName = relativePath.split('/')[0];
                return !shouldExclude(rootName);
            },
        },
        ['.'],
    );
}

async function writeSplitVersionManifest() {
    const packages = {
        node_modules: 'node_modules.zip',
        webpage: 'webpage.zip',
        server: 'server.zip',
    };
    const manifest = {
        version: getBuildVersion(),
        hashAlgorithm: 'sha256',
        packages: {},
    };

    for (const [name, fileName] of Object.entries(packages)) {
        manifest.packages[name] = {
            file: fileName,
            hash: hashFile(path.join(DIST_DIR, fileName)),
        };
    }

    await fs.writeFile(
        path.join(DIST_DIR, 'version.json'),
        `${JSON.stringify(manifest, null, 2)}\n`,
    );
}

async function addFileToZip(zipData, fileName, { optional = false } = {}) {
    try {
        zipData[fileName] = new Uint8Array(
            await fsAsync.readFile(path.join(DIST_DIR, fileName)),
        );
    } catch (error) {
        if (optional && error?.code === 'ENOENT') {
            return;
        }
        throw error;
    }
}

if (IS_SPLIT_MODE) {
    console.log('\tGenerating split packages...');

    console.log('\tGenerating node_modules package...');
    await createZip(
        path.join(DIST_DIR, 'node_modules.zip'),
        path.join(DIST_DIR, 'node_modules'),
    );

    console.log('\tGenerating webpage package...');
    await createZip(
        path.join(DIST_DIR, 'webpage.zip'),
        path.join(DIST_DIR, 'public'),
    );

    console.log('\tGenerating server package...');
    const zipData = {};
    const files = ['app.js', 'package.json'];
    const optionalFiles = ['app.js.map'];
    const dirs = ['data', 'default', 'src'];

    for (const file of files) {
        await addFileToZip(zipData, file);
    }
    for (const file of optionalFiles) {
        await addFileToZip(zipData, file, { optional: true });
    }
    for (const dir of dirs) {
        await scanZip({
            zipData,
            dir: path.join(DIST_DIR, dir),
        });
    }
    await createZip(path.join(DIST_DIR, 'server.zip'), null, zipData);

    console.log('\tGenerating version manifest...');
    await writeSplitVersionManifest();

    console.log('✅ Build completed: split packages.');
} else if (IS_WIN || IS_PACK_MODE) {
    console.log('\tGenerating ZIP archive...');

    await createZip(ARCHIVE_PATH, DIST_DIR);
    console.log(`✅ Build completed: ${ARCHIVE_PATH}`);
} else {
    // 非 pack 模式下的 Linux/macOS 走 TAR 逻辑
    console.log('\tGenerating TAR.GZ archive for Linux/macOS...');
    await createTar(ARCHIVE_PATH, DIST_DIR);

    console.log(`✅ Build completed: ${ARCHIVE_PATH}`);
}
