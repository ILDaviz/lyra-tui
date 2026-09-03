/**
 * Loads @xenova/transformers. Lives in its own module because only the
 * embedding AI worker may import it: the main thread never touches the
 * model, so the bundler must keep transformers (and the onnxruntime native
 * backend) out of the main-thread bundle.
 *
 * Two-stage loader: the main entry statically imports onnxruntime-node,
 * whose binding must find libonnxruntime next to itself (@loader_path);
 * when that dlopen fails the whole import throws. In that case the browser
 * bundle is loaded instead: it uses the pure-WASM backend and never touches
 * onnxruntime-node.
 */

/** Version of onnxruntime-web shipped by @xenova/transformers 2.17.2. */
const ORT_WEB_VERSION = "1.14.0";

export interface TransformersModule {
  pipeline: (...args: any[]) => Promise<any>;
  env: any;
}

export async function loadTransformers(): Promise<{
  transformers: TransformersModule;
  backend: "native" | "wasm";
}> {
  let nativeError: unknown;
  try {
    const mod: any = await import("@xenova/transformers");
    const transformers: any =
      mod.default?.pipeline || mod.default?.env ? mod.default : mod;
    if (typeof transformers.pipeline !== "function") {
      throw new Error("Transformers pipeline is not available");
    }
    return { transformers, backend: "native" };
  } catch (err) {
    nativeError = err;
    console.warn(
      "Native transformers backend unavailable, trying WASM fallback:",
      err instanceof Error ? err.message : err,
    );
  }

  // The browser bundle reads the `self` global at import time, which does
  // not exist under Node: alias it to globalThis so the WASM fallback also
  // works outside Bun.
  (globalThis as any).self ??= globalThis;

  const mod: any =
    await import("@xenova/transformers/dist/transformers.min.js");
  const transformers: any =
    mod.default?.pipeline || mod.default?.env ? mod.default : mod;
  if (typeof transformers.pipeline !== "function") {
    throw new Error(
      `Transformers pipeline is not available (native backend failed: ${
        nativeError instanceof Error ? nativeError.message : String(nativeError)
      })`,
    );
  }
  // ort-web resolves wasm files from node_modules when running locally,
  // which does not exist inside the compiled binary: point it at the CDN
  // matching the bundled onnxruntime-web version.
  const wasm = ((transformers.env.backends.onnx ??= {}).wasm ??= {});
  wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_WEB_VERSION}/dist/`;
  return { transformers, backend: "wasm" };
}
