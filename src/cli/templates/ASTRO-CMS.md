# Astro-CMS starter integration

The initializer added an isolated demonstration rather than replacing an existing
website page.

During local development:

- `/astro-cms-demo` renders `content/pages/home.json` through native Astro components.
- Additional page documents render at matching nested demo routes; for example,
  `/campaigns/summer` is stored at `content/pages/campaigns/summer.json` and
  builds at `/astro-cms-demo/campaigns/summer`.
- `/admin` opens the visual editor.
- `/preview` shows the editor's exact Astro-rendered preview.

The production build excludes the editor, preview, and local filesystem APIs
because `injectRoutes` is set to `"dev-only"`.

## Adapt it to this website

1. Replace the starter files in `src/components/cms` with components that follow
   this website's real design system.
2. Update `src/astro-cms.manifest.ts` so it exposes only approved properties,
   variants, and parent-child relationships.
3. Make `src/layouts/AstroCmsPreviewLayout.astro` use the same global styles,
   fonts, metadata, and shell as the real website.
4. Render the saved document from the real public route when the demonstration
   matches the website accurately.
5. Keep `injectRoutes: "dev-only"` unless production editor routes are protected
   by authentication, authorization, durable storage, and multi-user isolation.

## Enable Git publishing

The editor reviews the selected page against the current Git commit (or marks a
new page as added), creates a production build, and commits only that page's
JSON file. It never pushes automatically and it preserves unrelated staged
files.

Commit the initialized website once before using **Review & publish**:

```bash
git add astro.config.mjs src/astro-cms.manifest.ts src/components/cms \
  src/layouts/AstroCmsPreviewLayout.astro src/pages/astro-cms-demo.astro \
  src/pages/astro-cms-demo \
  content/pages/home.json ASTRO-CMS.md
git commit -m "chore: add Astro-CMS starter"
```

Adjust the Astro config filename in that command if the project uses another
supported extension. Git must also have a user name and email configured. A
publish creates a local commit and production build; pushing to a remote and
deploying remain the repository owner's existing workflow.

Astro-CMS stores component identity and approved property values in JSON. It does
not store generated HTML, arbitrary CSS, or JavaScript. The `.astro` files remain
the authoritative responsive implementation.
