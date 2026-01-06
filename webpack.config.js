import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import { EsbuildPlugin } from 'esbuild-loader';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Get all HTML files from the public folder
const publicDir = path.resolve(__dirname, 'public');
const htmlFiles = fs.readdirSync(publicDir).filter(file => file.endsWith('.html'));

export default {
    context: publicDir,
    entry: path.resolve(publicDir, 'index.js'),
    mode: 'production',

    // Set target to support modern JavaScript features including top-level await
    target: ['web', 'es2022'],

    output: {
        path: path.resolve(__dirname, 'public/dist'),
        filename: 'js/[name].[contenthash:8].js',
        clean: true, // Automatically clean the dist folder before building
        module: true, // Use ES module output format instead of iife
        chunkFormat: 'module', // Use module chunk format
        library: {
            type: 'module', // Output as ES module
        },
        environment: {
            module: true,
            dynamicImport: true,
        },
    },

    // Enable top-level await and output as ES modules
    experiments: {
        topLevelAwait: true,
        outputModule: true, // Enable ES module output
    },

    resolveLoader: {
        modules: [path.resolve(__dirname, 'node_modules')],
    },

    module: {
        rules: [
            {
                test: /\.html$/i,
                loader: 'html-loader',
                options: {
                    // Process <script src="..."> and <link href="..."> tags in HTML
                    sources: {
                        list: [
                            { tag: 'link', attribute: 'href', type: 'src' },
                            { tag: 'script', attribute: 'src', type: 'src' },
                        ],
                    },
                },
            },
            {
                test: /\.m?js$/i, // Supports both .js and .mjs files
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: [
                            [
                                '@babel/preset-env',
                                {
                                    targets: '> 0.25%, not dead',
                                    modules: false, // Let webpack handle module transformation
                                    useBuiltIns: 'usage',
                                    corejs: 3,
                                },
                            ],
                        ],
                        plugins: [
                            '@babel/plugin-syntax-top-level-await', // Support top-level await syntax
                        ],
                    },
                },
            },
        ],
    },

    optimization: {
        minimize: true,
        minimizer: [
            new EsbuildPlugin({
                target: 'es2022', // Match the webpack target to support top-level await
                css: true,
                format: 'esm', // Output as ES module format
            }),
        ],
    },

    plugins: [
        // Dynamically create HtmlWebpackPlugin instances for each HTML file
        ...htmlFiles.map(file =>
            new HtmlWebpackPlugin({
                template: path.join(publicDir, file),
                filename: file, // Keep the same filename in public/dist
                inject: 'body', // Inject JS at the end of the body
                scriptLoading: 'module', // Use <script type="module"> for injected scripts
            }),
        ),
    ],
};
