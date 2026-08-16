# Astro-CMS Package Distribution

## Current status

`@astro-cms/core@0.1.0` can be packed and installed as a normal package archive.
It is not published to a package registry yet. The package name and API should
still be treated as prerelease.

The archive exposes:

- `@astro-cms/core/integration`
- `@astro-cms/core/renderer`
- `@astro-cms/core/store`
- `@astro-cms/core/git`
- `@astro-cms/core/types`
- `@astro-cms/core/contract`
- the `astro-cms` command

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
10. Installs the archive in a bare Astro project and runs `astro-cms init`.
11. Confirms the initializer preserves the existing page and becomes a no-op on its second run.
12. Type-checks and builds the generated project, including its route-backed native pages.

Set `ASTRO_CMS_PNPM_STORE_DIR` when verification should use a specific pnpm
store. The generated `.package-verification` directory is intentionally
disposable and ignored by Git.

## Install an archive

In an Astro project:

```bash
pnpm add ./astro-cms-core-0.1.0.tgz
pnpm add astro @astrojs/react react react-dom
```

Review and create the starter integration:

```bash
pnpm exec astro-cms init --dry-run
pnpm exec astro-cms init
```

The initializer creates:

- `src/astro-cms.manifest.ts`
- six native components in `src/components/cms`, including a safe Image primitive
- `public/astro-cms-placeholder.svg` as a visible starter asset
- `src/layouts/AstroCmsPreviewLayout.astro`
- `src/components/AstroCmsSeoHead.astro`
- the isolated `src/pages/astro-cms-demo.astro` route
- `src/pages/astro-cms-demo/[...path].astro` for additional page documents
- `content/pages/home.json`
- `ASTRO-CMS.md` with project-specific next steps

It also adds React and Astro-CMS to a conventional `defineConfig({...})`
integration array. Existing integrations and pages are preserved. Running it a
second time makes no changes. If any generated path already contains different
content, if required direct dependencies are missing, or if the Astro config is
computed or nonstandard, the command stops before writing. There is deliberately
no force-overwrite option.

The generated page is a safe demonstration, not a replacement for the adopting
site's homepage. Once it accurately uses the site's components and layout, the
developer can render its saved document from a real public route.

## Review and publish through Git

After the starter integration is committed once, the editor's **Review &
publish** action:

1. Reads the selected page from the current Git commit, or recognizes it as a
   newly created page that is not tracked yet.
2. Compares that baseline with the editor's prospective document, even when a
   tracked draft was already saved to the working tree.
3. Finds newly uploaded images referenced by approved image properties and
   presents them alongside the plain-language content changes.
4. Records a combined page-and-image revision so a later external save or
   asset change cannot be published from a stale review.
5. Writes deterministically ordered JSON and runs the production build.
6. Creates a commit containing only the selected route's page document and its
   newly referenced uploads.

Unrelated staged files remain staged and are not included. A staged change to
the page or a referenced upload is refused because its ownership is ambiguous.
If the build or commit fails, the previous page source is restored and the
uploaded file remains available for retry. An unchanged page with no new asset
does not create an empty commit.

This is deliberately a local Git boundary. Astro-CMS does not push, open a pull
request, choose a branch, or trigger a hosting provider. Existing repository
automation can do those jobs once the project owner chooses the desired policy.
Git must be installed, the repository must have an initial commit, and a Git
user name and email must be configured. A newly created page may be untracked;
an already staged active page is refused because ownership would be ambiguous.

## Manage uploaded images safely

The project-image chooser distinguishes developer-managed files from raster
images uploaded through Astro-CMS. It reports references from every saved page
and reusable template, and the removal endpoint also checks the active unsaved
page supplied by the editor. An image cannot be removed while any of those
references remain.

An unused upload that has never been committed is removed directly. Removing
an unused upload already tracked by Git first verifies that the file is
unchanged and unstaged, removes it, runs the production build, and creates an
isolated Git commit containing only that deletion. If the build or commit
fails, the original bytes are restored. Unrelated staged files remain staged.
Files elsewhere in `public`, symbolic links, and malformed upload paths cannot
be removed through this endpoint.

## Retire pages without breaking known links

The editor never offers deletion for `/`. Before removing another route, it
scans every saved page and reusable template for approved URL properties that
target the route, including destinations with query strings or fragments. Any
incoming link blocks removal and identifies the page or template that must be
updated first. A page's own self-links do not block retiring that page.

An untracked draft page is removed without creating a commit. A tracked page
is removed only after a production build succeeds, then committed as an
isolated deletion. Staged changes to the target page are refused, unrelated
staged files are preserved, and the current page source is restored if the
build or commit fails. Page publication, image removal, and page removal share
one local operation lock so their builds and Git commits cannot overlap.

## Rename pages and repair saved links

**Rename page** is unavailable for `/` and refuses an existing or Git-tracked
destination. The operation scans every saved page and reusable template using
the adopting project's component manifest. Exact internal destinations in URL
properties are changed to the new route while query strings and fragments are
preserved; external URLs and longer child routes are left unchanged.

When every affected file is untracked, the rename remains an unpublished local
change and does not build or commit. If the source page or any rewritten file
is tracked, Astro-CMS runs the production build and creates one isolated commit
containing the old-path deletion, new-path document, and all link rewrites.
Affected staged files are refused, unrelated staged files remain staged, and
every changed source is restored if the build or commit fails. Rename shares
the same local operation lock as publishing and removal.

This link repair covers only content represented by the approved component
contract. It does not create a redirect for external bookmarks, search engines,
hand-written code, or content outside the page and template stores.

## Configure manually

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

The same archive command was browser-tested after initialization: the generated
editor loaded its six starter components, exposed the site's public images,
rendered a selected asset through the exact Astro preview, persisted an edited
heading, and rendered the generated public page with no console errors.

The archive-installed editor was also tested through the complete Git loop. A
saved heading change produced a semantic review, an exact page-only commit, and
a production artifact containing the change. A second browser run created
`/campaigns/summer`, assembled and previewed its native components, published
commit `7934576` containing only `content/pages/campaigns/summer.json`, and
verified `/astro-cms-demo/campaigns/summer` in the static build. The production
build still omitted `/admin`, and the repository was clean afterward.

This proves archive distribution, safe initialization, and local Git publishing
for conventional Astro projects. It does not prove registry publishing,
semantic-version compatibility, migrations, remote push/deployment policy,
external redirect policy, image replacement/optimization, nonstandard/computed
config modification, or support across multiple Astro versions.
