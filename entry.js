import { chdir } from 'node:process'

globalThis.__COMPILED__ = true

if (typeof Deno !== 'undefined') {
    chdir(Deno.cwd())
}

await import("./server.js")
