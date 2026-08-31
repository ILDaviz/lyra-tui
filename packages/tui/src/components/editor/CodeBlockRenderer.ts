import {
  SyntaxStyle,
  BoxRenderable,
  CodeRenderable,
  TextRenderable,
  infoStringToFiletype,
  getTreeSitterClient,
} from "@opentui/core";
import type { Theme } from "../../theme";
import { getActiveTheme } from "../../theme";

export function createCodeBlockRenderer(
  renderer: any,
  syntaxStyle: SyntaxStyle,
  theme?: Theme,
) {
  const currentTheme = theme || getActiveTheme();
  const renderFn = (token: any, context: any) => {
    if (token.type !== "code") return undefined;
    const codeToken = token as { text: string; lang?: string };
    const rawLang = codeToken.lang?.trim() || "";
    const filetype = rawLang ? infoStringToFiletype(rawLang) : "bash";
    const langLabel = (rawLang || filetype || "CODE").toUpperCase();
    const codeLines = (codeToken.text || "").split("\n");

    try {
      const panel = new BoxRenderable(renderer, {
        backgroundColor: currentTheme.bg.codeBlock,
        borderColor: currentTheme.bg.codeBlockHeader,
        borderStyle: "single",
        paddingLeft: 1,
        paddingRight: 1,
        paddingTop: 0,
        paddingBottom: 0,
        flexDirection: "column",
        width: "100%",
        marginBottom: 1,
      });

      const header = new BoxRenderable(renderer, {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        width: "100%",
        paddingTop: 0,
        paddingBottom: 0,
        marginBottom: 0,
      });
      const langBadge = new TextRenderable(renderer, {
        content: `  ${langLabel}`,
        fg: currentTheme.accent.secondary,
      });
      const lineCount = new TextRenderable(renderer, {
        content: `${codeLines.length} lines`,
        fg: currentTheme.text.dim,
      });
      header.add(langBadge);
      header.add(lineCount);
      panel.add(header);

      const codeElement = new CodeRenderable(renderer, {
        content: codeToken.text,
        filetype,
        syntaxStyle,
        treeSitterClient: context?.treeSitterClient || getTreeSitterClient(),
        conceal: context?.concealCode,
        wrapMode: "word",
        drawUnstyledText: true,
        bg: currentTheme.bg.codeBlock,
        width: "100%",
      });
      panel.add(codeElement);

      return panel;
    } catch (err) {
      console.error("Failed to render code block:", err);
      return undefined;
    }
  };

  (renderFn as any).codeBlockOnly = true;
  return renderFn;
}
