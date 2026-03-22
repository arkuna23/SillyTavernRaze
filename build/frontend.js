import fs from 'node:fs';
import fsAsync from 'node:fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { glob } from 'glob';
import * as esbuild from 'esbuild';
import webpack from 'webpack';
import getWebpackConfig from '../webpack.config.js';

const webpackConfig = getWebpackConfig();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const publicDir = path.resolve(__dirname, '..', 'public');
const distDir = path.resolve(__dirname, '..', 'dist', 'public');

/**
 * Ensure directory exists for a file path
 */
function ensureDir(filePath) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

/**
 * Process lib.js using Webpack
 */
async function processWebpackLib() {
    return new Promise((resolve, reject) => {
        console.log('📦 Running Webpack to bundle lib.js...');

        const compiler = webpack(webpackConfig);

        compiler.run((err, stats) => {
            if (err) return reject(err);

            if (stats?.hasErrors()) {
                const info = stats.toJson();
                return reject(new Error(info.errors?.map((e) => e.message).join('\n')));
            }

            compiler.close(() => resolve());
        });
    });
}

/**
 * Process CSS files - minify and copy
 */
async function processCSSFiles() {
    const cssFiles = await glob(['**/*.css', '**/*.less'], {
        cwd: publicDir,
        nodir: true,
    });

    for (const file of cssFiles) {
        const sourcePath = path.join(publicDir, file);
        let content = fs.readFileSync(sourcePath, 'utf-8');

        // Simple minification
        content = content
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/\s+/g, ' ')
            .replace(/\s*([{}:;,])\s*/g, '$1')
            .trim();

        const destPath = path.join(distDir, file);
        ensureDir(destPath);
        fs.writeFileSync(destPath, content);

        console.log(`✓ Minified CSS: ${file}`);
    }
}

/**
 * Process JS files using esbuild - minify and copy
 */
async function processJSFiles() {
    const jsFiles = await glob('**/*.{js,mjs}', {
        cwd: publicDir,
        ignore: ['lib.js'], // Handled by Webpack
        nodir: true,
    });

    for (const file of jsFiles) {
        const sourcePath = path.join(publicDir, file);
        const destPath = path.join(distDir, file);

        if (file.includes('jquery') || file.includes('min.js')) {
            try {
                await fsAsync.mkdir(path.dirname(destPath), { recursive: true });

                await fsAsync.copyFile(sourcePath, destPath);

                console.log(`✓ Copied raw (jQuery): ${file}`);
                continue;
            } catch (error) {
                console.error(`✗ Error copying ${file}:`, error.message);
                continue;
            }
        }
        try {
            await esbuild.build({
                entryPoints: [sourcePath],
                outfile: destPath,
                bundle: false,
                minify: true,
                target: 'es2022',
                format: 'esm',
            });

            console.log(`✓ Processed JS: ${file}`);
        } catch (error) {
            console.error(`✗ Error processing ${file}:`, error.message);
        }
    }
}

/**
 * Copy HTML files
 */
async function processHTMLFiles() {
    const htmlFiles = await glob('**/*.html', {
        cwd: publicDir,
        nodir: true,
    });

    for (const file of htmlFiles) {
        const sourcePath = path.join(publicDir, file);
        const destPath = path.join(distDir, file);

        ensureDir(destPath);
        fs.copyFileSync(sourcePath, destPath);

        console.log(`✓ Copied HTML: ${file}`);
    }
}

/**
 * Copy static files (images, fonts, etc.)
 */
async function processStaticFiles() {
    const staticFiles = await glob(
        '**/*.{png,jpg,jpeg,gif,svg,ico,woff,woff2,ttf,eot,mp3,wav,json}',
        {
            cwd: publicDir,
            nodir: true,
        },
    );

    for (const file of staticFiles) {
        const sourcePath = path.join(publicDir, file);
        const destPath = path.join(distDir, file);

        ensureDir(destPath);
        fs.copyFileSync(sourcePath, destPath);

        console.log(`✓ Copied static file: ${file}`);
    }
}

/**
 * Main build orchestration
 */
export async function build() {
    console.log('🚀 Starting build process...\n');

    // Clean dist directory
    if (fs.existsSync(distDir)) {
        fs.rmSync(distDir, { recursive: true });
    }
    fs.mkdirSync(distDir, { recursive: true });

    try {
        // Run Webpack for lib.js
        await processWebpackLib();

        console.log('\n📦 Processing static files...');
        await processStaticFiles();

        console.log('\n🎨 Processing CSS files...');
        await processCSSFiles();

        console.log('\n⚡ Processing JS files...');
        await processJSFiles();

        console.log('\n📝 Processing HTML files...');
        await processHTMLFiles();

        console.log('\n✅ Build completed successfully!');
        console.log(`📂 Output directory: ${distDir}`);
    } catch (error) {
        console.error('\n❌ Build failed:', error);
        process.exit(1);
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    await build().catch((err) => {
        console.error('!! Fatal Error:', err);
        process.exit(1);
    });
}
