import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import type { IncomingMessage, ServerResponse } from "http";
import path from "path";
import { defineConfig, type Plugin } from "vite";

type DevApiHandler = (request: IncomingMessage, response: ServerResponse) => Promise<void>;

/**
 * Serves `GET /api/favicon` during `npm run dev`.
 *
 * Listing icons are fetched from our own origin (see `getFaviconUrl` in
 * src/lib/toolDisplay.ts), and `vercel dev`/production provide that route
 * automatically - plain `vite` does not. Without this, every card in local
 * development fell back to its letter avatar and the route looked broken.
 *
 * Only this one route is mirrored: the other endpoints are POST-only and are
 * covered end to end by `npm run verify`. `apply: "serve"` keeps the plugin out
 * of `vite build` entirely.
 */
const localFaviconRoute = (): Plugin => ({
  name: "stackdirectory-dev-api",
  apply: "serve",
  configureServer(server) {
    let handler: DevApiHandler | null = null;
    server.middlewares.use((request, response, next) => {
      if ((request.url ?? "").split("?")[0] !== "/api/favicon") {
        next();
        return;
      }
      void (async () => {
        try {
          if (!handler) {
            const loaded = (await server.ssrLoadModule("/api/favicon.ts")) as {
              default?: DevApiHandler;
            };
            handler = loaded.default ?? null;
          }
          if (!handler) {
            next();
            return;
          }
          await handler(request, response);
        } catch (error) {
          // A dev-only failure must never take down the dev server, so it is
          // logged and handed back to Vite (the card then shows its avatar).
          server.config.logger.error(`[/api/favicon] ${String(error)}`);
          next();
        }
      })();
    });
  },
});

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), localFaviconRoute()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== "true",
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === "true" ? null : {},
    },
  };
});
