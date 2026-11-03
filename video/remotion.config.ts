import { Config } from "@remotion/cli/config";
import path from "node:path";
Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
// One React: the parent repo has its own copy, and a second one keeps the root from mounting.
Config.overrideWebpackConfig((c) => ({ ...c, resolve: { ...c.resolve, alias: { ...(c.resolve?.alias || {}), react: path.resolve("node_modules/react"), "react-dom": path.resolve("node_modules/react-dom"), "react/jsx-runtime": path.resolve("node_modules/react/jsx-runtime") } } }));
