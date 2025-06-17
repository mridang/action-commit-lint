module.exports = {
  entry: ['src/index.ts', 'src/load.patch.ts'],
  ignoreDependencies: [
    '@semantic-release/.*?',
    '@commitlint/config-conventional',
  ],
};
