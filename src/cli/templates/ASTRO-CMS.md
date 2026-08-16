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

## Page metadata

`src/components/AstroCmsSeoHead.astro` is an adopter-owned native Astro
component. It renders one title, description, robots policy, Open Graph set,
and Twitter/X card set from the page document. Keep it in the real production
layout and adapt its site defaults to the website's brand.

The optional versioned `seo` object in a page document can override the legacy
top-level title and description, select a social image with required alternative
text, and constrain search visibility to `public` or `noindex`. Existing page
documents remain valid and public by default. Add Astro's `site` configuration
to produce absolute canonical and social-image URLs; without it, the component
deliberately omits a canonical URL rather than guessing the deployed domain.

## Project images

The starter Image component uses `/astro-cms-placeholder.svg`. During local
development, selecting an Image exposes **Choose from project images**, which
lists supported image files below this website's `public` directory. Editors can
upload verified PNG, JPEG, GIF, WebP, or AVIF files up to 8 MB. Astro-CMS stores
them below `public/uploads`, reports where they are used, and removes them only
when no saved page, reusable template, or active edit still references them.
Developer-managed public assets remain protected. Alternative text is required
before a page can be saved or published. Replacement and optimization remain
part of the project's normal developer workflow.

## Manage pages

**Create page** adds route-backed documents without overwriting an existing
path. **Rename page** is unavailable for `/`, refuses destination collisions,
and updates exact internal destinations in saved pages and reusable templates,
preserving their query strings and fragments. It does not create redirects for
external bookmarks or links outside Astro-CMS content. **Remove page** is
unavailable for `/` and refuses a page that is still
linked from another saved page or reusable template. Unpublished pages are
removed directly. Removing a published page runs the production build and
creates an isolated Git deletion commit, restoring the page if the operation
fails. A rename touching published content similarly builds and commits the
move and all known link updates as one rollback-safe change.

## Enable Git publishing

The editor reviews the selected page against the current Git commit (or marks a
new page as added), creates a production build, and commits only that page's
JSON file plus newly referenced uploads. Removing a tracked image or page also
uses an isolated, build-verified commit. Renaming a route commits the page move
and saved-link updates together. It never pushes automatically and it preserves
unrelated staged files.

Commit the initialized website once before using **Review & publish**:

```bash
git add astro.config.mjs src/astro-cms.manifest.ts src/components/cms \
  src/components/AstroCmsSeoHead.astro \
  src/layouts/AstroCmsPreviewLayout.astro src/pages/astro-cms-demo.astro \
  src/pages/astro-cms-demo \
  public/astro-cms-placeholder.svg content/pages/home.json ASTRO-CMS.md
git commit -m "chore: add Astro-CMS starter"
```

Adjust the Astro config filename in that command if the project uses another
supported extension. Git must also have a user name and email configured. A
publish creates a local commit and production build; pushing to a remote and
deploying remain the repository owner's existing workflow.

Astro-CMS stores component identity and approved property values in JSON. It does
not store generated HTML, arbitrary CSS, or JavaScript. The `.astro` files remain
the authoritative responsive implementation.
