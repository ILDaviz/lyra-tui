export default new Proxy(
  {},
  {
    get() {
      throw new Error(
        "sharp is stubbed in the compiled binary: image processing is unavailable (text embeddings do not need it)",
      );
    },
  },
);
