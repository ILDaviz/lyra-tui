#!/usr/bin/env bun
import { runCli, initTuiLogging, initEnvironment } from "@lyratui/core";
import { runTui } from "../src/index";

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
