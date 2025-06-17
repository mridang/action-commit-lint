import alias from '@rollup/plugin-alias';
import json from '@rollup/plugin-json';
import nodeResolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import esbuild from 'rollup-plugin-esbuild';
import { dirname, resolve as r, resolve as pathResolve } from 'node:path';
import { readFileSync } from 'node:fs';

const badJson = r('node_modules/@pnpm/npm-conf/lib/tsconfig.make-out.json');
const patched = pathResolve('src/load.patch.ts');

const spy = {
  name: 'commitlint-spy',
  resolveId(importee, importer) {
    if (importer && /node_modules\/@commitlint\/load/.test(importer)) {
      console.log('🕵️  commitlint →', importee, '← from', importer);
    }
    return null; // don’t change anything
  },
};

// ✨ New plugin to handle .hbs files
const inlineHbsPlugin = {
  name: 'inline-hbs',
  transform(code, id) {
    // Regex to find readFile(resolve(__dirname, '...hbs'), 'utf-8')
    const readFilePattern =
      /readFile\s*\(\s*resolve\s*\(\s*__dirname\s*,\s*(['"`])(.+?\.hbs)\1\s*\)\s*,\s*['"`]utf-8['"`]\s*\)/g;

    const newCode = code.replace(readFilePattern, (match, quote, hbsPath) => {
      try {
        // Resolve the full path to the .hbs file
        const filePath = r(dirname(id), hbsPath);
        // Read the file content
        const fileContent = readFileSync(filePath, 'utf-8');
        // Return the content as a properly escaped JavaScript string
        return JSON.stringify(fileContent);
      } catch (e) {
        this.warn(`Failed to inline '${hbsPath}' for ${id}: ${e.message}`);
        return match; // On error, return the original code
      }
    });

    if (newCode !== code) {
      return {
        code: newCode,
        map: null, // No source map needed for this simple replacement
      };
    }

    return null; // Return null if no changes were made
  },
};

const inlinePackageJsonPlugin = {
  name: 'inline-json', // Renamed for broader scope
  transform(code, id) {
    // Only process files within node_modules
    if (!id.includes('node_modules')) {
      return null;
    }

    // Regex to find `require('.../package.json')` or `require('.../commitlint.schema.json')`
    // The `(?:...)` creates a non-capturing group for the OR condition.
    const requirePattern =
      /require\((['"`])(.+?(?:package\.json|commitlint\.schema\.json))\1\)/g;

    const newCode = code.replace(
      requirePattern,
      (match, quote, requiredPath) => {
        try {
          // Resolve the full path to the required JSON file relative to the current module
          const filePath = r(dirname(id), requiredPath);
          // Read the content of the JSON file
          return readFileSync(filePath, 'utf-8');
        } catch (e) {
          // If inlining fails, warn the user and return the original match
          this.warn(
            `Failed to inline '${requiredPath}' for ${id}: ${e.message}`,
          );
          return match;
        }
      },
    );

    return {
      code: newCode,
      map: null, // No source map needed for this transformation as it's a simple text replacement
    };
  },
};

export default {
  input: 'src/main.ts',
  output: {
    file: 'dist/main.cjs',
    format: 'cjs',
    sourcemap: false,
    inlineDynamicImports: true,
  },
  onwarn(w, warn) {
    if (w.code !== 'CIRCULAR_DEPENDENCY') warn(w);
  },

  plugins: [
    spy,

    /* 1️⃣  alias first */
    alias({
      entries: [
        {
          find: './utils/load-plugin.js',
          replacement: patched,
        },
      ],
      log: (msg) => console.log('🔄  alias hit →', msg),
    }),

    /* 2️⃣  transpile TS (includes load.patch.ts) to ESM JS */
    esbuild({
      target: 'node20',
      tsconfig: './tsconfig.json',
      format: 'esm', // ← keep `import …` statements
    }),

    /* 3️⃣  custom virtual-module rule for empty JSON */
    {
      name: 'empty-json',
      resolveId(id) {
        return id === '\0empty-json' ? id : null;
      },
      load(id) {
        if (id === '\0empty-json') return 'export default {};';
      },
    },

    /* 4️⃣  your transform helpers */
    inlineHbsPlugin,
    inlinePackageJsonPlugin,

    /* 5️⃣  normal resolver / CJS / JSON chain */
    nodeResolve({
      preferBuiltins: true,
      exportConditions: ['node', 'default'],
    }),
    commonjs({
      include: [
        /node_modules/, // existing rule
      ],
      requireReturnsDefault: 'auto',
    }),
    json({ preferConst: true, compact: true }),
  ],

  external: [], // or list runtime externals here
};
