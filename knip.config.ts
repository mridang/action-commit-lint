/**
 * @file Knip configuration that declares the entry points and the dependencies
 * knip should not report as unused.
 */
export default {
  entry: ['src/main.ts', 'src/load.patch.ts'],
  ignoreDependencies: [
    /^@semantic-release\//,
    'semantic-release-major-tag',
    /^@commitlint\/config-conventional$/,
  ],
};
