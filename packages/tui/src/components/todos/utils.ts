export function cleanTodoText(text: string): string {
  return text
    .replace(/\\([*_`#[\]()>])/g, "$1")
    .replace(/[*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
