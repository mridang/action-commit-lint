export default {
  entry: ['src/main.ts', 'src/load.patch.ts'],
  ignoreDependencies: [
    /^@semantic-release\//,
    'semantic-release-major-tag',
    /^@commitlint\/config-conventional$/,
  ],
};
