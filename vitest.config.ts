import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "astro-cms:manifest": path.join(
        root,
        "src",
        "cms",
        "component-manifest.ts",
      ),
    },
  },
});
