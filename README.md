# Astro-CMS Feasibility Prototype

This repository starts the feasibility prototype described in [`astro-cms-project-plan.md`](./astro-cms-project-plan.md).

The scaffold proves nine independent foundations:

1. A neutral, validated component document can render through native `.astro` components with no public editor runtime.
2. GrapesJS Core can manipulate that neutral component structure without becoming the canonical renderer or persistence format.
3. Unsaved editor state can be validated, handed to Astro, and returned as server-rendered HTML through the same recursive renderer used by the public page.
4. A page can be assembled from a blank document with enforced parent-child rules, a synchronized document tree, safe move/delete/undo behavior, and fresh identities for duplicated subtrees.
5. The private editor shell can run as a React island while saved pages remain neutral, Git-readable JSON rendered only by native Astro components.
6. A new native Astro component can be exposed through one declarative manifest entry, with its editor controls, placement rules, validation, type contract, and Astro rendering derived without changes to the editor runtime.
7. A selected subtree can be saved as a reusable, Git-readable template, inserted with fresh identities, customized independently, saved durably, and turned into a verified Astro production build.
8. An independent Astro site can consume the system through `@astro-cms/core` while keeping its own manifest, native components, layout, styling, content, and public route.
9. Editor and local-write routes can exist during development while remaining absent from the production build; the public page loads no editor runtime.

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

`@astro-cms/core@0.1.0` now produces a clean package archive with explicit exports, runtime dependencies, Astro/React peer dependencies, MIT licensing, and prepack checks. `pnpm verify:package` installs that archive into an ignored, non-workspace consumer, then type-checks and builds the consumer while confirming that production excludes the editor route.

The archive contract, installation example, safety boundary, and remaining release gaps are documented in [`DISTRIBUTION.md`](./DISTRIBUTION.md).

## Usability gate

The next decision is human rather than architectural. [`USABILITY-PILOT.md`](./USABILITY-PILOT.md) contains the moderator protocol, objective measures, and go/iterate/rethink rule. The independent fixture includes a participant-facing campaign brief and a deterministic `pnpm pilot:reset` command so each session begins from the same content.

## Current boundary

The exact-preview, direct-composition, and durable local-save bridges are now proven locally. The native Astro preview is the primary editing canvas: users can select rendered nodes, choose or drag approved components to visible insertion points, and reorder existing nodes with pointer dragging. Valid changes are posted as neutral JSON, stored temporarily in memory for rapid preview, and rendered by Astro through the existing `DocumentRenderer`.

The editor can start from an empty page, add only valid component relationships, navigate the neutral document as a tree, move components without changing identity, duplicate complete subtrees with fresh identities, and restore deleted identities through undo. One placement policy controls the palette, direct Astro insertion points, pointer reordering, explicit composition controls, and the hidden GrapesJS structure engine. Real pointer testing confirms palette-to-Astro insertion, Astro-node selection, root-section reordering, server rerendering, and stable identities.

`Save to project` validates the current neutral document and atomically replaces [`content/pages/home.json`](./content/pages/home.json). `Reload project file` reads it back through the same server-side storage adapter. The public page, metadata preview, and editor initialization all read that file, so a browser refresh proves a true round trip rather than a browser-cache trick.

React is used only to mount and manage the private `/admin` shell. It does not render any website component and no React replica of an Astro component exists. GrapesJS remains an editing-mechanics adapter; Astro remains the authoritative renderer.

The component registry is now manifest-driven. `Callout.astro` was added as a seventh primitive without changing the core editor: its palette entry, generated property controls, placement policy, neutral schema type, and renderer mapping all come from [`src/cms/component-manifest.ts`](./src/cms/component-manifest.ts). Native implementations are discovered statically by the matching `src/components/primitives/<Type>.astro` filename.

Selected component subtrees can be saved as copy-based reusable templates. Templates are validated and atomically written to `content/templates`, and every insertion generates fresh node identities so copies can safely diverge. `Publish build` validates and saves the active page, runs the installed Astro production builder, and reports whether a deployable `dist/` artifact was created. It does not claim to deploy that artifact to a hosting provider.

## Register a native Astro component

1. Add `src/components/primitives/<Type>.astro`. Accept only the properties the editor should expose, plus the optional `editorId` boundary marker.
2. Add one `<Type>` entry to `src/cms/component-manifest.ts` with its category, valid parents, properties, options, and defaults.

No GrapesJS adapter, React renderer, document type list, schema enum, palette, or Astro registry file should be edited. The production build fails if a manifested primitive does not have a matching Astro file.

In-memory live-preview drafts still expire after 30 minutes and disappear when the server restarts. The project-file save path is intentionally local-first and assumes a writable filesystem; hosted and serverless persistence remains future work. Linked reusable components, interactive Astro islands, authentication, deployment-provider integration, and multi-user isolation also remain future work. The package boundary is currently workspace/source based; npm packaging, versioning, installation automation, and cross-version compatibility have not been proven.
