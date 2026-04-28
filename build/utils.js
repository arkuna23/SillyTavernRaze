import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const BUILD_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(BUILD_DIR, '..');

function runGit(args) {
    const result = spawnSync('git', args, {
        cwd: PROJECT_ROOT,
        encoding: 'utf8',
    });

    if (result.status !== 0) {
        return null;
    }

    return result.stdout?.trim() || null;
}

function normalizePath(filePath) {
    return filePath.split(path.sep).join('/');
}

function walk(dir) {
    let results = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            results = results.concat(walk(fullPath));
        } else {
            results.push(fullPath);
        }
    }

    return results;
}

function updateHashWithBuffer(hash, buffer) {
    hash.update(buffer);
    return hash;
}

function updateHashWithFile(hash, filePath) {
    return updateHashWithBuffer(hash, fs.readFileSync(filePath));
}

function hashDir(hash, rootDir, dirPath) {
    const files = walk(dirPath).sort((a, b) => a.localeCompare(b));

    for (const file of files) {
        const relativePath = normalizePath(path.relative(rootDir, file));
        hash.update(relativePath);
        hash.update('\0');
        updateHashWithFile(hash, file);
        hash.update('\0');
    }

    return hash;
}

export function hashFile(filePath) {
    const hash = crypto.createHash('sha256');
    updateHashWithFile(hash, filePath);
    return hash.digest('hex');
}

export function hashEntries(rootDir, entries = []) {
    const hash = crypto.createHash('sha256');
    const resolvedEntries = entries
        .map((entry) => path.resolve(rootDir, entry))
        .sort((a, b) => a.localeCompare(b));

    for (const entry of resolvedEntries) {
        const stat = fs.statSync(entry);
        if (stat.isDirectory()) {
            hashDir(hash, rootDir, entry);
            continue;
        }

        const relativePath = normalizePath(path.relative(rootDir, entry));
        hash.update(relativePath);
        hash.update('\0');
        updateHashWithFile(hash, entry);
        hash.update('\0');
    }

    return hash.digest('hex');
}

export function getBuildVersion() {
    const buildInfo = getBuildInfo();
    return buildInfo.buildVersion;
}

export function getBuildInfo() {
    const rootPkg = JSON.parse(
        fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8'),
    );
    const version = rootPkg.version || '0.0.0';
    const gitRevision = runGit(['rev-parse', '--short=7', 'HEAD']);
    const gitBranch = runGit(['rev-parse', '--abbrev-ref', 'HEAD']);
    const commitDate = runGit(['show', '-s', '--format=%cI', 'HEAD']);

    return {
        version,
        gitRevision,
        gitBranch: gitBranch === 'HEAD' ? 'DETACHED' : gitBranch,
        commitDate,
        buildVersion: gitRevision ? `v${version}-dev.${gitRevision}` : `v${version}`,
    };
}
