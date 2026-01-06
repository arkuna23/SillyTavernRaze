import esbuild from 'esbuild';
import { fileURLToPath } from 'url';
import path, { dirname, join } from 'path';
import fs from 'fs';
import modclean from 'modclean';

// --- Configuration & Helpers ---
const __filename = fileURLToPath(import.meta.url);
// Standardize path to project root
const PROJECT_ROOT = path.resolve(dirname(__filename), '..');
const isProd = process.env.NODE_ENV === 'production';

/**
 * Identify required node_modules by analyzing esbuild metafile
 */
async function getDependencies() {
    const result = await esbuild.build({
        entryPoints: ['server.js'],
        bundle: true,
        platform: 'node',
        target: 'node18',
        metafile: true,
        format: 'esm',
        write: false, // No need to write files for analysis phase
        external: ['wink-*'],
    });

    const dependencies = new Set();
    const inputs = result.metafile.inputs;

    Object.keys(inputs).forEach(filePath => {
        if (filePath.includes('node_modules')) {
            // Regex to handle both normal and scoped packages (@scope/pkg)
            const match = filePath.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/);
            if (match) dependencies.add(match[1]);
        }
    });

    dependencies.add('wink-nlp');
    fs.mkdirSync(path.join(PROJECT_ROOT, 'dist'));
    fs.writeFileSync(path.join(PROJECT_ROOT, 'dist', 'metafile.json'), JSON.stringify(result.metafile));
    return Array.from(dependencies);
}

/**
 * Deep copy directories or files
 */
function copyRecursive(src, dest) {
    if (!fs.existsSync(src)) return;

    const stats = fs.lstatSync(src);
    if (stats.isDirectory()) {
        if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
        fs.readdirSync(src).forEach(file => copyRecursive(join(src, file), join(dest, file)));
    } else {
        fs.copyFileSync(src, dest);
    }
}

// --- Main Build Process ---
export async function build() {
    console.log('🚀 Starting selective build process...');

    const distDir = join(PROJECT_ROOT, 'dist');
    const distNM = join(distDir, 'node_modules');

    // 1. Analyze dependencies
    const dependencies = await getDependencies();

    // 2. Bundle application code
    console.log('📦 Bundling application code...');
    await esbuild.build({
        entryPoints: ['server.js'],
        bundle: true,
        platform: 'node',
        target: 'node18',
        format: 'esm',
        outfile: join(distDir, 'app.js'),
        sourcemap: !isProd,
        minify: isProd,
        treeShaking: true,
        packages: 'external', // Keep dependencies external as they will be copied
    });

    // 3. Physical copy of required node_modules
    console.log(`📂 Copying ${dependencies.length} selected modules to dist...`);
    if (!fs.existsSync(distNM)) fs.mkdirSync(distNM, { recursive: true });

    dependencies.forEach(dep => {
        const srcPath = join(PROJECT_ROOT, 'node_modules', dep);
        const destPath = join(distNM, dep);

        if (fs.existsSync(srcPath)) {
            // Handle scoped packages directory creation
            if (dep.startsWith('@')) {
                const scopeDir = dirname(destPath);
                if (!fs.existsSync(scopeDir)) fs.mkdirSync(scopeDir, { recursive: true });
            }
            copyRecursive(srcPath, destPath);
        }
    });

    // 4. Generate optimized package.json
    console.log('📝 Generating minimal package.json...');
    const rootPkg = JSON.parse(fs.readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf-8'));
    const distPkg = {
        name: rootPkg.name,
        type: 'module',
        main: 'app.js',
        dependencies: Object.fromEntries(
            dependencies.map(d => [d, rootPkg.dependencies?.[d] || '*']),
        ),
    };
    fs.writeFileSync(join(distDir, 'package.json'), JSON.stringify(distPkg, null, 2));

    // 5. Cleanup with Modclean
    console.log('🧹 Running Modclean optimization...');
    const cleaner = modclean({
        cwd: distNM,
        patterns: ['default:safe', 'default:caution'],
        removeEmptyDirs: true,
        recursive: true,
    });

    try {
        const files = await cleaner.clean();
        console.log(`✨ Cleanup successful! Removed ${files.length} unnecessary files.`);
    } catch (err) {
        console.error('⚠️ Modclean encountered an issue:', err.message);
    }

    console.log('✅ Build complete! Output available in ./dist');
}

// Run the build
build().catch(err => {
    console.error('💥 Fatal build error:', err);
    process.exit(1);
});
