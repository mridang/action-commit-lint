// moo.mjs  ─ you run this from /Users/mridang/Junk/scratch.git
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';

const require      = createRequire(import.meta.url);      // bring back require()
const resolveFrom  = require('resolve-from');             // CJS helper

// 1. Find the real entry file *as if* we were inside cwd
const entryFile = resolveFrom(process.cwd(),
  '@mridang/commitlint-plugin-conditionals');

// 2. Convert path → URL and load with import()   (works for CJS **or** ESM targets)
const plugin = await import(pathToFileURL(entryFile).href);
console.log(plugin);
