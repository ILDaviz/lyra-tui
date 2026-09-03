import { spawnSync } from "child_process";

const SERVICE_NAME = "lyra-tui";

export type SecretStoreKind = "security" | "secret-tool" | "powershell";

export interface SecretCommand {
  command: string;
  args: string[];
  input?: string;
  decodeBase64?: boolean;
}

export interface SecretCommandResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

export type SecretExecutor = (
  command: string,
  args: string[],
  input?: string,
) => SecretCommandResult;

let executorOverride: SecretExecutor | null = null;
let availabilityCache: boolean | null = null;

function sanitizeKeyPart(value: string): string {
  return value.replace(/'/g, "");
}

function platformKind(): SecretStoreKind | null {
  if (process.platform === "darwin") return "security";
  if (process.platform === "linux") return "secret-tool";
  if (process.platform === "win32") return "powershell";
  return null;
}

function runResult(
  command: string,
  args: string[],
  input?: string,
): SecretCommandResult {
  if (executorOverride) {
    return executorOverride(command, args, input);
  }
  const result = spawnSync(command, args, { input, encoding: "utf-8" });
  return {
    status: result.status,
    stdout: typeof result.stdout === "string" ? result.stdout : "",
    stderr: typeof result.stderr === "string" ? result.stderr : "",
  };
}

export function isKeychainAvailable(): boolean {
  if (executorOverride) return true;
  if (availabilityCache !== null) return availabilityCache;
  const kind = platformKind();
  if (!kind) {
    availabilityCache = false;
    return false;
  }
  if (kind === "powershell") {
    availabilityCache = true;
    return true;
  }
  const binary = kind === "security" ? "security" : "secret-tool";
  const probe = spawnSync("which", [binary], { encoding: "utf-8" });
  availabilityCache = probe.status === 0;
  return availabilityCache;
}

function buildStoreCommand(
  kind: SecretStoreKind,
  key: string,
  value: string,
): SecretCommand {
  if (kind === "security") {
    return {
      command: "security",
      args: ["add-generic-password", "-U", "-a", key, "-s", SERVICE_NAME, "-w"],
      input: value,
    };
  }
  if (kind === "secret-tool") {
    return {
      command: "secret-tool",
      args: [
        "store",
        `--label=${SERVICE_NAME}`,
        "service",
        SERVICE_NAME,
        "account",
        key,
      ],
      input: value,
    };
  }
  const account = sanitizeKeyPart(key);
  const b64 = Buffer.from(value, "utf-8").toString("base64");
  const script =
    `$v = New-Object Windows.Security.Credentials.PasswordVault; ` +
    `$c = New-Object Windows.Security.Credentials.PasswordCredential('${SERVICE_NAME}','${account}',` +
    `[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${b64}'))); ` +
    `try { $v.Remove($v.Retrieve('${SERVICE_NAME}','${account}')) } catch {}; $v.Add($c)`;
  return {
    command: "powershell.exe",
    args: ["-NoProfile", "-NonInteractive", "-Command", script],
  };
}

function buildLookupCommand(kind: SecretStoreKind, key: string): SecretCommand {
  if (kind === "security") {
    return {
      command: "security",
      args: ["find-generic-password", "-a", key, "-s", SERVICE_NAME, "-w"],
    };
  }
  if (kind === "secret-tool") {
    return {
      command: "secret-tool",
      args: ["lookup", "service", SERVICE_NAME, "account", key],
    };
  }
  const account = sanitizeKeyPart(key);
  const script =
    `$v = New-Object Windows.Security.Credentials.PasswordVault; ` +
    `[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(` +
    `$v.Retrieve('${SERVICE_NAME}','${account}').Password))`;
  return {
    command: "powershell.exe",
    args: ["-NoProfile", "-NonInteractive", "-Command", script],
    decodeBase64: true,
  };
}

function buildDeleteCommand(kind: SecretStoreKind, key: string): SecretCommand {
  if (kind === "security") {
    return {
      command: "security",
      args: ["delete-generic-password", "-a", key, "-s", SERVICE_NAME],
    };
  }
  if (kind === "secret-tool") {
    return {
      command: "secret-tool",
      args: ["clear", "service", SERVICE_NAME, "account", key],
    };
  }
  const account = sanitizeKeyPart(key);
  const script =
    `$v = New-Object Windows.Security.Credentials.PasswordVault; ` +
    `try { $v.Remove($v.Retrieve('${SERVICE_NAME}','${account}')) } catch {}`;
  return {
    command: "powershell.exe",
    args: ["-NoProfile", "-NonInteractive", "-Command", script],
  };
}

export function getSecret(key: string): string | null {
  const kind = platformKind();
  if (!kind) return null;
  const cmd = buildLookupCommand(kind, key);
  const result = runResult(cmd.command, cmd.args, cmd.input);
  if (result.status !== 0) return null;
  const raw = cmd.decodeBase64
    ? Buffer.from(result.stdout.trim(), "base64").toString("utf-8")
    : result.stdout.replace(/\r?\n$/, "");
  return raw || null;
}

export function setSecret(key: string, value: string): boolean {
  const kind = platformKind();
  if (!kind) return false;
  const cmd = buildStoreCommand(kind, key, value);
  const result = runResult(cmd.command, cmd.args, cmd.input);
  return result.status === 0;
}

export function deleteSecret(key: string): void {
  const kind = platformKind();
  if (!kind) return;
  const cmd = buildDeleteCommand(kind, key);
  runResult(cmd.command, cmd.args, cmd.input);
}

export function setSecretStoreExecutorForTests(
  executor: SecretExecutor | null,
): void {
  executorOverride = executor;
  availabilityCache = null;
}

export function resetSecretStoreForTests(): void {
  executorOverride = null;
  availabilityCache = null;
}
