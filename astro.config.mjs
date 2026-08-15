import node from "@astrojs/node";
import react from "@astrojs/react";
import { defineConfig } from "astro/config";
import astroCms from "./src/integration";

export default defineConfig({
  output: "server",
  integrations: [
    react(),
    astroCms({
      manifest: "src/cms/component-manifest.ts",
      components: "src/components/primitives",
      previewLayout: "src/layouts/BaseLayout.astro",
      injectRoutes: false,
    }),
  ],
  adapter: node({
    mode: "standalone",
  }),
  devToolbar: {
    enabled: true,
  },
});
