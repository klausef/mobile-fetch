/**
 * Metro, configured for a monorepo.
 *
 * The mobile app does not re-implement the fare, the geography, or the driver
 * arithmetic. Those live in `src/lib` and are imported straight out of the
 * repository root, so the peso the app quotes is the peso the server charges —
 * one formula, two platforms. Metro only looks outside the project directory if
 * it is told to, which is the whole reason for this file.
 */
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "..");

const config = getDefaultConfig(projectRoot);

// Watch the shared `src/` tree as well as the mobile app itself.
config.watchFolders = [workspaceRoot];

// Resolve packages from the mobile app first, then the repository root. The
// root holds Convex and its auth package; everything native comes from
// `mobile/node_modules`.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// `disableHierarchicalLookup` is what keeps this honest. Without it Metro walks
// up from every file it touches, and the web app's own `react` (19.2) is one
// directory away — two Reacts in one bundle is the "Invalid hook call" crash,
// and it would only show up on a screen that happened to import first. Expo's
// monorepo guide recommends exactly this pair of settings; `expo-doctor` flags
// any `metro.config.js` override as a mismatch on principle, so its one failing
// check on this project is expected.
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
