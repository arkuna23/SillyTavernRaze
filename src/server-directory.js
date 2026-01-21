import { dirname } from 'node:path';
import { packageDirectory } from 'pkg-dir';
import { chdir } from 'node:process'
import { fileURLToPath } from 'url';

let dir;
if (globalThis.__COMPILED__) {
    if (typeof Deno !== 'undefined') {
        console.log("Deno environment")
        dir = Deno.cwd()
    } else {
        dir = dirname(fileURLToPath(import.meta.url))
        console.log("import dir: ", dir)
        chdir(dir)
    }
} else {
    dir = await packageDirectory() ?? dirname(import.meta.dirname)
}

export const serverDirectory = dir;

