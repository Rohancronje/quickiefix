// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// The web portal (portal/) is a separate Vite app. Keep Metro out of it so its
// node_modules don't collide with the Expo app's module graph.
config.resolver.blockList = [/portal[\\/].*/];
config.watchFolders = [__dirname];

module.exports = config;
