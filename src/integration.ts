import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { AstroIntegration } from "astro";

const VIRTUAL_REGISTRY_ID = "astro-cms:registry";
const RESOLVED_VIRTUAL_REGISTRY_ID = "\0astro-cms:registry";

export interface AstroCmsIntegrationOptions {
  /** Project-relative path to the pure-data component manifest. */
  manifest: string;
  /** Project-relative directory containing `<Type>.astro` implementations. */
  components: string;
  /** Project-relative Astro layout used around exact preview renders. */
  previewLayout: string;
  /**
   * Inject the private editor, preview, and local API routes.
   *
   * `"dev-only"` keeps the editing surface and filesystem write endpoints out
   * of production builds. Use `true` only when the adopter will protect those
   * routes with its own production authentication and persistence boundary.
   */
  injectRoutes?: boolean | "dev-only";
}

export function shouldInjectEditorRoutes(
  option: AstroCmsIntegrationOptions["injectRoutes"],
  command: "dev" | "build" | "preview" | "sync",
): boolean {
  return option === true || (option === "dev-only" && command !== "build");
}

function normalizedImportPath(filePath: string): string {
  return filePath.replaceAll("\\", "/");
}

function registryPlugin(componentsDirectory: string) {
  return {
    name: "astro-cms-component-registry",
    enforce: "pre",
    resolveId(id: string) {
      return id === VIRTUAL_REGISTRY_ID
        ? RESOLVED_VIRTUAL_REGISTRY_ID
        : undefined;
    },
    async load(id: string) {
      if (id !== RESOLVED_VIRTUAL_REGISTRY_ID) return undefined;

      const files = (await readdir(componentsDirectory))
        .filter((file) => file.endsWith(".astro"))
        .sort();
      const imports = files.map((file, index) => {
        const source = normalizedImportPath(
          path.join(componentsDirectory, file),
        );
        return `import Component${index} from ${JSON.stringify(source)};`;
      });
      const entries = files.map((file, index) => {
        const type = path.basename(file, ".astro");
        return `${JSON.stringify(type)}: Component${index}`;
      });

      return `${imports.join("\n")}\nexport const componentRegistry = {${entries.join(",")}};`;
    },
  };
}

export default function astroCms(
  options: AstroCmsIntegrationOptions,
): AstroIntegration {
  return {
    name: "@astro-cms/core",
    hooks: {
      "astro:config:setup": ({
        config,
        command,
        updateConfig,
        injectRoute,
        addWatchFile,
      }) => {
        const projectRoot = fileURLToPath(config.root);
        const manifest = path.resolve(projectRoot, options.manifest);
        const components = path.resolve(projectRoot, options.components);
        const previewLayout = path.resolve(projectRoot, options.previewLayout);

        addWatchFile(manifest);
        addWatchFile(components);
        addWatchFile(previewLayout);
        updateConfig({
          vite: {
            resolve: {
              alias: {
                "astro-cms:manifest": manifest,
                "astro-cms:preview-layout": previewLayout,
              },
            },
            plugins: [registryPlugin(components)],
          },
        });

        const shouldInjectRoutes = shouldInjectEditorRoutes(
          options.injectRoutes,
          command,
        );
        if (!shouldInjectRoutes) return;

        const route = (pattern: string, relativeEntrypoint: string): void => {
          injectRoute({
            pattern,
            entrypoint: pathToFileURL(
              path.resolve(
                path.dirname(fileURLToPath(import.meta.url)),
                relativeEntrypoint,
              ),
            ),
            prerender: false,
          });
        };

        route("/admin", "package-routes/admin.astro");
        route("/preview", "package-routes/preview.astro");
        route("/preview/live/[draftId]", "package-routes/live-preview.astro");
        route("/api/page-document", "pages/api/page-document.ts");
        route("/api/pages", "pages/api/pages.ts");
        route("/api/assets", "pages/api/assets.ts");
        route("/api/change-review", "pages/api/change-review.ts");
        route("/api/preview-drafts", "pages/api/preview-drafts.ts");
        route("/api/templates", "pages/api/templates.ts");
        route("/api/publish", "pages/api/publish.ts");
      },
    },
  };
}
