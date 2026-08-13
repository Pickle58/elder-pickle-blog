// @ts-check
import { fileURLToPath } from "node:url";
import cloudflare from "@astrojs/cloudflare";
import markdoc from "@astrojs/markdoc";
import react from "@astrojs/react";
import clerk from "@clerk/astro";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, envField } from "astro/config";

const srcDir = fileURLToPath(new URL("./src", import.meta.url));
const assetsDir = fileURLToPath(new URL("./src/assets", import.meta.url));

// https://astro.build/config
// Note: we do not use keystatic() injectRoute — Astro 6 + Cloudflare fails to
// resolve virtual:keystatic-config during SSR dep optimization. Routes import
// keystatic.config.ts directly (see src/pages/keystatic and api/keystatic).
export default defineConfig({
  // Used for absolute URLs in comment notify emails (SITE in .env).
  site: process.env.SITE,
  // Keystatic local mode expects a loopback host.
  server: { host: "127.0.0.1" },
  integrations: [clerk(), react(), markdoc()],
  // Static by default; comment/admin/keystatic islands use on-demand routes via prerender=false.
  output: "static",
  adapter: cloudflare({
    imageService: "cloudflare",
  }),
  env: {
    schema: {
      PUBLIC_CONVEX_URL: envField.string({
        access: "public",
        context: "client",
        optional: true,
      }),
      PUBLIC_ADMIN_CLERK_USER_ID: envField.string({
        access: "public",
        context: "client",
        optional: true,
      }),
      PUBLIC_KEYSTATIC_GITHUB_APP_SLUG: envField.string({
        access: "public",
        context: "client",
        optional: true,
      }),
    },
  },
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        "@": srcDir,
        "@assets": assetsDir,
      },
    },
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react-dom/server",
        "react-dom/server.edge",
      ],
      exclude: ["@clerk/astro", "@clerk/astro/server"],
    },
  },
});
