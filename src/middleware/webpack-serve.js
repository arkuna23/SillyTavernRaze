import webpack from 'webpack';
import getPublicLibConfig from '../../webpack.config.js';
import { serverDirectory } from '../server-directory.js';
import path from 'node:path';
import { getFileSignature } from '../util.js';
import * as fs from 'fs/promises';

export default function getWebpackServeMiddleware() {
    /**
     * A very spartan recreation of webpack-dev-middleware.
     * @param {import('express').Request} req Request object.
     * @param {import('express').Response} res Response object.
     * @param {import('express').NextFunction} next Next function.
     * @type {import('express').RequestHandler}
     */
    function devMiddleware(req, res, next) {
        const publicLibConfig = getPublicLibConfig();
        const outputPath = publicLibConfig.output?.path;
        const outputFile = publicLibConfig.output?.filename;
        const parsedPath = path.parse(req.path);

        if (req.method === 'GET' && parsedPath.dir === '/' && parsedPath.base === outputFile) {
            return res.sendFile(outputFile, { root: outputPath });
        }

        next();
    }

    /**
     * Wait until Webpack is done compiling.
     * @param {object} param Parameters.
     * @param {boolean} [param.forceDist] Whether to force the use the /dist folder.
     * @returns {Promise<void>}
     */
    devMiddleware.runWebpackCompiler = async ({ forceDist = false } = {}) => {
        const publicPath = path.join(serverDirectory, 'public', 'lib.js');
        const sig = await getFileSignature(publicPath);
        const sigPath = path.join(globalThis.DATA_ROOT, '.lib-sig');

        try {
            const data = await fs.readFile(sigPath, 'utf8');
            if (data.trim() === sig) return;
            else console.log('lib.js updated, regenerate signature...');
        } catch (err) {
            if (err.code !== 'ENOENT') {
                console.error('[Error] An unexpected error occurred:', err.message);
                throw err;
            } else {
                console.log('Write library signature...');
            }
        }

        const publicLibConfig = getPublicLibConfig(forceDist);
        const compiler = webpack(publicLibConfig);

        await new Promise(/** @param {function(void): void} resolve */(resolve) => {
            console.log();
            console.log('Compiling frontend libraries...');
            compiler.run((_error, stats) => {
                const output = stats?.toString(publicLibConfig.stats);
                if (output) {
                    console.log(output);
                    console.log();
                }
                compiler.close(() => {
                    resolve();
                });
            });
        });
        await fs.writeFile(sigPath, sig);
    };

    return devMiddleware;
}
