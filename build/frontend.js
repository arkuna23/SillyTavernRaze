import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { glob } from 'glob';
import * as esbuild from 'esbuild';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const publicDir = path.resolve(__dirname, '..', 'public');
const distDir = path.resolve(__dirname, '..', 'dist', 'public');

// Generate hash for file content
function generateHash(content, length = 8) {
    return crypto.createHash('md5').update(content).digest('hex').substring(0, length);
}

// Ensure directory exists
function ensureDir(filePath) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

// Copy and hash static files
async function processStaticFiles() {
    const staticFiles = await glob('**/*.{png,jpg,jpeg,gif,svg,ico,woff,woff2,ttf,eot}', {
        cwd: publicDir,
        nodir: true,
    });

    const fileMap = {};

    for (const file of staticFiles) {
        const sourcePath = path.join(publicDir, file);
        const content = fs.readFileSync(sourcePath);
        const hash = generateHash(content);

        const ext = path.extname(file);
        const name = path.basename(file, ext);
        const dir = path.dirname(file);

        const hashedName = `${name}.${hash}${ext}`;
        const hashedPath = path.join(dir, hashedName);
        const destPath = path.join(distDir, hashedPath);

        ensureDir(destPath);
        fs.copyFileSync(sourcePath, destPath);

        fileMap[file] = hashedPath;
        console.log(`✓ Copied: ${file} → ${hashedPath}`);
    }

    return fileMap;
}

// Process CSS files
async function processCSSFiles() {
    const cssFiles = await glob('**/*.css', {
        cwd: publicDir,
        nodir: true,
    });

    const fileMap = {};

    for (const file of cssFiles) {
        const sourcePath = path.join(publicDir, file);
        let content = fs.readFileSync(sourcePath, 'utf-8');

        // Simple CSS minification
        content = content
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/\s+/g, ' ')
            .replace(/\s*([{}:;,])\s*/g, '$1')
            .trim();

        const hash = generateHash(content);
        const ext = path.extname(file);
        const name = path.basename(file, ext);
        const dir = path.dirname(file);

        const hashedName = `${name}.${hash}${ext}`;
        const hashedPath = path.join(dir, hashedName);
        const destPath = path.join(distDir, hashedPath);

        ensureDir(destPath);
        fs.writeFileSync(destPath, content);

        fileMap[file] = hashedPath;
        console.log(`✓ Minified CSS: ${file} → ${hashedPath}`);
    }

    return fileMap;
}

// Process JavaScript files
async function processJSFiles() {
    const jsFiles = await glob('**/*.{js,mjs}', {
        cwd: publicDir,
        nodir: true,
    });

    const fileMap = {};

    for (const file of jsFiles) {
        const sourcePath = path.join(publicDir, file);

        try {
            const result = await esbuild.build({
                entryPoints: [sourcePath],
                bundle: false,
                minify: true,
                target: 'es2022',
                format: 'esm',
                write: false,
            });

            const content = result.outputFiles[0].text;
            const hash = generateHash(content);

            const ext = path.extname(file);
            const name = path.basename(file, ext);
            const dir = path.dirname(file);

            const hashedName = `${name}.${hash}${ext}`;
            const hashedPath = path.join(dir, hashedName);
            const destPath = path.join(distDir, hashedPath);

            ensureDir(destPath);
            fs.writeFileSync(destPath, content);

            fileMap[file] = hashedPath;
            console.log(`✓ Minified JS: ${file} → ${hashedPath}`);
        } catch (error) {
            console.error(`✗ Error processing ${file}:`, error.message);
        }
    }

    return fileMap;
}

// Process HTML files using jsdom
async function processHTMLFiles(fileMap) {
    const htmlFiles = await glob('**/*.html', {
        cwd: publicDir,
        nodir: true,
    });

    for (const file of htmlFiles) {
        const sourcePath = path.join(publicDir, file);
        const html = fs.readFileSync(sourcePath, 'utf-8');
        const dom = new JSDOM(html);
        const document = dom.window.document;

        // Update script tags
        document.querySelectorAll('script[src]').forEach(element => {
            const src = element.getAttribute('src');
            if (src && !src.startsWith('http') && !src.startsWith('//')) {
                const normalizedSrc = src.startsWith('/') ? src.substring(1) : src;
                const resolvedPath = path.normalize(path.join(path.dirname(file), normalizedSrc)).replace(/\\/g, '/');

                if (fileMap[resolvedPath]) {
                    const newSrc = path.relative(path.dirname(file), fileMap[resolvedPath]).replace(/\\/g, '/');
                    element.setAttribute('src', newSrc.startsWith('.') ? newSrc : './' + newSrc);
                    console.log(`  Updated script: ${src} → ${newSrc}`);
                }
            }
        });

        // Update link tags
        document.querySelectorAll('link[href]').forEach(element => {
            const href = element.getAttribute('href');
            if (href && !href.startsWith('http') && !href.startsWith('//')) {
                const normalizedHref = href.startsWith('/') ? href.substring(1) : href;
                const resolvedPath = path.normalize(path.join(path.dirname(file), normalizedHref)).replace(/\\/g, '/');

                if (fileMap[resolvedPath]) {
                    const newHref = path.relative(path.dirname(file), fileMap[resolvedPath]).replace(/\\/g, '/');
                    element.setAttribute('href', newHref.startsWith('.') ? newHref : './' + newHref);
                    console.log(`  Updated link: ${href} → ${newHref}`);
                }
            }
        });

        // Update img tags
        document.querySelectorAll('img[src]').forEach(element => {
            const src = element.getAttribute('src');
            if (src && !src.startsWith('http') && !src.startsWith('//') && !src.startsWith('data:')) {
                const normalizedSrc = src.startsWith('/') ? src.substring(1) : src;
                const resolvedPath = path.normalize(path.join(path.dirname(file), normalizedSrc)).replace(/\\/g, '/');

                if (fileMap[resolvedPath]) {
                    const newSrc = path.relative(path.dirname(file), fileMap[resolvedPath]).replace(/\\/g, '/');
                    element.setAttribute('src', newSrc.startsWith('.') ? newSrc : './' + newSrc);
                    console.log(`  Updated img: ${src} → ${newSrc}`);
                }
            }
        });

        // Save updated HTML
        const destPath = path.join(distDir, file);
        ensureDir(destPath);
        fs.writeFileSync(destPath, dom.serialize());
        console.log(`✓ Processed HTML: ${file}`);
    }
}

// Main build function
async function build() {
    console.log('🚀 Starting build process...\n');

    if (fs.existsSync(distDir)) {
        fs.rmSync(distDir, { recursive: true });
    }
    fs.mkdirSync(distDir, { recursive: true });

    try {
        console.log('📦 Processing static files...');
        const staticMap = await processStaticFiles();

        console.log('\n🎨 Processing CSS files...');
        const cssMap = await processCSSFiles();

        console.log('\n⚡ Processing JavaScript files...');
        const jsMap = await processJSFiles();

        const fileMap = { ...staticMap, ...cssMap, ...jsMap };

        console.log('\n📝 Processing HTML files...');
        await processHTMLFiles(fileMap);

        console.log('\n✅ Build completed successfully!');
        console.log(`📂 Output directory: ${distDir}`);
    } catch (error) {
        console.error('\n❌ Build failed:', error);
        process.exit(1);
    }
}

await build();
