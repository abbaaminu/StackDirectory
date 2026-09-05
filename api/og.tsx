import { ImageResponse } from '@vercel/og';

export const config = {
  runtime: 'nodejs',
};

export default async function handler(req: Request) {
  const { searchParams } = new URL(req.url);
  const title = searchParams.get("title") || "StackDirectory";
  const tagline = searchParams.get("tagline") || "Discover top developer tools & startups";
  const category = searchParams.get("category") || "Developer Tools";
  const pricing = searchParams.get("pricing") || "Freemium";

  return new ImageResponse(
    (
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
            <div style={{ color: "#CBD5E1", display: "flex", fontSize: 22 }}>
              {pricing}
            </div>
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
    ),
    {
      width: 1200,
      height: 630,
    },
  );
}
