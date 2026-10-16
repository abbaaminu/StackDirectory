import { ImageResponse } from '@vercel/og';
import type { IncomingMessage, ServerResponse } from "http";

import { OG_TEXT_LIMITS, ogText } from "./_lib/ogText.js";

// Rendered on the Node.js runtime on purpose: `@vercel/og` is pinned to 0.11.x
// (see package.json) because the 1.x builds ship a Node entry whose bundled
// `require("fs")` shim (via harfbuzzjs) throws `Dynamic require of "fs" is not
// supported` during module evaluation on Node.js runtimes, killing the function
// with a 500. The Edge runtime is not an option for this file either - Vercel
// rejects `@vercel/og` as an "unsupported module" in Edge Functions.
export const config = {
  runtime: 'nodejs',
};

type CardProps = {
  title: string;
  tagline: string;
  category: string;
  pricing: string;
};

/** The 1200x630 card satori renders. Values arrive already capped (see ogText). */
const Card = ({ title, tagline, category, pricing }: CardProps) => (
  <div
    style={{
      backgroundColor: "#0F172A",
      color: "white",
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-start",
      justifyContent: "center",
      height: "100%",
      padding: "80px",
      width: "100%",
    }}
  >
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
      <div
        style={{
          alignItems: "center",
          display: "flex",
          gap: 16,
        }}
      >
        <div
          style={{
            backgroundColor: "#F59E0B",
            borderRadius: 999,
            color: "#0F172A",
            display: "flex",
            fontSize: 22,
            fontWeight: 800,
            padding: "10px 20px",
          }}
        >
          {category}
        </div>
        <div style={{ color: "#CBD5E1", display: "flex", fontSize: 22 }}>{pricing}</div>
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 60,
          fontWeight: 800,
          maxWidth: 1000,
          marginTop: 32,
        }}
      >
        {title}
      </div>
      <div
        style={{
          color: "#94A3B8",
          display: "flex",
          fontSize: 28,
          maxWidth: 950,
          marginTop: 20,
        }}
      >
        {tagline}
      </div>
      <div style={{ marginTop: 40, fontSize: 20, color: "#64748B", display: "flex" }}>
        StackDirectory • apps.stackbuildco.com
      </div>
    </div>
  </div>
);

/** The card is a GET (or a scraper's HEAD); nothing else has a body to return. */
const CARD_METHODS = new Set(["GET", "HEAD"]);

/** Base for the path-only `req.url` a Node.js runtime hands a function. */
const CARD_ORIGIN = "https://apps.stackbuildco.com";

/** A refusal (or a crash) must never be cached in place of a real card. */
function refuse(
  res: ServerResponse,
  status: number,
  body: string,
  extraHeaders: Record<string, string> = {},
): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  for (const [header, value] of Object.entries(extraHeaders)) {
    res.setHeader(header, value);
  }
  res.end(body);
}

// Written against the raw request/response pair, like the other `api/`
// endpoints: the Node.js runtime does not send a Web `Response` a handler
// returns, so returning one left every invocation hanging until the platform's
// 300s timeout instead of answering with a card.
export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!CARD_METHODS.has((req.method ?? "GET").toUpperCase())) {
    refuse(res, 405, "Method not allowed", { Allow: "GET, HEAD" });
    return;
  }

  // `req.url` is only a path (`/api/og?title=…`), so it needs a base to parse,
  // and a malformed URL degrades to the site's own copy: the card is decoration.
  let searchParams: URLSearchParams;
  try {
    searchParams = new URL(req.url ?? "/api/og", CARD_ORIGIN).searchParams;
  } catch {
    searchParams = new URLSearchParams();
  }

  // Every field is caller-supplied, so it is single-lined and capped before it
  // reaches the canvas.
  const title = ogText(searchParams.get("title"), "StackDirectory", OG_TEXT_LIMITS.title);
  const tagline = ogText(
    searchParams.get("tagline"),
    "Discover top developer tools & startups",
    OG_TEXT_LIMITS.tagline,
  );
  const category = ogText(searchParams.get("category"), "Developer Tools", OG_TEXT_LIMITS.category);
  const pricing = ogText(searchParams.get("pricing"), "Freemium", OG_TEXT_LIMITS.pricing);

  try {
    const card = new ImageResponse(
      <Card title={title} tagline={tagline} category={category} pricing={pricing} />,
      { width: 1200, height: 630 },
    );
    const png = Buffer.from(await card.arrayBuffer());
    res.statusCode = 200;
    res.setHeader("Content-Type", "image/png");
    // A card is immutable for a given query string, so let the CDN hold it
    // instead of re-rendering it for every scraper.
    res.setHeader(
      "Cache-Control",
      "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800",
    );
    res.setHeader("Content-Length", String(png.byteLength));
    res.end(png);
  } catch (error) {
    // Satori is best-effort: a render failure must not take the function down
    // with it, and a plain-text 500 is something a scraper can at least drop.
    console.error("[OG] Card rendering failed:", error);
    refuse(res, 500, "Card could not be rendered");
  }
}
