import { dirname } from 'node:path';
import { packageDirectory } from 'pkg-dir';


export const serverDirectory = await packageDirectory() ?? dirname(import.meta.dirname);
