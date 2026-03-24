// Plugin manager script.
// Usage:
// 1. node plugins.js update
// 2. node plugins.js install <plugin-git-url>
// More operations coming soon.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import * as git from 'isomorphic-git';
import http from 'isomorphic-git/http/node/index.cjs';
import { color } from './src/util.js';

const __dirname = import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url));
process.chdir(__dirname);
const pluginsPath = './plugins';

const command = process.argv[2];

if (!command) {
    console.log('Usage: node plugins.js <command>');
    console.log('Commands:');
    console.log('  update - Update all installed plugins');
    console.log('  install <plugin-git-url> - Install plugin from a Git URL');
    process.exit(1);
}

if (command === 'update') {
    console.log(color.magenta('Updating all plugins'));
    updatePlugins();
}

if (command === 'install') {
    const pluginName = process.argv[3];
    console.log('Installing a new plugin', color.green(pluginName));
    installPlugin(pluginName);
}

async function updatePlugins() {
    const directories = fs.readdirSync(pluginsPath)
        .filter(file => !file.startsWith('.'))
        .filter(file => fs.statSync(path.join(pluginsPath, file)).isDirectory());

    console.log(`Found ${color.cyan(directories.length)} directories in ./plugins`);

    for (const directory of directories) {
        try {
            console.log(`Updating plugin ${color.green(directory)}...`);
            const pluginPath = path.join(pluginsPath, directory);

            // Check if it's a git repository
            const isRepo = await git.resolveRef({ fs, dir: pluginPath, ref: 'HEAD' })
                .then(() => true)
                .catch(() => false);
            if (!isRepo) {
                console.log(`Directory ${color.yellow(directory)} is not a Git repository`);
                continue;
            }

            await git.fetch({ fs, http, dir: pluginPath, remote: 'origin' });
            const commitHash = await git.resolveRef({ fs, dir: pluginPath, ref: 'HEAD' });
            const currentBranchName = await git.currentBranch({ fs, dir: pluginPath, fullname: false });
            const trackingBranch = `origin/${currentBranchName}`;

            // Get commits between current and remote
            const commits = await git.log({ fs, dir: pluginPath, ref: trackingBranch });

            const betweenCommits = [];
            for (const commit of commits) {
                if (commit.oid === commitHash) break;
                betweenCommits.push(commit);
            }

            if (betweenCommits.length === 0) {
                console.log(`Plugin ${color.blue(directory)} is already up to date`);
                continue;
            }

            await git.fastForward({ fs, http, dir: pluginPath, ref: currentBranchName });
            const latestCommit = await git.resolveRef({ fs, dir: pluginPath, ref: 'HEAD' });
            console.log(`Plugin ${color.green(directory)} updated to commit ${color.cyan(latestCommit)}`);
        } catch (error) {
            console.error(color.red(`Failed to update plugin ${directory}: ${error.message}`));
        }
    }

    console.log(color.magenta('All plugins updated!'));
}

async function installPlugin(pluginName) {
    try {
        const pluginPath = path.join(pluginsPath, path.basename(pluginName, '.git'));

        if (fs.existsSync(pluginPath)) {
            return console.log(color.yellow(`Directory already exists at ${pluginPath}`));
        }

        await git.clone({
            fs,
            http,
            dir: pluginPath,
            url: pluginName,
            depth: 1,
            singleBranch: true,
        });
        console.log(`Plugin ${color.green(pluginName)} installed to ${color.cyan(pluginPath)}`);
    }
    catch (error) {
        console.error(color.red(`Failed to install plugin ${pluginName}`), error);
    }
}
