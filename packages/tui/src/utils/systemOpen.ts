import { spawn } from "child_process";

export function openPathWithSystemApp(target: string): boolean {
  try {
    const command =
      process.platform === "darwin"
        ? "open"
        : process.platform === "win32"
          ? "explorer"
          : "xdg-open";
    const child = spawn(command, [target], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    return true;
  } catch (err) {
    console.error("Failed to open path with system app:", err);
    return false;
  }
}
