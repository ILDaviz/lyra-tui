export function cleanMarkdownForDisplay(content: string): string {
  if (!content) return "";
  let cleaned = content.replace(/<svg[\s\S]*?<\/svg>/gi, "🖼️ [SVG Graphic]");
  cleaned = cleaned.replace(
    /<div\s+[^>]*data-type="lyra-todo"[^>]*>([\s\S]*?)<\/div>/gi,
    (match, inner) => {
      const isDone = match.includes('done="true"');
      const cleanText = inner.replace(/<[^>]*>/g, "").trim();
      return `${isDone ? "- [x]" : "- [ ]"} ${cleanText}`;
    },
  );
  return cleaned;
}
