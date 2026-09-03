#!/usr/bin/env bun
/**
 * Copies the onnxruntime native library next to the compiled binary's
 * extracted binding. `bun build --compile` embeds onnxruntime_binding.node
 * and extracts it to a temp dir at runtime, but the sibling library it links
 * against (@rpath + @loader_path) is never referenced by JS, so it is not
 * embedded. Embedding it as a file asset lets the runtime pre-load it, so
 * dyld resolves the dependency without any rpath search. See
 * packages/tui/src/onnx-native-assets.ts for the runtime side.
 *
 * Runs automatically before every build:bin (npm pre-hook) and is also
 * invoked by scripts/build-bin.ts, which cannot rely on npm hooks.
 */
import * as fs from "fs/promises";
import * as path from "path";
import { createRequire } from "module";

const ROOT = path.join(import.meta.dir, "..");
const ASSETS_DIR = path.join(ROOT, "packages", "tui", "assets");
// Platform-neutral names: the main binary imports these statically as file
// assets, so they must exist on every build platform (dlopen ignores the
// file extension; the runtime extraction restores the platform names).
const STAGED_LIB_NAME = "onnxruntime-native-lib";
const STAGED_BINDING_NAME = "onnxruntime-binding.node";

async function onnxruntimeNodeDir(): Promise<string | null> {
  try {
    const requireFn = createRequire(import.meta.url);
    return path.dirname(requireFn.resolve("onnxruntime-node/package.json"));
  } catch {}
  // Bun's isolated linker keeps transitive deps in the .bun store, where
  // require.resolve cannot reach them; scan it directly.
  const storeDir = path.join(ROOT, "node_modules", ".bun");
  try {
    for (const entry of await fs.readdir(storeDir)) {
      if (!entry.startsWith("onnxruntime-node@")) continue;
      const candidate = path.join(
        storeDir,
        entry,
        "node_modules",
        "onnxruntime-node",
      );
      try {
        await fs.access(path.join(candidate, "package.json"));
        return candidate;
      } catch {}
    }
  } catch {}
  return null;
}

/**
 * Stages the platform's onnxruntime native library into packages/tui/assets
 * (gitignored). Exits gracefully when onnxruntime-node is absent: the built
 * binary then falls back to the WASM backend instead of failing the build.
 */
export async function stageOnnxDylib(): Promise<boolean> {
  const platform = process.platform;
  const arch = process.arch;

  if (platform !== "darwin" && platform !== "linux") {
    console.log(`No dylib staging needed for platform ${platform}`);
    return false;
  }

  const nodeDir = await onnxruntimeNodeDir();
  if (!nodeDir) {
    console.warn(
      "onnxruntime-node is not installed; the binary will fall back to the WASM embedding backend",
    );
    return false;
  }

  const binDir = path.join(nodeDir, "bin", "napi-v3", platform, arch);
  const sources =
    platform === "darwin"
      ? [path.join(binDir, "libonnxruntime.1.14.0.dylib")]
      : [path.join(binDir, "libonnxruntime.so.1.14.0")];
  // The native binding is staged too: the AI worker bundle loads it with a
  // relative `import.meta.require` at runtime (see
  // packages/tui/src/embedding-worker-entry.ts).
  sources.push(path.join(binDir, "onnxruntime_binding.node"));

  await fs.mkdir(ASSETS_DIR, { recursive: true });
  // Drop stale files from earlier naming schemes and previous platforms.
  for (const entry of await fs.readdir(ASSETS_DIR)) {
    if (
      entry === "embedding-worker.js.txt" ||
      entry === "embedding-ai-worker.js.txt" ||
      entry === STAGED_LIB_NAME ||
      entry === STAGED_BINDING_NAME
    ) {
      continue;
    }
    await fs.rm(path.join(ASSETS_DIR, entry), { force: true });
  }
  const targets = [STAGED_LIB_NAME, STAGED_BINDING_NAME];
  for (const [index, source] of sources.entries()) {
    const target = path.join(ASSETS_DIR, targets[index]);
    try {
      await fs.copyFile(source, target);
      console.log(`Staged ${source} -> ${target}`);
    } catch (err) {
      console.warn(
        `Could not stage ${source} (WASM fallback will be used):`,
        err instanceof Error ? err.message : err,
      );
      return false;
    }
  }
  return true;
}

if (import.meta.main) {
  await stageOnnxDylib();
}
