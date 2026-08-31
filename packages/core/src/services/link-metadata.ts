import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { generateText, Output } from "ai";
import { z } from "zod";
import { resolveAiModel, hasConfiguredProvider } from "../ai";
import { RagOptions } from "../types";

export const LinkAutofillSchema = z.object({
  title: z.string().describe("Clean, descriptive title"),
  description: z.string().describe("Concise summary (1 sentence)"),
  tags: z.array(z.string()).describe("Relevant lowercase tags"),
});

export type LinkAutofillResult = {
  title: string;
  description: string;
  tags: string[];
};

const LINK_FETCH_TIMEOUT_MS = 5_000;
const MAX_LINK_FETCH_BYTES = 1_000_000;
const MAX_LINK_REDIRECTS = 3;

export function isPrivateIp(address: string): boolean {
  const normalized = address.toLowerCase();
  const ipVersion = isIP(normalized);

  if (ipVersion === 4) {
    const [first, second] = normalized.split(".").map(Number);
    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 198 && (second === 18 || second === 19))
    );
  }

  if (ipVersion === 6) {
    const mappedIpv4 = normalized.match(/^::ffff:(.+)$/);
    if (mappedIpv4) return isPrivateIp(mappedIpv4[1]);
    return (
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80:")
    );
  }

  return false;
}

export async function validatePublicUrl(value: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Invalid URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only HTTP(S) URLs can be fetched");
  }
  if (url.username || url.password) {
    throw new Error("URLs with credentials cannot be fetched");
  }
  if (url.hostname.toLowerCase() === "localhost") {
    throw new Error("Local URLs cannot be fetched");
  }

  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (
    addresses.length === 0 ||
    addresses.some(({ address }) => isPrivateIp(address))
  ) {
    throw new Error("Private network URLs cannot be fetched");
  }

  return url;
}

export async function readLimitedResponse(response: Response): Promise<string> {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_LINK_FETCH_BYTES) {
    throw new Error("Link response exceeds the maximum allowed size");
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let receivedBytes = 0;
  let content = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    receivedBytes += value.byteLength;
    if (receivedBytes > MAX_LINK_FETCH_BYTES) {
      await reader.cancel();
      throw new Error("Link response exceeds the maximum allowed size");
    }
    content += decoder.decode(value, { stream: true });
  }

  return content + decoder.decode();
}

export async function fetchPublicHtml(value: string): Promise<string> {
  let url = await validatePublicUrl(value);

  for (let redirects = 0; redirects <= MAX_LINK_REDIRECTS; redirects++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), LINK_FETCH_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
        redirect: "manual",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Redirect response has no location");
      url = await validatePublicUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) return "";
    return readLimitedResponse(response);
  }

  throw new Error("Too many redirects while fetching link metadata");
}

export async function autofillLink(
  url: string,
  options: RagOptions = {},
): Promise<LinkAutofillResult> {
  let fetchedTitle = "";
  let fetchedDesc = "";

  const validatedUrl = await validatePublicUrl(url);

  try {
    const html = await fetchPublicHtml(validatedUrl.toString());
    if (html) {
      const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      if (titleMatch) {
        fetchedTitle = titleMatch[1].trim();
      }

      const descMatch =
        html.match(
          /<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i,
        ) ||
        html.match(
          /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i,
        );
      if (descMatch) {
        fetchedDesc = descMatch[1].trim();
      }
    }
  } catch (err) {
    console.warn(`Failed to fetch URL ${url} for autofill:`, err);
  }

  const cleanText = (txt: string) =>
    txt
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 500);

  fetchedTitle = cleanText(fetchedTitle);
  fetchedDesc = cleanText(fetchedDesc);

  if (!fetchedTitle) {
    try {
      const u = new URL(url);
      fetchedTitle = u.hostname;
    } catch {
      fetchedTitle = url;
    }
  }

  const hasAI = hasConfiguredProvider(options);

  if (hasAI) {
    try {
      const language = options.language || "en";
      const langName = language === "it" ? "Italian" : "English";

      const systemPrompt = `You are a metadata assistant. You extract, clean, and organize details from web links.
Given a URL and its raw title and description parsed from HTML, refine them.
The returned title, description, and tags MUST be in ${langName}.`;

      const userMessage = `URL: ${url}\nHTML Title: ${fetchedTitle}\nHTML Description: ${fetchedDesc}`;

      const resolved = resolveAiModel(options);

      try {
        const { output: data } = await generateText({
          model: resolved.model,
          output: Output.object({ schema: LinkAutofillSchema }),
          system: systemPrompt,
          prompt: userMessage,
          temperature: 0.3,
        });

        if (data) {
          return {
            title: data.title || fetchedTitle,
            description: data.description || fetchedDesc,
            tags: Array.isArray(data.tags)
              ? data.tags.map((t) => String(t).toLowerCase())
              : [],
          };
        }
      } catch {
        const fallbackSystemPrompt = `${systemPrompt}
Return a JSON object with this exact structure:
{
  "title": "Clean, descriptive title in ${langName}",
  "description": "Concise summary in ${langName} (1 sentence)",
  "tags": ["tag1", "tag2", "tag3"]
}
Only output the JSON object. Do not include markdown codeblock tags or any additional text.`;

        const { text } = await generateText({
          model: resolved.model,
          system: fallbackSystemPrompt,
          prompt: userMessage,
          temperature: 0.3,
        });

        const jsonStr = text
          .replace(/```json/gi, "")
          .replace(/```/g, "")
          .trim();
        const parsed = JSON.parse(jsonStr);
        if (parsed && typeof parsed === "object") {
          return {
            title: parsed.title || fetchedTitle,
            description: parsed.description || fetchedDesc,
            tags: Array.isArray(parsed.tags)
              ? parsed.tags.map((t: any) => String(t).toLowerCase())
              : [],
          };
        }
      }
    } catch (aiErr) {
      console.warn(
        "AI link autofill failed, falling back to raw HTML metadata:",
        aiErr,
      );
    }
  }

  return {
    title: fetchedTitle,
    description: fetchedDesc,
    tags: [],
  };
}
