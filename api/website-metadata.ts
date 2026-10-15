import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { IncomingMessage, ServerResponse } from "http";
import { clientIpFromRequest, consumeRateLimit } from "./_lib/rateLimit";

type MetadataRequest = IncomingMessage & { body?: unknown };

type WebsiteMetadata = {
  title: string;
  tagline: string;
  description: string;
  iconUrl: string;
  techStack: string[];
  pricingType: "Free" | "Freemium" | "Paid" | "Open Source";
};

const MAX_HTML_BYTES = 1_000_000;
const MAX_REDIRECTS = 4;
/** Ceiling for a single hop. */
const HOP_TIMEOUT_MS = 8_000;
/**
 * Ceiling for the whole inspection (redirects included).
 *
 * Without it the handler could spend `MAX_REDIRECTS + 1` × 8s = 40s on one
 * request, and the platform (Vercel's default limit is 10s) would kill the
 * function mid-flight - so the caller got an HTML timeout page instead of the
 * JSON reason this endpoint exists to return.
 */
const TOTAL_BUDGET_MS = 12_000;
/** Outbound fetches one client may request per window. */
const METADATA_RATE_LIMIT = 20;
const METADATA_RATE_WINDOW_MS = 10 * 60 * 1000;
const USER_AGENT = "StackDirectoryMetadataBot/1.0";
const TECHNOLOGIES = [
  "Next.js", "React", "Vue", "Angular", "Svelte", "Astro", "TypeScript",
  "JavaScript", "Node.js", "Python", "Django", "Flask", "Ruby on Rails",
  "Laravel", "Supabase", "Firebase", "PostgreSQL", "MySQL", "MongoDB",
  "Redis", "Tailwind CSS", "Stripe", "Vercel", "AWS", "Cloudflare",
  "Docker", "Kubernetes", "OpenAI", "LangChain",
];

function respond(res: ServerResponse, status: number, body: Record<string, unknown>): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function decodeHtml(value: string): string {
  return value
    .replace(/&#(\d+);/g, (match, code: string) => {
      const point = Number(code);
      return point <= 0x10ffff ? String.fromCodePoint(point) : match;
    })
    .replace(/&#x([\da-f]+);/gi, (match, code: string) => {
      const point = parseInt(code, 16);
      return point <= 0x10ffff ? String.fromCodePoint(point) : match;
    })
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const octets = address.split(".").map(Number);
    const [first, second] = octets;
    return !(
      first === 0 || first === 10 || first === 127 || first >= 224 ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 100 && second >= 64 && second <= 127)
    );
  }
  if (isIP(address) === 6) {
    const normalized = address.toLowerCase();
    return !(
      normalized === "::" || normalized === "::1" ||
      normalized.startsWith("fc") || normalized.startsWith("fd") ||
      /^fe[89ab]/.test(normalized) || normalized.startsWith("::ffff:")
    );
  }
  return false;
}

async function validatePublicUrl(value: string): Promise<URL> {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only public HTTP or HTTPS websites can be inspected.");
  }
  if (url.username || url.password) {
    throw new Error("Website URLs cannot contain credentials.");
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    !hostname.includes(".") ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local")
  ) {
    throw new Error("Enter a publicly accessible website URL.");
  }

  const addresses = isIP(hostname)
    ? [{ address: hostname }]
    : await lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new Error("The website host must resolve to a public IP address.");
  }
  return url;
}

