#!/usr/bin/env bun
/**
 * Builds the compiled `dist/lyra` binary.
 *
 * Uses the Bun.build API instead of the CLI because the native embedding
 * backend needs adjustments the CLI cannot express:
 *
 * 1. Bundles both embedding workers (packages/core/src/services/
 *    embedding-worker.ts for SQLite, embedding-ai-worker.ts for model
 *    inference) into packages/tui/assets/*.js.txt. The compiled binary
 *    cannot spawn a worker from the $bunfs virtual filesystem, so the
 *    bundles are embedded as file assets and extracted to real temp files
 *    at runtime (see packages/tui/src/embedding-worker-entry.ts). Built
 *    before the main binary embeds them.
 *
 * 2. Stages the onnxruntime binding and dylib (stageOnnxDylib(), from
 *    scripts/prepare-onnx-dylib.ts, invoked here directly because npm
 *    pre-hooks are not guaranteed across runners). The main binary embeds
 *    them as file assets and the runtime extraction places them next to the
 *    AI worker in the relative layout ort-node expects (@loader_path).
 *
 * 3. A plugin stubs the sharp package: @xenova/transformers statically
 *    imports it (image models only), its native libraries do not survive
 *    --compile extraction, and its failure kills the whole import, taking
 *    the onnxruntime-node backend down with it. Text embeddings never touch
 *    sharp (packages/tui/src/sharp-stub.ts).
 *
 * Usage:
 *   bun scripts/build-bin.ts [--entry <file>] [--outfile <file>]
 *                            [--define 'process.env.KEY=jsonValue']
 * (--entry/--outfile positional fallbacks are kept for probe builds.)
 */
import * as fs from "fs/promises";
import * as path from "path";
import { stageOnnxDylib } from "./prepare-onnx-dylib";

const root = path.join(import.meta.dir, "..");

const args = process.argv.slice(2);
let entryArg: string | undefined;
let outArg: string | undefined;
const defines: Record<string, string> = {};
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--define") {
    const key = args[++i];
    const value = args[++i];
    if (!key || value === undefined) {
      console.error("--define requires a key and a JSON value");
      process.exit(1);
    }
    defines[key] = value;
  } else if (args[i] === "--entry") {
    entryArg = args[++i];
  } else if (args[i] === "--outfile") {
    outArg = args[++i];
  } else if (!entryArg) {
    entryArg = args[i];
  } else {
    outArg = args[i];
  }
}

const entrypoint = entryArg
  ? path.resolve(root, entryArg)
  : path.join(root, "packages", "tui", "bin", "lyra-tui.ts");
const outfile = outArg
  ? path.resolve(root, outArg)
  : path.join(root, "dist", "lyra");

const staged = await stageOnnxDylib();
if (!staged) {
  console.warn(
    "Building without the embedded onnxruntime library: the binary will use the WASM embedding backend",
  );
}
// The main binary statically imports these as file assets, so they must
// exist even when staging failed: empty placeholders make the AI worker
// fail at runtime (dlopen) and fall back to the WASM backend instead of
// breaking the build.
const assetsDir = path.join(root, "packages", "tui", "assets");
for (const name of ["onnxruntime-native-lib", "onnxruntime-binding.node"]) {
  const asset = path.join(assetsDir, name);
  try {
    await fs.access(asset);
  } catch {
    await Bun.write(asset, "");
    console.warn(`Staged empty placeholder for missing ${name}`);
  }
}

const sharpStub = await Bun.file(
  path.join(root, "packages", "tui", "src", "sharp-stub.ts"),
).text();

// 1a. DB embedding worker bundle, embedded by the main build as a file asset.
const workerAssetPath = path.join(assetsDir, "embedding-worker.js.txt");
const workerBuild = await Bun.build({
  entrypoints: [
    path.join(
      root,
      "packages",
      "core",
      "src",
      "services",
      "embedding-worker.ts",
    ),
  ],
  target: "bun",
  minify: true,
});
if (!workerBuild.success) {
  for (const log of workerBuild.logs) console.error(log);
  process.exit(1);
}
// Bun.build returns in-memory outputs: write the bundle to the asset path.
for (const output of workerBuild.outputs) {
  await Bun.write(workerAssetPath, output);
}
console.log("Bundled embedding worker");

// 1b. AI worker (model inference) bundle. onnxruntime-node is bundled into
// it: the JS loads the binding with a relative import.meta.require, so the
// staged binding + dylib are extracted next to it at runtime in the layout
// ort-node expects (see packages/tui/src/embedding-worker-entry.ts). The
// sharp stub is needed here too: transformers imports sharp statically.
const aiWorkerAssetPath = path.join(assetsDir, "embedding-ai-worker.js.txt");
const aiWorkerBuild = await Bun.build({
  entrypoints: [
    path.join(
      root,
      "packages",
      "core",
      "src",
      "services",
      "embedding-ai-worker.ts",
    ),
  ],
  target: "bun",
  minify: true,
  plugins: [
    {
      name: "sharp-stub",
      setup(build) {
        build.onLoad({ filter: /[\\/]node_modules[\\/]sharp[\\/]/ }, () => ({
          contents: sharpStub,
          loader: "js",
        }));
      },
    },
  ],
});
if (!aiWorkerBuild.success) {
  for (const log of aiWorkerBuild.logs) console.error(log);
  process.exit(1);
}
for (const output of aiWorkerBuild.outputs) {
  await Bun.write(aiWorkerAssetPath, output);
}
console.log("Bundled embedding AI worker");

const result = await Bun.build({
  entrypoints: [entrypoint],
  target: "bun",
  minify: true,
  compile: { outfile },
  define: defines,
  plugins: [
    {
      name: "sharp-stub",
      setup(build) {
        build.onLoad({ filter: /[\\/]node_modules[\\/]sharp[\\/]/ }, () => ({
          contents: sharpStub,
          loader: "js",
        }));
      },
    },
  ],
});

if (!result.success) {
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}
console.log(`Built ${outfile}`);
