import fs from "fs";
import typescript from "@rollup/plugin-typescript";
import terser from "@rollup/plugin-terser";
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import replace from '@rollup/plugin-replace';

export const nodeResolve = resolve({
 browser: true,
 preferBuiltins: false,
});

const create = (file, format, plugins = []) => ({
 input: "build/mlcontour.js",
 output: {
  name: "mlcontour",
  file,
  format,
  intro: fs.readFileSync("build/bundle_prelude.js", "utf8"),
 },
 treeshake: false,
 plugins,
});

/** @type {import('rollup').RollupOptions[]} */
export default (args) => {
  const isNode = args.configProduction !== true && process.env.NODE_ENV !== 'production';

  const basePlugins = [nodeResolve, typescript(), commonjs()];
  const finalPlugins = [...basePlugins, replace({
    'process.env.BUILD_TARGET': isNode ? JSON.stringify('node'): JSON.stringify('web'),
    preventAssignment: true
    })
  ]
 return [
  {
   input: ["src/index.ts", "src/worker.ts"],
   output: {
    dir: "dist/staging",
    format: "amd",
    indent: false,
    chunkFileNames: "shared.js",
    minifyInternalExports: true,
   },
   onwarn: (message) => {
    console.error(message);
    throw message;
   },
   treeshake: true,
   plugins: finalPlugins,
  },
  create("dist/index.cjs", "cjs", finalPlugins),
  create("dist/index.mjs", "esm", finalPlugins),
  create("dist/index.js", "umd", finalPlugins),
  create("dist/index.min.js", "umd", [...finalPlugins, terser()]),
 ];
};
