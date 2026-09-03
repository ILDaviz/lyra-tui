#!/usr/bin/env bun
import {
  runCli,
  initTuiLogging,
  initEnvironment,
  EmbeddingService,
} from "@lyratui/core";
import { runTui } from "../src/index";
import { resolveWorkerEntry } from "../src/embedding-worker-entry";

initEnvironment();

process.env.VIPS_WARNING = "0";
process.env.G_MESSAGES_DISABLE_COMPATIBILITY = "1";

process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED REJECTION:", reason);
  process.exit(1);
});

async function main() {
  // Lets the embedding services spawn their workers from real temp files in
  // the compiled binary ($bunfs virtual paths are not spawnable): the DB
  // worker is a single JS file, the AI worker extracts together with the
  // onnxruntime binding and dylib in the layout ort-node expects.
  EmbeddingService.setWorkerEntryProvider(resolveWorkerEntry);

  const args = process.argv.slice(2);
  const isCli = args.length > 0;

  if (isCli) {
    await runCli(args);
  } else {
    initTuiLogging();
    await runTui();
  }
}

main().catch((err) => {
  console.error("Failed to run Lyra:", err);
  process.exit(1);
});
