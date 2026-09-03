import { describe, expect, it, vi } from "vitest";

// The native entry statically resolves onnxruntime-node; make that import
// fail so loadTransformers falls back to the WASM browser bundle, mimicking
// the dlopen failure inside the compiled binary.
vi.mock("@xenova/transformers", () => {
  throw new Error("simulated onnxruntime-node dlopen failure");
});

import { loadTransformers } from "../src/services/embedding-transformers";

describe("loadTransformers", () => {
  it("falls back to the WASM bundle when the native backend fails", async () => {
    const { transformers, backend } = await loadTransformers();
    expect(backend).toBe("wasm");
    expect(typeof transformers.pipeline).toBe("function");
    expect(String(transformers.env.backends.onnx.wasm.wasmPaths)).toContain(
      "onnxruntime-web",
    );
  });
});