async function readHtml(response: Response): Promise<string> {
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > MAX_HTML_BYTES) throw new Error("Website page is too large to inspect.");
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_HTML_BYTES) {
      await reader.cancel();
      throw new Error("Website page is too large to inspect.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function getMeta(html: string, keys: string[]): string {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attributes = new Map<string, string>();
    for (const match of tag.matchAll(/([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
      attributes.set(match[1].toLowerCase(), decodeHtml(match[2] ?? match[3] ?? match[4] ?? ""));
    }
    const key = (attributes.get("property") ?? attributes.get("name") ?? "").toLowerCase();
    if (keys.includes(key)) {
      const content = attributes.get("content")?.trim();
      if (content) return content;
    }
  }
  return "";
}

function extractMetadata(html: string, pageUrl: URL): WebsiteMetadata {
  const titleTag = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "";
  const title = getMeta(html, ["og:title", "twitter:title", "application-name"]) ||
    decodeHtml(titleTag.replace(/<[^>]+>/g, ""));
  const description = getMeta(html, [
    "og:description", "twitter:description", "description",
  ]);
  const tagline = getMeta(html, ["og:tagline", "twitter:label1", "tagline"]) ||
    description.slice(0, 180);
  const keywordValues = [
    getMeta(html, ["tech-stack", "technology", "technologies", "keywords"]),
  ].filter(Boolean);
  const visibleText = `${keywordValues.join(", ")} ${html.replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>/gi, " ")}`;
  const techStack = TECHNOLOGIES.filter((technology) =>
    new RegExp(`(^|[^a-z0-9])${technology.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i").test(visibleText),
  ).slice(0, 12);

  const pricingMetadata = getMeta(html, ["pricing", "pricing-model", "price"]);
  const pricingText = `${pricingMetadata} ${description} ${html.slice(0, 300_000)}`.toLowerCase();
  const pricingType: WebsiteMetadata["pricingType"] =
    /open[\s-]?source|source code available/.test(pricingText)
      ? "Open Source"
      : /\bfree trial\b|\bfreemium\b|\bfree plan\b/.test(pricingText)
        ? "Freemium"
        : /\bpaid\b|\bpricing\b|\bsubscription\b|\bper month\b|\bper year\b/.test(pricingText)
          ? "Paid"
          : /\bfree\b/.test(pricingText)
            ? "Free"
            : "Freemium";
  const icon = getMeta(html, ["og:image", "twitter:image"]);
  let iconUrl = "";
  if (icon) {
    try {
      const imageUrl = new URL(icon, pageUrl);
      if (imageUrl.protocol === "http:" || imageUrl.protocol === "https:") {
        iconUrl = imageUrl.toString();
      }
    } catch {
      // Invalid Open Graph image URLs should not prevent other metadata filling.
    }
  }

  return {
    title: title || pageUrl.hostname.replace(/^www\./i, ""),
    tagline: tagline || `Discover ${title || pageUrl.hostname}`,
    description: description || tagline || `Learn more about ${title || pageUrl.hostname}.`,
    iconUrl,
    techStack,
    pricingType,
  };
}

async function fetchPage(initialUrl: string): Promise<{ html: string; url: URL }> {
  let currentUrl = await validatePublicUrl(initialUrl);
  const deadline = Date.now() + TOTAL_BUDGET_MS;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    // Each hop gets whatever is left of the shared budget, so a chain of slow
    // redirects fails with our own JSON error instead of being killed upstream.
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error("Website inspection timed out.");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.min(HOP_TIMEOUT_MS, remaining));
    try {
      const response = await fetch(currentUrl, {
        redirect: "manual",
        signal: controller.signal,
        headers: { Accept: "text/html,application/xhtml+xml", "User-Agent": USER_AGENT },
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel();
        const location = response.headers.get("location");
        if (!location || redirects === MAX_REDIRECTS) {
          throw new Error("Website redirected too many times.");
        }
        currentUrl = await validatePublicUrl(new URL(location, currentUrl).toString());
        continue;
      }
      if (!response.ok) throw new Error(`Website returned HTTP ${response.status}.`);
      if (!/text\/html|application\/xhtml\+xml/i.test(response.headers.get("content-type") ?? "")) {
        throw new Error("The website did not return an HTML page.");
      }
      return { html: await readHtml(response), url: currentUrl };
    } catch (error) {
      // An aborted fetch (per-hop timeout or the shared budget) surfaces as a
      // bare AbortError; report what actually happened instead.
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Website inspection timed out.");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error("Website redirected too many times.");
}

export default async function handler(req: MetadataRequest, res: ServerResponse): Promise<void> {
  if (req.method !== "POST") {
    respond(res, 405, { success: false, error: "Method not allowed." });
    return;
  }

  // This endpoint fetches a caller-supplied URL, so one client must not be able
  // to use it as an unlimited outbound-fetch engine. Requests with no
  // attributable address (local piping, the unit-test harness) are not throttled.
  const clientIp = clientIpFromRequest(req);
  if (clientIp) {
    const decision = consumeRateLimit(
      `website-metadata:${clientIp}`,
      METADATA_RATE_LIMIT,
      METADATA_RATE_WINDOW_MS,
    );
    if (!decision.allowed) {
      res.setHeader("Retry-After", String(decision.retryAfterSeconds));
      respond(res, 429, {
        success: false,
        error: "Too many website lookups. Please try again in a few minutes.",
      });
      return;
    }
  }
  let body: { url?: unknown };
  if (req.body && typeof req.body === "object") {
    body = req.body as { url?: unknown };
  } else {
    try {
      const raw = await new Promise<string>((resolve, reject) => {
        let content = "";
        req.on("data", (chunk) => {
          content += chunk;
          if (content.length > 8_192) reject(new Error("Request body is too large."));
        });
        req.on("end", () => resolve(content));
        req.on("error", reject);
      });
      body = JSON.parse(raw || "{}") as { url?: unknown };
    } catch {
      respond(res, 400, { success: false, error: "Invalid or oversized JSON body." });
      return;
    }
  }
  if (typeof body.url !== "string" || !body.url.trim() || body.url.length > 2_048) {
    respond(res, 400, { success: false, error: "A website URL is required." });
    return;
  }

  try {
    const { html, url } = await fetchPage(body.url.trim());
    respond(res, 200, { success: true, metadata: extractMetadata(html, url) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not inspect that website.";
    respond(res, 422, { success: false, error: message });
  }
}
