import alias from '@rollup/plugin-alias';
import json from '@rollup/plugin-json';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import esbuild from 'rollup-plugin-esbuild';
import { dirname, resolve as r } from 'node:path';
import { readFileSync } from 'node:fs';

const badJson = r('node_modules/@pnpm/npm-conf/lib/tsconfig.make-out.json');

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
  onwarn(warning, warn) {
    if (warning.code === 'CIRCULAR_DEPENDENCY') {
      return;
    }
    warn(warning);
  },
  plugins: [
    alias({ entries: [{ find: badJson, replacement: '\0empty-json' }] }),
    {
      name: 'empty-json',
      resolveId(id) {
        return id === '\0empty-json' ? id : null;
      },
      load(id) {
        if (id === '\0empty-json') return 'export default {};';
      },
    },

    inlinePackageJsonPlugin,

    resolve({ exportConditions: ['node', 'default'], preferBuiltins: true }),
    commonjs({
      include: /node_modules/,
      requireReturnsDefault: 'auto',
    }),
    json({
      preferConst: true,
      compact: true,
    }),
    esbuild({
      target: 'node20',
      tsconfig: './tsconfig.json',
    }),
  ],
  external: [],
};
