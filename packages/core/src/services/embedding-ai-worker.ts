import { parentPort, workerData } from "worker_threads";
import { loadTransformers } from "./embedding-transformers";

interface AiWorkerRequest {
  id: number;
  type: "load" | "embed" | "close";
  texts?: string[];
  /** E5 input type: prefixed onto texts that are not already formatted. */
  prefix?: "query" | "passage";
}

const MODEL_ID = "Xenova/multilingual-e5-small";

if (!parentPort) {
  throw new Error("embedding-ai-worker must be started as a worker thread");
}

const port = parentPort;
const cacheDir = workerData.cacheDir as string | undefined;

let extractor: any = null;

function formatText(text: string, prefix: "query" | "passage"): string {
  return text.startsWith("query: ") || text.startsWith("passage: ")
    ? text
    : `${prefix}: ${text}`;
}

/**
 * Splits a [N, D] batch tensor into N vectors. Multilingual-e5 outputs 384
 * dimensions; the actual dim always comes from the tensor itself.
 */
function toVectors(output: any, count: number): number[][] {
  const data = output?.data;
  if (!(data instanceof Float32Array) && !Array.isArray(data)) {
    throw new Error("Unexpected embedding output shape");
  }
  const total = data.length;
  if (count === 0) return [];
  if (total % count !== 0) {
    throw new Error("Embedding output does not match the batch size");
  }
  const dim = total / count;
  const vectors: number[][] = [];
  for (let i = 0; i < count; i++) {
    vectors.push(Array.from(data.slice(i * dim, (i + 1) * dim)));
  }
  return vectors;
}

// Messages are handled strictly sequentially: requests are answered in the
// exact order the main thread issued them.
let chain: Promise<void> = Promise.resolve();

function handle(msg: AiWorkerRequest): Promise<any> {
  switch (msg.type) {
    case "load": {
      return (async () => {
        const { transformers, backend } = await loadTransformers();
        if (transformers.env && cacheDir) {
          transformers.env.cacheDir = cacheDir;
        }
        extractor = await transformers.pipeline("feature-extraction", MODEL_ID);
        return { backend };
      })();
    }
    case "embed": {
      return (async () => {
        if (!extractor) {
          throw new Error("AI worker model is not loaded");
        }
        const texts = (msg.texts ?? []).map((text) =>
          formatText(String(text), msg.prefix ?? "passage"),
        );
        if (texts.length === 0) return [];
        // A single batched forward pass for the whole set: the ONNX runtime
        // parallelizes across cores, so one large batch is much faster than
        // one pass per text.
        const output = await extractor(texts, {
          pooling: "mean",
          normalize: true,
        });
        return toVectors(output, texts.length);
      })();
    }
    case "close": {
      return (async () => {
        extractor = null;
        return undefined;
      })();
    }
    default:
      throw new Error(`Unknown message type: ${(msg as any).type}`);
  }
}

port.on("message", (msg: AiWorkerRequest) => {
  chain = chain.then(async () => {
    try {
      const result = await handle(msg);
      port.postMessage({ id: msg.id, ok: true, result });
    } catch (err: any) {
      port.postMessage({
        id: msg.id,
        ok: false,
        error: err?.message || String(err),
      });
    }
  });
});
