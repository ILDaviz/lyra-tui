import { parentPort, workerData } from "worker_threads";
import { EmbeddingDb } from "./embedding-db-core";

interface WorkerRequest {
  id: number;
  type: "load" | "replaceNote" | "removeNote" | "search" | "getIndexedFiles" | "save";
  dimension?: number;
  relativeFilePath?: string;
  docs?: any[];
  searchParams?: any;
  limit?: number;
}

if (!parentPort) {
  throw new Error("embedding-worker must be started as a worker thread");
}

const port = parentPort;
const db = new EmbeddingDb(workerData.indexPath as string);

// Messages are handled strictly sequentially: Orama state is mutated in the
// exact order the main thread issued requests.
let chain: Promise<void> = Promise.resolve();

function handle(msg: WorkerRequest): Promise<any> {
  switch (msg.type) {
    case "load":
      return db.load(msg.dimension ?? 384);
    case "replaceNote":
      return db.replaceNote(msg.relativeFilePath!, msg.docs ?? []);
    case "removeNote":
      return db.removeNote(msg.relativeFilePath!);
    case "search":
      return db.search(msg.searchParams, msg.limit ?? 10);
    case "getIndexedFiles":
      return db.getIndexedFiles();
    case "save":
      return db.save();
    default:
      throw new Error(`Unknown message type: ${(msg as any).type}`);
  }
}

port.on("message", (msg: WorkerRequest) => {
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
