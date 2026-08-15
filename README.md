# Astro-CMS Feasibility Prototype

This repository starts the feasibility prototype described in [`astro-cms-project-plan.md`](./astro-cms-project-plan.md).

The scaffold proves five independent foundations:

1. A neutral, validated component document can render through native `.astro` components with no public editor runtime.
2. GrapesJS Core can manipulate that neutral component structure without becoming the canonical renderer or persistence format.
3. Unsaved editor state can be validated, handed to Astro, and returned as server-rendered HTML through the same recursive renderer used by the public page.
4. A page can be assembled from a blank document with enforced parent-child rules, a synchronized document tree, safe move/delete/undo behavior, and fresh identities for duplicated subtrees.
5. The private editor shell can run as a React island while saved pages remain neutral, Git-readable JSON rendered only by native Astro components.

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

## Current boundary

The exact-preview, direct-composition, and durable local-save bridges are now proven locally. The native Astro preview is the primary editing canvas: users can select rendered nodes, choose or drag approved components to visible insertion points, and reorder existing nodes with pointer dragging. Valid changes are posted as neutral JSON, stored temporarily in memory for rapid preview, and rendered by Astro through the existing `DocumentRenderer`.

The editor can start from an empty page, add only valid component relationships, navigate the neutral document as a tree, move components without changing identity, duplicate complete subtrees with fresh identities, and restore deleted identities through undo. One placement policy controls the palette, direct Astro insertion points, pointer reordering, explicit composition controls, and the hidden GrapesJS structure engine. Real pointer testing confirms palette-to-Astro insertion, Astro-node selection, root-section reordering, server rerendering, and stable identities.

`Save to project` validates the current neutral document and atomically replaces [`content/pages/home.json`](./content/pages/home.json). `Reload project file` reads it back through the same server-side storage adapter. The public page, metadata preview, and editor initialization all read that file, so a browser refresh proves a true round trip rather than a browser-cache trick.

React is used only to mount and manage the private `/admin` shell. It does not render any website component and no React replica of an Astro component exists. GrapesJS remains an editing-mechanics adapter; Astro remains the authoritative renderer.

In-memory live-preview drafts still expire after 30 minutes and disappear when the server restarts. The project-file save path is intentionally local-first and assumes a writable filesystem; hosted and serverless persistence remains future work. Reusable templates, interactive Astro islands, authentication, publishing, and multi-user isolation also remain future work.
