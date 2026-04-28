import fs from 'node:fs';

import git from 'isomorphic-git';
import http from 'isomorphic-git/http/node';

/**
 * @typedef {object} GitCloneOptions
 * @property {number} [depth]
 * @property {string} [branch]
 */

/**
 * @typedef {object} GitClient
 * @property {(url: string, localPath: string, options?: GitCloneOptions) => Promise<void>} clone
 */

/**
 * @returns {GitClient}
 */
export function createGitClient() {
    return new IsomorphicGitClient();
}

/**
 * @implements {GitClient}
 */
class IsomorphicGitClient {
    /**
     * @param {string} url
     * @param {string} localPath
     * @param {GitCloneOptions} [options]
     * @returns {Promise<void>}
     */
    async clone(url, localPath, options = {}) {
        const { depth, branch } = options;

        await git.clone({
            fs,
            http,
            dir: localPath,
            url,
            depth,
            ref: branch,
            singleBranch: depth !== undefined || Boolean(branch),
        });
    }
}
