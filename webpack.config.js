import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import TerserPlugin from 'terser-webpack-plugin';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 1. Get all HTML files from the public folder
const publicDir = path.resolve(__dirname, 'public');
const htmlFiles = fs.readdirSync(publicDir).filter(file => file.endsWith('.html'));

export default {
    context: publicDir,
    entry: path.resolve(publicDir, 'index.js'),
    mode: 'production',
    output: {
        path: path.resolve(__dirname, 'public/dist'),
        filename: 'js/[name].[contenthash:8].js',
        clean: true, // Automatically clean the dist folder before building
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
                    // This tells webpack to process <script src="..."> and <link href="..."> in HTML
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
                                    targets: '> 0.25%, not dead', // Browser compatibility target
                                    useBuiltIns: 'usage', // Inject polyfills as needed
                                    corejs: 3,
                                },
                            ],
                        ],
                    },
                },
            },
        ],
    },
    optimization: {
        minimize: true,
        minimizer: [
            new TerserPlugin({
                terserOptions: {
                    ecma: 2020, // Support ES6+ syntax for minification
                    compress: true,
                    mangle: true,
                },
            }),
        ],
    },
    plugins: [
    // 2. Dynamically create a plugin instance for each HTML file
        ...htmlFiles.map(file =>
            new HtmlWebpackPlugin({
                template: path.join(publicDir, file),
                filename: file, // Keep the same filename in public/dist
                inject: 'body', // Inject JS at the end of the body
            }),
        ),
    ],
};
