// Flat ESLint config for the Expo app. Uses Expo's shared config as the base.
// The portal and Cloud Functions are separate packages and are linted (or not)
// on their own; here we scope to the mobile/web app + shared code + tests.
const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  {
    ignores: [
      'node_modules/**',
      'web-build/**',
      'dist/**',
      'portal/**',
      'functions/**',
      'landing/**',
      '.expo/**',
      'android/**',
      'ios/**',
      'scripts/**',
    ],
  },
  {
    rules: {
      // Nudge, don't block — large files are a smell, not an error.
      'max-lines': ['warn', { max: 700, skipBlankLines: true, skipComments: true }],
      // Apostrophes in user-facing copy are fine and everywhere in this app.
      'react/no-unescaped-entities': 'off',
    },
  },
];
