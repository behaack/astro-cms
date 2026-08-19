# Astro-CMS Feasibility Prototype

This repository starts the feasibility prototype described in [`astro-cms-project-plan.md`](./astro-cms-project-plan.md).

The scaffold proves eighteen independent foundations:

1. A neutral, validated component document can render through native `.astro` components with no public editor runtime.
2. GrapesJS Core can manipulate that neutral component structure without becoming the canonical renderer or persistence format.
3. Unsaved editor state can be validated, handed to Astro, and returned as server-rendered HTML through the same recursive renderer used by the public page.
4. A page can be assembled from a blank document with enforced parent-child rules, a synchronized document tree, safe move/delete/undo behavior, and fresh identities for duplicated subtrees.
5. The private editor shell can run as a React island while saved pages remain neutral, Git-readable JSON rendered only by native Astro components.
6. A new native Astro component can be exposed through one declarative manifest entry, with its editor controls, placement rules, validation, type contract, and Astro rendering derived without changes to the editor runtime.
7. A selected subtree can be saved as a reusable, Git-readable template, inserted with fresh identities, customized independently, saved durably, and turned into a verified Astro production build.
8. An independent Astro site can consume the system through `@astro-cms/core` while keeping its own manifest, native components, layout, styling, content, and public route.
9. Editor and local-write routes can exist during development while remaining absent from the production build; the public page loads no editor runtime.
10. A packaged command can safely initialize a conventional existing Astro project, preserve its current page and integrations, refuse file collisions, and produce a checked, buildable starter integration.
11. A saved or unsaved page can be reviewed against the last Git commit in plain language, protected against stale-file overwrites, built for production, and committed without including unrelated staged files.
12. Editors can list, create, and switch among route-backed pages; a newly created nested page can pass through the exact Astro preview, deterministic storage, page-only Git publishing, and a real static public route.
13. Image properties can browse the adopting site's public assets, require alternative text, reject non-image protocols, and update the native Astro preview without exposing file paths outside the public directory.
14. Editors can upload verified raster images into a collision-safe `public/uploads` library, use them immediately in the exact Astro preview, and publish each newly referenced image in the same isolated Git commit as its page.
15. The image library reports usage across saved pages and reusable templates, protects references in the active unsaved page, removes unpublished orphans directly, and removes unused published uploads through an isolated, build-verified Git commit.
16. Editors can retire non-home pages only after incoming links from every saved page and reusable template have been cleared; unpublished drafts are removed directly, while published routes use an isolated, build-verified Git deletion commit with rollback.
17. Editors can rename non-home page routes while every manifest-approved internal link in saved pages and reusable templates is rewritten automatically, preserving query strings and fragments; tracked renames are production-built and committed as one isolated, rollback-safe change.
18. Marketing users can edit constrained search and sharing metadata, choose a protected project image, preview the result, review the changes in plain language, and publish native Astro head tags from an archive-installed fresh website.

## Run it

```bash
pnpm install
pnpm dev
```

Open:

- `/` for the native Astro-rendered sample page.
- `/preview` for the same page with editor boundary metadata.
- `/admin` for the constrained editor and its embedded live Astro preview.

## Verify it

```bash
pnpm check
pnpm test
pnpm build
```

Use `pnpm test:watch` while developing to rerun affected tests as files change. GitHub Actions runs `pnpm check` and `pnpm test` for every pull request and every push to `main`.

The final thesis evidence and its explicit limits are recorded in [`THESIS.md`](./THESIS.md).

## Independent adoption proof

[`examples/adoption-site`](./examples/adoption-site) is a second Astro site with a different component vocabulary and design. It consumes the workspace package without copying the editor, validation, preview, persistence, template, or publishing implementation.

```bash
pnpm --dir examples/adoption-site check
pnpm --dir examples/adoption-site build
pnpm --dir examples/adoption-site dev
```

Its three-path integration configuration and verified workflow are documented in [`examples/adoption-site/README.md`](./examples/adoption-site/README.md).

## Package distribution proof

`@astro-cms/core@0.1.0` now produces a clean package archive with explicit exports, runtime dependencies, Astro/React peer dependencies, MIT licensing, and prepack checks. `pnpm verify:package` installs that archive into ignored, non-workspace consumers, type-checks and builds them, confirms that production excludes the editor route, preserves the adopter's existing homepage, and asserts the generated title, description, robots, canonical, Open Graph, and Twitter metadata.

The archive contract, installation example, safety boundary, and remaining release gaps are documented in [`DISTRIBUTION.md`](./DISTRIBUTION.md).

## Initialize an Astro project

After installing the package and its framework peers, inspect the planned changes and then initialize:

```bash
pnpm exec astro-cms init --dry-run
pnpm exec astro-cms init
```

The command adds an isolated `/astro-cms-demo` route family, six native starter components, a sample public image, a manifest, preview layout, editable JSON document, and local adaptation guide. The root demo reads `content/pages/home.json`; additional documents such as `content/pages/campaigns/summer.json` build at `/astro-cms-demo/campaigns/summer`. It updates a conventional `defineConfig({...})` Astro configuration while preserving existing integrations. It has no force mode: a conflicting file or unsupported config shape stops the run before any project file is changed.

Commit the initialized files once, then **Review & publish** in `/admin` provides a local Git publishing loop. It compares the selected page with `HEAD` (or recognizes a newly created page), summarizes content and newly referenced image changes, shows the technical page diff on demand, creates a production build, and commits only that page document plus its new uploaded images. It never pushes or deploys automatically.

## Usability gate

