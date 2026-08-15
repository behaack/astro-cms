# Astro-CMS Package Distribution

## Current status

`@astro-cms/core@0.1.0` can be packed and installed as a normal package archive.
It is not published to a package registry yet. The package name and API should
still be treated as prerelease.

The archive exposes:

- `@astro-cms/core/integration`
- `@astro-cms/core/renderer`
- `@astro-cms/core/store`
- `@astro-cms/core/types`
- `@astro-cms/core/contract`

GrapesJS and Zod are package runtime dependencies. Astro, the Astro React
integration, React, and React DOM are peer dependencies so an adopting site
uses one framework installation.

## Create and verify the archive

```bash
pnpm pack --pack-destination .package-verification
pnpm verify:package
```

`prepack` runs the core type check and tests. `verify:package` then:

1. Creates the package archive.
2. Copies the independent adoption site into an ignored verification directory.
3. Replaces its workspace dependency with the archive.
4. Removes direct GrapesJS and Zod dependencies from the consumer.
5. Installs with workspace resolution disabled.
6. Verifies the consumer resolves the archive rather than this repository.
7. Runs the consumer's Astro type check and production build.
8. Confirms internal tests and the sample manifest are absent from the archive.
9. Confirms the production build does not contain `/admin`.

Set `ASTRO_CMS_PNPM_STORE_DIR` when verification should use a specific pnpm
store. The generated `.package-verification` directory is intentionally
disposable and ignored by Git.

## Install an archive

In an Astro project:

```bash
pnpm add ./astro-cms-core-0.1.0.tgz
pnpm add astro @astrojs/react react react-dom
```

Configure Astro with the project's own manifest, native component directory,
and preview layout:

```js
import react from "@astrojs/react";
import astroCms from "@astro-cms/core/integration";
import { defineConfig } from "astro/config";

export default defineConfig({
  integrations: [
    react(),
    astroCms({
      manifest: "src/astro-cms.manifest.ts",
      components: "src/components/cms",
      previewLayout: "src/layouts/SiteLayout.astro",
      injectRoutes: "dev-only",
    }),
  ],
});
```

The adopting site continues to own its `.astro` components, layouts, styles,
content, public routes, and deployment adapter.

Use `injectRoutes: "dev-only"` for the local-first workflow. Setting it to
`true` also includes the editor and filesystem write APIs in production; do not
do that without an explicit authentication, authorization, and durable-storage
boundary.

## Proven boundary

The archive was installed into a consumer with workspace linking disabled. That
consumer type-checked, rendered its native components in the editor, saved a
changed page, created a production build, and served the customized output. The
public page loaded no client scripts or editor markers, and `/admin` returned
404 in production.

This proves archive distribution. It does not prove registry publishing,
semantic-version compatibility, automated project initialization, migrations,
or support across multiple Astro versions.
