import node from "@astrojs/node";
import react from "@astrojs/react";
import astroCms from "@astro-cms/core/integration";
import { defineConfig } from "astro/config";

export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  integrations: [
    react(),
    astroCms({
      manifest: "src/astro-cms.manifest.ts",
      components: "src/components/cms",
      previewLayout: "src/layouts/SiteLayout.astro",
      injectRoutes: "dev-only",
    }),
  ],
  devToolbar: { enabled: false },
});
