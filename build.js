import esbuild from 'esbuild';
import depcheck from 'depcheck';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import modclean from 'modclean'; // Import modclean

const __dirname = dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === 'production';

console.log('🚀 Starting build (Selective Local Copy)...');

// 1. Bundle code using esbuild
await esbuild.build({
    entryPoints: ['server.js'],
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'esm',
    outfile: 'dist/app.js',
    sourcemap: !isProd,
    minify: isProd,
    treeShaking: true,
    packages: 'external',
});

// 2. Run depcheck to find actually used packages
const result = await depcheck(__dirname, {
    ignorePatterns: ['tests', 'public', 'data', 'build.js', '.*', 'index.d.ts'],
});

const distNM = join(__dirname, 'dist/node_modules');
if (!fs.existsSync(distNM)) fs.mkdirSync(distNM, { recursive: true });

/**
 * Recursive function to copy directory or file
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

// 3. Identify all required packages (Direct + Indirect)
const directDeps = Object.keys(result.using);
const allDepsToCopy = new Set();

function collectDependencies(depName) {
    if (allDepsToCopy.has(depName)) return;
    allDepsToCopy.add(depName);

    const pkgJsonPath = join(__dirname, 'node_modules', depName, 'package.json');
    if (fs.existsSync(pkgJsonPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
        if (pkg.dependencies) {
            Object.keys(pkg.dependencies).forEach(subDep => collectDependencies(subDep));
        }
    }
}

console.log('🔍 Resolving dependency tree from used packages...');
directDeps.forEach(dep => collectDependencies(dep));

// 4. Execute physical copy
console.log(`📂 Copying ${allDepsToCopy.size} modules to dist/node_modules...`);
allDepsToCopy.forEach(dep => {
    const srcPath = join(__dirname, 'node_modules', dep);
    const destPath = join(distNM, dep);

    if (fs.existsSync(srcPath)) {
        if (dep.startsWith('@')) {
            const scopeDir = dirname(destPath);
            if (!fs.existsSync(scopeDir)) fs.mkdirSync(scopeDir, { recursive: true });
        }
        copyRecursive(srcPath, destPath);
    }
});

// 5. Create minimal package.json
const rootPkg = JSON.parse(fs.readFileSync(join(__dirname, 'package.json'), 'utf-8'));
const distPkg = {
    name: rootPkg.name,
    type: 'module',
    main: 'app.js',
    dependencies: Object.fromEntries(
        directDeps.map(d => [d, rootPkg.dependencies[d] || '*']),
    ),
};
fs.writeFileSync(join(__dirname, 'dist/package.json'), JSON.stringify(distPkg, null, 2));

// --- NEW: Step 6. Cleanup with Modclean ---
console.log('🧹 Cleaning up dist/node_modules with Modclean...');

// Create a modclean instance
const cleaner = modclean({
    cwd: distNM,             // Target directory for cleaning
    patterns: ['default:safe', 'default:caution'], // Use safe and cautious patterns
    removeEmptyDirs: true,   // Remove empty directories after cleaning files
    recursive: true,          // Go deep into sub-folders
});

// Clean and wait for result
try {
    const files = await cleaner.clean();
    console.log(`✨ Cleanup complete! Removed ${files.length} files.`);
} catch (err) {
    console.error('⚠️ Modclean error:', err.message);
}

console.log('✨ Selective copy and cleanup complete!');
