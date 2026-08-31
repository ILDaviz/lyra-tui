import * as fs from "fs";
import * as path from "path";
import { getRepoPath, getLocalDateString } from "./helpers";

let isLoggingInitialized = false;
let logBuffer: string[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

const FLUSH_INTERVAL_MS = 500;

function getLogsDir(): string {
  return path.join(getRepoPath(), ".lyra", "logs");
}

function getLogFile(): string {
  return path.join(getLogsDir(), `lyra-${getLocalDateString()}.log`);
}

function formatLogLine(level: string, args: unknown[]): string {
  const msg = args
    .map((a) => {
      if (a instanceof Error) {
        return `${a.name}: ${a.message}\n${a.stack || ""}`;
      }
      if (typeof a === "object") {
        try {
          return JSON.stringify(a);
        } catch {
          return String(a);
        }
      }
      return String(a);
    })
    .join(" ");
  return `[${new Date().toISOString()}] [${level}] ${msg}\n`;
}

function appendLogLine(line: string): void {
  const logFile = getLogFile();
  if (!fs.existsSync(getLogsDir())) {
    fs.mkdirSync(getLogsDir(), { recursive: true });
  }
  fs.appendFileSync(logFile, line);
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushLogsAsync();
  }, FLUSH_INTERVAL_MS);
}

function flushLogsAsync(): void {
  if (logBuffer.length === 0) return;
  const lines = logBuffer;
  logBuffer = [];
  try {
    for (const line of lines) {
      appendLogLine(line);
    }
  } catch {}
}

export function flushLogsSync(): void {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (logBuffer.length === 0) return;
  const lines = logBuffer;
  logBuffer = [];
  try {
    for (const line of lines) {
      appendLogLine(line);
    }
  } catch {}
}

function redirectNativeStderr(logFile: string): void {
  try {
    const fd = fs.openSync(logFile, "a");
    // Under Bun on POSIX systems, redirect native stderr (fd 2) so C/C++ libraries (libvips, onnx, etc.)
    // do not print raw warning messages into the terminal and break TUI layout.
    if (typeof (globalThis as any).Bun !== "undefined") {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { dlopen, FFIType } = require("bun:ffi");
        const libName =
          process.platform === "darwin" ? "libSystem.B.dylib" : "libc.so.6";
        const libc = dlopen(libName, {
          dup2: {
            args: [FFIType.i32, FFIType.i32],
            returns: FFIType.i32,
          },
        });
        libc.symbols.dup2(fd, 2);
      } catch {}
    }
  } catch {}
}

export function initTuiLogging(): void {
  if (isLoggingInitialized) return;
  isLoggingInitialized = true;

  // Set environment variables to silence common native C/C++ library warnings
  process.env.VIPS_WARNING = "0";
  process.env.G_MESSAGES_DISABLE_COMPATIBILITY = "1";

  const logsDir = getLogsDir();
  const logFile = getLogFile();

  try {
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    // Redirect OS-level stderr to the log file for clean TUI rendering
    redirectNativeStderr(logFile);
  } catch {}

  const bufferLog = (level: string, ...args: unknown[]) => {
    try {
      logBuffer.push(formatLogLine(level, args));
      scheduleFlush();
    } catch {}
  };

  // Diagnostics stay synchronous so errors survive a crash; everything else
  // is buffered and flushed asynchronously to keep the event loop free.
  console.log = (...args: unknown[]) => bufferLog("INFO", ...args);
  console.info = (...args: unknown[]) => bufferLog("INFO", ...args);
  console.warn = (...args: unknown[]) => bufferLog("WARN", ...args);
  console.debug = (...args: unknown[]) => bufferLog("DEBUG", ...args);
  console.error = (...args: unknown[]) => {
    try {
      flushLogsSync();
    } catch {}
    try {
      appendLogLine(formatLogLine("ERROR", args));
    } catch {}
  };

  const flushOnSignal = (signal: NodeJS.Signals) => {
    flushLogsSync();
    // A listener cancels the default termination, so exit explicitly with the
    // conventional signal status.
    process.exit(signal === "SIGINT" ? 130 : 143);
  };
  process.once("SIGTERM", flushOnSignal);
  process.once("SIGINT", flushOnSignal);
  process.once("exit", flushOnSignal);
}
