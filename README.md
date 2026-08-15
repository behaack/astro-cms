# Astro-CMS Feasibility Prototype

This repository starts the feasibility prototype described in [`astro-cms-project-plan.md`](./astro-cms-project-plan.md).

The scaffold proves three independent foundations:

1. A neutral, validated component document can render through native `.astro` components with no public editor runtime.
2. GrapesJS Core can manipulate that neutral component structure without becoming the canonical renderer or persistence format.
3. Unsaved editor state can be validated, handed to Astro, and returned as server-rendered HTML through the same recursive renderer used by the public page.

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

The exact-preview bridge is now proven locally. Valid editor changes are posted as neutral JSON, stored temporarily in memory, and rendered by Astro through the existing `DocumentRenderer`. The browser verifies a server-render marker before reporting a successful preview, and the preview contains no GrapesJS runtime.

Preview drafts expire after 30 minutes and disappear when the server restarts. This is deliberate for the feasibility prototype; durable drafts, authentication, publishing, and multi-user isolation remain future work.
