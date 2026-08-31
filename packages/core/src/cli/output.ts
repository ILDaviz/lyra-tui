let colorEnabledOverride: boolean | undefined;
const ansiSequence = new RegExp(
  `${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`,
  "g",
);

function shouldUseColor(): boolean {
  if (colorEnabledOverride !== undefined) return colorEnabledOverride;
  return process.env.NO_COLOR === undefined && process.stdout.isTTY === true;
}

function formatOutput(value: string): string {
  return shouldUseColor() ? value : value.replace(ansiSequence, "");
}

export function setCliColorEnabled(enabled?: boolean): void {
  colorEnabledOverride = enabled;
}

export function print(value = ""): void {
  console.log(formatOutput(value));
}

export function printError(value = ""): void {
  console.error(formatOutput(value));
}

export function write(value: string): void {
  process.stdout.write(formatOutput(value));
}
