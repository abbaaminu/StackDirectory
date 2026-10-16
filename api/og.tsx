import { ImageResponse } from '@vercel/og';

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

const textResponse = (body: string, status: number, extraHeaders: Record<string, string> = {}) =>
  new Response(body, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      // A refusal (or a crash) must never be cached in place of a real card.
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });

export default async function handler(req: Request) {
  if (!CARD_METHODS.has((req.method ?? "GET").toUpperCase())) {
    return textResponse("Method not allowed", 405, { Allow: "GET, HEAD" });
  }

  // `new URL` throws on a malformed URL. The card is only decoration, so a bad
  // request degrades to the site's own copy instead of a crashed function.
  let searchParams: URLSearchParams;
  try {
    searchParams = new URL(req.url).searchParams;
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
    return new ImageResponse(<Card title={title} tagline={tagline} category={category} pricing={pricing} />, {
      width: 1200,
      height: 630,
    });
  } catch (error) {
    // Satori is best-effort: a render failure must not take the function down
    // with it, and a plain-text 500 is something a scraper can at least drop.
    console.error("[OG] Card rendering failed:", error);
    return textResponse("Card could not be rendered", 500);
  }
}
