import { $ } from 'bun'; // Import Bun Shell
import { serverDirectory } from '../src/server-directory.js';
import path from 'node:path';

const DIST_DIR = path.join(serverDirectory, 'dist');

console.log('🚀 Starting Build Process...');

// 1. Build backend JS (This generates DIST_DIR/app.js)
console.log('🔨 Building backend (JS generation)...');
await import('./backend.js');

// 3. Build frontend
console.log('🎨 Building frontend...');
await import('./frontend.js');

// 4. Copy default files (Replaces fsAsync.cp)
console.log('📂 Copying default files...');
const srcDefault = path.join(serverDirectory, 'default');
const destDefault = path.join(DIST_DIR, 'default');

// Using Shell for simpler recursive copy
await $`cp -r ${srcDefault} ${destDefault}`;

// 5. Create data directory (Replaces fsAsync.mkdir)
console.log('🗄️ Creating data directory...');
const dataDir = path.join(DIST_DIR, 'data');
// mkdir -p ensures parent directories are created and no error if exists
await $`mkdir -p ${dataDir}`;

console.log('🗜️ Archiving...');
// You can also use Bun Shell to zip the result directly
// await $`cd ${DIST_DIR} && zip -r release.zip .`;

console.log('✅ Build completed successfully!');

export {};
