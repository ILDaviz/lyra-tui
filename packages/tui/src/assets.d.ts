// Bun "file" assets (import ... with { type: "file" }) resolve to the path
// of the extracted file at runtime; see src/embedding-worker-entry.ts. The
// staged files live in assets/ (gitignored, produced by scripts/build-bin.ts
// and scripts/prepare-onnx-dylib.ts), so only wildcard declarations exist.
declare module "*embedding-worker.js.txt" {
  const assetPath: string;
  export default assetPath;
}

declare module "*embedding-ai-worker.js.txt" {
  const assetPath: string;
  export default assetPath;
}

declare module "*onnxruntime-binding.node" {
  const assetPath: string;
  export default assetPath;
}

declare module "*onnxruntime-native-lib" {
  const assetPath: string;
  export default assetPath;
}
