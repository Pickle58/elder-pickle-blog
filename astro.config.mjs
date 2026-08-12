// @ts-check
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import clerk from "@clerk/astro";
import { defineConfig, envField } from "astro/config";

// https://astro.build/config
export default defineConfig({
  integrations: [clerk(), react()],
  // Static by default; comment/admin islands use on-demand routes via prerender=false.
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
    },
  },
  vite: {
    optimizeDeps: {
      exclude: ["@clerk/astro", "@clerk/astro/server"],
    },
  },
});
