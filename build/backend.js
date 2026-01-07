/* global Bun */

import { serverDirectory } from '../src/server-directory.js';
import path from 'node:path';

const DIST_DIR = path.join(serverDirectory, 'dist');
const SERVER_ENTRY = path.join(serverDirectory, 'server.js');
const SERVER_BIN = path.join(DIST_DIR, 'server');
const GENERATED_PKG_PATH = path.join(DIST_DIR, 'package.json');

try {
    console.log('📦 Compiling server...');

    // 1. Use Bun Native API with compile option
    await Bun.build({
        entrypoints: [SERVER_ENTRY],
        minify: true,
        sourcemap: 'external', // "external" is usually better for binaries than "true" (inline)
        compile: true,         // Using the compile option as requested
        outdir: DIST_DIR,
        // Ensure the binary is named 'server' (without .js extension)
        naming: 'server',
    });

    console.log(`✅ Binary created at: ${SERVER_BIN}`);

    // 2. Generate a basic package.json (No complex analysis)
    console.log('📝 Generating basic package.json...');

    const basicPackageJson = {
        name: 'sillytavern',
        version: '1.0.0',
        description: 'Standalone server build',
        type: 'module',
        private: true,
        scripts: {
            'start': './server',
        },
    };

    await Bun.write(GENERATED_PKG_PATH, JSON.stringify(basicPackageJson, null, 2));

    console.log(`✅ Generated ${GENERATED_PKG_PATH}`);

} catch (err) {
    console.error('❌ Build failed:', err);
    // Print build logs if available in the error object
    if (err.logs) {
        for (const log of err.logs) console.error(log);
    }
    process.exit(1);
}
