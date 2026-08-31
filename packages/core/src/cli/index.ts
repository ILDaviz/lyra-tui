import { Command, CommanderError } from "commander";
import { registerStatusCommand } from "./commands/status";
import { registerSyncCommand } from "./commands/sync";
import { registerTodoCommand } from "./commands/todos";
import { registerNotesCommand } from "./commands/notes";
import { registerLinksCommand } from "./commands/links";
import { registerGraphCommand } from "./commands/graph";
import { ensureDirs } from "../helpers";
import { print, printError, setCliColorEnabled } from "./output";

function getVersion(): string {
  return (process.env.LYRA_VERSION ?? "0.1.0").replace(/^v/, "");
}

export function createCliProgram(): Command {
  const program = new Command();

  program
    .name("lyra")
    .description("📝 Lyra TUI & CLI - Terminal-based notes & knowledge manager")
    .version(`Lyra v${getVersion()}`, "-v, --version", "Show Lyra version")
    .helpOption("-h, --help", "Display this help message")
    .option("--no-color", "Disable colored output")
    .configureOutput({
      writeOut: (str) => print(str.trimEnd()),
      writeErr: (str) => printError(str.trimEnd()),
    });

  registerStatusCommand(program);
  registerSyncCommand(program);
  registerTodoCommand(program);
  registerNotesCommand(program);
  registerLinksCommand(program);
  registerGraphCommand(program);

  return program;
}

export async function runCli(argv: string[] = []): Promise<boolean> {
  if (argv.length === 0) {
    return false;
  }

  const previousCliMode = process.env.LYRA_CLI_MODE;
  process.env.LYRA_CLI_MODE = "1";

  try {
    await ensureDirs();
    setCliColorEnabled(argv.includes("--no-color") ? false : undefined);

    const program = createCliProgram();
    program.exitOverride();
    await program.parseAsync(argv, { from: "user" });
  } catch (err: any) {
    if (err instanceof CommanderError) {
      if (
        err.code === "commander.helpDisplayed" ||
        err.code === "commander.version"
      ) {
        return true;
      }
      printError(`\x1b[31mError:\x1b[0m ${err.message}`);
      process.exitCode = 1;
      return true;
    }
    printError(`\x1b[31mError:\x1b[0m ${err.message || err}`);
    process.exitCode = 1;
  } finally {
    setCliColorEnabled();
    if (previousCliMode === undefined) {
      delete process.env.LYRA_CLI_MODE;
    } else {
      process.env.LYRA_CLI_MODE = previousCliMode;
    }
  }

  return true;
}

export * from "./commands/status";
export * from "./commands/sync";
export * from "./commands/todos";
export * from "./commands/notes";
export * from "./commands/links";
export * from "./commands/graph";
export * from "./output";