The next decision is human rather than architectural. [`USABILITY-PILOT.md`](./USABILITY-PILOT.md) contains the moderator protocol, objective measures, and go/iterate/rethink rule. The independent fixture includes a participant-facing campaign brief and a deterministic `pnpm pilot:reset` command so each session begins from the same content.

## Current boundary

The exact-preview, direct-composition, and durable local-save bridges are now proven locally. The native Astro preview is the primary editing canvas: users can select rendered nodes, choose or drag approved components to visible insertion points, and reorder existing nodes with pointer dragging. Valid changes are posted as neutral JSON, stored temporarily in memory for rapid preview, and rendered by Astro through the existing `DocumentRenderer`.

The editor can start from an empty page, add only valid component relationships, navigate the neutral document as a tree, move components without changing identity, duplicate complete subtrees with fresh identities, and restore deleted identities through undo. One placement policy controls the palette, direct Astro insertion points, pointer reordering, explicit composition controls, and the hidden GrapesJS structure engine. Real pointer testing confirms palette-to-Astro insertion, Astro-node selection, root-section reordering, server rerendering, and stable identities.

The page selector lists route-backed documents, and **Create page** adds a validated blank document without overwriting an existing route. `/` maps to [`content/pages/home.json`](./content/pages/home.json); nested routes map predictably below `content/pages` (for example, `/campaigns/summer` maps to `content/pages/campaigns/summer.json`). `Save changes` validates and atomically replaces the selected file, while reload and exact preview read that same file through the server-side storage adapter. **Rename page** is disabled for `/`, refuses destination collisions and staged affected files, rewrites exact saved internal links in pages and reusable templates, and preserves their query strings and fragments. An unpublished rename stays local; a rename touching tracked content runs the production build and commits the move plus link updates atomically. **Remove page** is also disabled for `/` and refuses any route still targeted by an approved URL property in another page or reusable template. Removing an untracked draft deletes only its local file; removing a tracked page runs the production build and commits only that deletion. Both operations restore their prior files if verification or Git publication fails.

React is used only to mount and manage the private `/admin` shell. It does not render any website component and no React replica of an Astro component exists. GrapesJS remains an editing-mechanics adapter; Astro remains the authoritative renderer.

The component registry is now manifest-driven. `Callout.astro` was added as a seventh primitive without changing the core editor: its palette entry, generated property controls, placement policy, neutral schema type, and renderer mapping all come from [`src/cms/component-manifest.ts`](./src/cms/component-manifest.ts). Native implementations are discovered statically by the matching `src/components/primitives/<Type>.astro` filename.

Selected component subtrees can be saved as copy-based reusable templates. Templates are validated and atomically written to `content/templates`, and every insertion generates fresh node identities so copies can safely diverge. **Review & publish** compares the active page with its committed version, protects the review with a page-and-asset revision, saves deterministically, runs the installed Astro production builder, and creates an isolated Git commit containing the page and any newly referenced uploads. It does not push that commit or claim to deploy the artifact to a hosting provider.

Manifest properties marked as `image` retain a normal inspectable string path but add a project-image chooser in the editor. The chooser recursively lists supported images from `public`, skips hidden directories and symbolic links, and changes only the selected approved property. Editors can also upload PNG, JPEG, GIF, WebP, or AVIF files up to 8 MB. Uploads are verified from their file signature, safely renamed without overwriting existing files, and confined to `public/uploads`; SVG upload is deliberately excluded. Each image card reports its saved page and reusable-template usage, while the active unsaved page is checked in the browser and again by the server. Developer-managed public images cannot be deleted in the editor. An unused unpublished upload can be removed directly; removing an unused tracked upload runs the production build and creates an image-only Git commit while preserving unrelated staged work. Image sources accept relative, HTTP, or HTTPS paths, and alternative text remains required by document validation.

**Search & sharing** exposes the page's search title, description, public or `noindex` visibility, social image, and required image description without exposing canonical URLs or arbitrary robots directives. Approximate search-result and social-card previews update with the draft. The settings use the same project-image library, save in the neutral page document, appear in the plain-language publish review, and render through the adopter-owned native Astro head component.

## Register a native Astro component

1. Add `src/components/primitives/<Type>.astro`. Accept only the properties the editor should expose, plus the optional `editorId` boundary marker.
2. Add one `<Type>` entry to `src/cms/component-manifest.ts` with its category, valid parents, properties, options, and defaults.

No GrapesJS adapter, React renderer, document type list, schema enum, palette, or Astro registry file should be edited. The production build fails if a manifested primitive does not have a matching Astro file.

In-memory live-preview drafts still expire after 30 minutes and disappear when the server restarts. The project-file save and upload paths are intentionally local-first and assume a writable filesystem; hosted and serverless persistence remains future work. Git publishing covers the selected tracked or newly created page plus newly referenced uploads and requires a repository baseline plus a configured Git identity. Route renaming now updates known saved internal links, but it deliberately does not create redirect aliases for external bookmarks, search indexes, or links outside the project; that redirect policy remains developer-owned. Deletion uses a conservative incoming-link check and isolated Git history. Page documents now support validated, versioned SEO metadata; the marketing-facing form and previews are implemented; and adopter-owned native Astro head components render canonical, robots, Open Graph, and Twitter/X tags when Astro's `site` URL is configured. Sitemap and `robots.txt` generation, image replacement, optimization, dimensions and file-size metadata, and cross-document replacement remain future work. Linked reusable components, interactive Astro islands, authentication, remote push/deployment integration, and multi-user isolation also remain future work. The package archive, initializer, generated SEO head, browser save, local Git publish, and preservation of an existing adopter homepage are proven locally; registry publication, stable versioning, migrations, support for nonstandard Astro configs, and cross-version compatibility have not been proven.
