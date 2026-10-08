/**
 * Metro, configured for NativeWind and a monorepo.
 *
 * `withNativeWind` compiles `src/theme/global.css` into the classes the app
 * uses. The resolver isolation is deliberate: the repository root is a web
 * workspace with its own React, and Metro must not walk up into it — two
 * Reacts in one bundle is the "Invalid hook call" crash.
 */
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [projectRoot];
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, "node_modules")];
config.resolver.disableHierarchicalLookup = true;

module.exports = withNativeWind(config, { input: "./src/theme/global.css" });
