import { ImageResponse } from "@vercel/og";

export const config = {
  runtime: "edge",
};

const getParam = (url: URL, key: string, fallback: string): string =>
  url.searchParams.get(key)?.trim() || fallback;

export default function handler(request: Request) {
  const url = new URL(request.url);
  const title = getParam(url, "title", "Discover standout developer tools");
  const tagline = getParam(url, "tagline", "Find useful software and proven micro-SaaS businesses.");
  const category = getParam(url, "category", "Developer Tools");
  const pricing = getParam(url, "pricing", "Freemium");

  return new ImageResponse(
    (
      <div
        style={{
          background: "#0F172A",
          color: "#F8FAFC",
          display: "flex",
          flexDirection: "column",
          height: "100%",
          justifyContent: "space-between",
          padding: "72px",
          width: "100%",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div
            style={{
              color: "#F59E0B",
              display: "flex",
              fontSize: 26,
              fontWeight: 700,
              letterSpacing: 1,
              textTransform: "uppercase",
            }}
          >
            StackDirectory
          </div>
          <div
            style={{
              alignItems: "center",
              display: "flex",
              gap: 16,
            }}
          >
            <div
              style={{
                background: "#F59E0B",
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
            <div style={{ color: "#CBD5E1", display: "flex", fontSize: 22 }}>
              {pricing}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 64,
              fontWeight: 800,
              lineHeight: 1.05,
              maxWidth: 1000,
            }}
          >
            {title}
          </div>
          <div
            style={{
              color: "#CBD5E1",
              display: "flex",
              fontSize: 30,
              lineHeight: 1.3,
              maxWidth: 950,
            }}
          >
            {tagline}
          </div>
        </div>
        <div
          style={{
            borderTop: "2px solid #334155",
            color: "#94A3B8",
            display: "flex",
            fontSize: 24,
            paddingTop: 24,
          }}
        >
          Explore more tools at apps.stackbuildco.com
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
      },
    },
  );
}
