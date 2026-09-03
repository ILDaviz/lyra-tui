/**
 * Resolves worker entrypoints for `new Worker(...)`.
 *
 * `bun build --compile` cannot spawn a worker from the $bunfs virtual
 * filesystem (`ModuleNotFound resolving "/$bunfs/root/*.ts"`), so each
 * worker is bundled to packages/tui/assets/<name>.js.txt at build time
 * (scripts/build-bin.ts; the .js.txt extension keeps the bundler from
 * treating it as a module) and embedded as a file asset. Inside the
 * compiled binary the assets resolve to $bunfs paths: they are copied to
 * real temp files which are then spawnable.
 *
 * - DB worker: single JS file, extracted to $TMPDIR/lyra-workers/.
 * - AI worker: its bundle loads the onnxruntime binding with a relative
 *   `import.meta.require("../bin/napi-v3/<platform>/<arch>/...")`, so the
 *   binding (and the dylib it links against, resolved via @loader_path)
 *   must sit next to it in the exact relative layout ort-node expects:
 *
 *       lyra-ort/worker/embedding-ai-worker.js
 *       lyra-ort/bin/napi-v3/<platform>/<arch>/onnxruntime_binding.node
 *       lyra-ort/bin/napi-v3/<platform>/<arch>/<libonnxruntime.*>
 *
 * Returns null outside the compiled binary (the direct TypeScript URLs work
 * under `bun run`) or when extraction fails: the callers then fall back
 * (in-thread database for the DB worker, fulltext-only for the AI worker).
 */
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";

const ROOT_TMP_DIR = "lyra-workers";
const ORT_DIR = "lyra-ort";
const resolvedByAsset = new Map<string, string | null>();

// Static specifiers are required: the bundler embeds file assets at build
// time and cannot follow dynamic paths.
async function importAsset(name: string): Promise<string> {
  switch (name) {
    case "embedding-ai-worker.js.txt":
      return (
        await import("../assets/embedding-ai-worker.js.txt", {
          with: { type: "file" },
        })
      ).default;
    case "onnxruntime-binding.node":
      return (
        await import("../assets/onnxruntime-binding.node", {
          with: { type: "file" },
        })
      ).default;
    case "onnxruntime-native-lib":
      return (
        await import("../assets/onnxruntime-native-lib", {
          with: { type: "file" },
        })
      ).default;
    default:
      return (
        await import("../assets/embedding-worker.js.txt", {
          with: { type: "file" },
        })
      ).default;
  }
}

async function extractAsset(assetName: string, target: string): Promise<void> {
  const assetPath = await importAsset(assetName);
  if (!assetPath.includes("$bunfs")) {
    throw new Error("not running inside the compiled binary");
  }
  const content = await fs.readFile(assetPath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content);
}

async function resolveDbWorkerEntry(): Promise<string | null> {
  const assetName = "embedding-worker.js.txt";
  const target = path.join(
    os.tmpdir(),
    ROOT_TMP_DIR,
    assetName.replace(/\.txt$/, ""),
  );
  try {
    await extractAsset(assetName, target);
    return `file://${target}`;
  } catch {
    return null;
  }
}

async function resolveAiWorkerEntry(): Promise<string | null> {
  const platform = process.platform;
  const arch = process.arch;
  const ortBase = path.join(os.tmpdir(), ORT_DIR);
  const workerTarget = path.join(ortBase, "worker", "embedding-ai-worker.js");
  const nativeDir = path.join(ortBase, "bin", "napi-v3", platform, arch);
  const bindingTarget = path.join(nativeDir, "onnxruntime_binding.node");
  // The file name must match the dependency name the binding links against:
  // dyld resolves it via @loader_path.
  const libName =
    platform === "darwin"
      ? "libonnxruntime.1.14.0.dylib"
      : "libonnxruntime.so.1.14.0";
  const libTarget = path.join(nativeDir, libName);

  try {
    await extractAsset("embedding-ai-worker.js.txt", workerTarget);
    await extractAsset("onnxruntime-binding.node", bindingTarget);
    await extractAsset("onnxruntime-native-lib", libTarget);
    return `file://${workerTarget}`;
  } catch {
    return null;
  }
}

export async function resolveWorkerEntry(
  assetName: string,
): Promise<string | null> {
  if (resolvedByAsset.has(assetName)) {
    return resolvedByAsset.get(assetName)!;
  }
  const resolved =
    assetName === "embedding-ai-worker.js.txt"
      ? await resolveAiWorkerEntry()
      : await resolveDbWorkerEntry();
  resolvedByAsset.set(assetName, resolved);
  return resolved;
}
