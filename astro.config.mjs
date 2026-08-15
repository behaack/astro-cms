import node from "@astrojs/node";
import react from "@astrojs/react";
import { defineConfig } from "astro/config";

export default defineConfig({
  output: "server",
  integrations: [react()],
  adapter: node({
    mode: "standalone",
  }),
  devToolbar: {
    enabled: true,
  },
});
