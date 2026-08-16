import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  AstroCmsInitError,
  initializeProject,
  patchAstroConfig,
} from "./init.mjs";

const temporaryDirectories = [];

async function createProject(options = {}) {
  const projectDirectory = await mkdtemp(
    path.join(os.tmpdir(), "astro-cms-init-"),
  );
  temporaryDirectories.push(projectDirectory);
  const manifest = {
    name: "initializer-test-project",
    private: true,
    dependencies: {
      astro: "^7.2.2",
      "@astro-cms/core": "^0.1.0",
      "@astrojs/react": "^6.0.2",
      react: "^19.2.8",
      "react-dom": "^19.2.8",
      ...options.dependencies,
    },
  };
  await writeFile(
    path.join(projectDirectory, "package.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    path.join(projectDirectory, "astro.config.mjs"),
    options.config ??
      'import { defineConfig } from "astro/config";\n\nexport default defineConfig({\n  integrations: [],\n});\n',
    "utf8",
  );
  return projectDirectory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("Astro config patching", () => {
  it("adds React and Astro-CMS while preserving an existing integration", () => {
    const source = `import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";

export default defineConfig({
  integrations: [sitemap()],
});
`;

    const result = patchAstroConfig(source);

    expect(result.changed).toBe(true);
    expect(result.source).toContain('from "@astrojs/react"');
    expect(result.source).toContain('from "@astro-cms/core/integration"');
    expect(result.source).toContain("react(),");
    expect(result.source).toContain("astroCms({");
    expect(result.source).toContain("sitemap()");
    expect(result.source).toContain('injectRoutes: "dev-only"');
  });

  it("adds an integrations property to a conventional empty config", () => {
    const result = patchAstroConfig(
      'import { defineConfig } from "astro/config";\nexport default defineConfig({});\n',
    );

    expect(result.source).toContain("integrations: [");
    expect(result.source).toContain("react(),");
    expect(result.source).toContain("astroCms({");
  });

  it("does not duplicate an existing Astro-CMS integration", () => {
    const source = `import astroCms from "@astro-cms/core/integration";
import { defineConfig } from "astro/config";
export default defineConfig({ integrations: [astroCms({
  manifest: "src/astro-cms.manifest.ts",
  components: "src/components/cms",
  previewLayout: "src/layouts/AstroCmsPreviewLayout.astro",
})] });
`;

    expect(patchAstroConfig(source)).toEqual({
      source,
      changed: false,
      alreadyConfigured: true,
    });
  });

  it("rejects computed configuration functions", () => {
    expect(() =>
      patchAstroConfig(
        'import { defineConfig } from "astro/config";\nexport default defineConfig(({ command }) => ({ output: command === "build" ? "static" : "server" }));\n',
      ),
    ).toThrow(AstroCmsInitError);
  });
});

describe("project initialization", () => {
  it("creates a complete starter and is idempotent", async () => {
    const projectDirectory = await createProject();

    const first = await initializeProject(projectDirectory);
    expect(first.configChanged).toBe(true);
    expect(first.created).toContain("src/astro-cms.manifest.ts");
    expect(first.created).toContain("src/components/AstroCmsSeoHead.astro");
    expect(first.created).toContain("src/pages/astro-cms-demo.astro");
    expect(first.created).toContain("content/pages/home.json");
    expect(first.created).toContain("ASTRO-CMS.md");

    const config = await readFile(
      path.join(projectDirectory, "astro.config.mjs"),
      "utf8",
    );
    expect(config).toContain('injectRoutes: "dev-only"');

    const second = await initializeProject(projectDirectory);
    expect(second.configChanged).toBe(false);
    expect(second.created).toEqual([]);
    expect(second.unchanged).toHaveLength(14);
  });

  it("reports a dry run without writing anything", async () => {
    const projectDirectory = await createProject();
    const originalConfig = await readFile(
      path.join(projectDirectory, "astro.config.mjs"),
      "utf8",
    );

    const result = await initializeProject(projectDirectory, { dryRun: true });

    expect(result.dryRun).toBe(true);
    expect(result.created).toHaveLength(14);
    await expect(
      readFile(
        path.join(projectDirectory, "src/astro-cms.manifest.ts"),
        "utf8",
      ),
    ).rejects.toThrow();
    await expect(
      readFile(path.join(projectDirectory, "astro.config.mjs"), "utf8"),
    ).resolves.toBe(originalConfig);
  });

  it("stops before any write when a generated file would collide", async () => {
    const projectDirectory = await createProject();
    const contentPath = path.join(projectDirectory, "content", "pages");
    await mkdir(contentPath, { recursive: true });
    await writeFile(
      path.join(contentPath, "home.json"),
      '{"belongs":"to the adopter"}\n',
      "utf8",
    );
    const originalConfig = await readFile(
      path.join(projectDirectory, "astro.config.mjs"),
      "utf8",
    );

    await expect(initializeProject(projectDirectory)).rejects.toThrow(
      "Initialization stopped without changes",
    );
    await expect(
      readFile(path.join(projectDirectory, "astro.config.mjs"), "utf8"),
    ).resolves.toBe(originalConfig);
    await expect(
      readFile(
        path.join(projectDirectory, "src/astro-cms.manifest.ts"),
        "utf8",
      ),
    ).rejects.toThrow();
  });

  it("explains missing direct project dependencies", async () => {
    const projectDirectory = await createProject({
      dependencies: {
        "@astrojs/react": undefined,
        react: undefined,
        "react-dom": undefined,
      },
    });

    await expect(initializeProject(projectDirectory)).rejects.toThrow(
      "Install the required project dependencies first",
    );
  });
});
