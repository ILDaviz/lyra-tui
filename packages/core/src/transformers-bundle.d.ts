// The browser bundle of @xenova/transformers has no bundled type
// declarations; it is only imported as the WASM fallback of loadTransformers
// (see services/embedding.ts), so an implicit any surface is enough.
declare module "@xenova/transformers/dist/transformers.min.js" {
  const transformers: any;
  export default transformers;
}
