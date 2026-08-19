# Astro-CMS Project Plan

## 1. Vision

Astro-CMS is an open-source visual composition and publishing system for Astro websites.

Its central promise is:

> **Marketing can assemble pages from well-designed sections, change their content, preview them accurately, and publish—without being able to alter the underlying responsive design.**

Developers continue to build native Astro components and control the site's HTML, CSS, responsive behavior, accessibility, JavaScript, and application logic. Marketing works with a safe visual vocabulary made from those components.

The project is a solution first, not a hosted product first. The immediate goal is to solve this workflow well for one Astro site and make the solution reusable. Authentication, managed hosting, enterprise workflow, marketplaces, and commercial packaging are later concerns.

---

## 2. The Problem

Most content management systems give marketing one of two unsatisfactory choices:

1. Edit structured forms without seeing the real page.
2. Use a free-form visual builder that can undermine the developer's design system.

Astro developers need a third option:

- The website remains a normal Astro project.
- The rendered site remains native Astro output.
- Marketing gets a visual, page-oriented editing experience.
- Marketing can compose new pages and reusable sections.
- Developers decide which components, properties, variants, and nesting relationships are allowed.
- Content remains portable and can live in Git.

This is not intended to let a nontechnical user invent an entire design system from a blank canvas. It is intended to let them use a good design system productively without breaking it.

---

## 3. Primary Users

### Developer or Agency

The developer:

- Builds native `.astro` components normally.
- Registers selected components with Astro-CMS.
- Defines editable properties and allowed values.
- Defines where components may be inserted or nested.
- Controls design tokens and responsive behavior.
- Hands page composition and routine publishing to marketing.

### Marketing Editor

The marketing editor:

- Creates and edits pages visually.
- Adds, removes, reorders, and duplicates approved components.
- Changes text, images, links, and approved variants.
- Saves useful compositions as reusable components.
- Previews the result through the real Astro renderer.
- Publishes without working directly with Git or source code.

---

## 4. Product Boundary

### Astro-CMS Is

- An Astro-native component registration contract.
- A constrained visual page composer.
- A visual property editor.
- A reusable-composition system.
- An accurate Astro preview system.
- A portable content format.
- A Git-compatible publishing layer.

### Astro-CMS Is Not

- A general-purpose HTML/CSS design tool.
- A Wix, Webflow, or Framer replacement.
- A JavaScript application builder.
- A theme marketplace.
- A proprietary content database.
- A system that converts arbitrary visual edits back into hand-written source code.

The defining boundary is:

> Users may compose trusted components and configure approved properties. They may not introduce arbitrary HTML, CSS, or executable JavaScript.

---

## 5. Architectural Principles

### 5.1 Astro is the only production renderer

The published page must be rendered by the project's real Astro components.

Astro-CMS must not require React versions of those components, a parallel component library, or a client-side page runtime. Interactive islands remain an ordinary developer decision.

### 5.2 The editor edits a document, not generated HTML

The canonical source is a declarative component tree containing component types, properties, slots, and references.

HTML is rendered output. It is not the round-trip editing format.

### 5.3 Generated `.astro` files are optional output

Astro-CMS may generate thin `.astro` page files or use an Astro route that renders a page document. Generated files must not become the only source from which the editor reconstructs its state.

### 5.4 Developer components are executable; editor components are declarative

A developer-created primitive may contain Astro, CSS, and JavaScript.

A marketing-created reusable component contains only:

- References to approved primitives or other safe composites.
- Property values and defaults.
- Slot contents.
- Approved design-token choices.
- A declaration of which properties its users may edit.

### 5.5 Exact preview is a requirement

The editor must preview the actual Astro-rendered result. A visually similar second renderer is not sufficient for the finished solution.

### 5.6 Portability takes priority over editor lock-in

The canonical page and component documents should use an Astro-CMS-owned, documented schema rather than an editor vendor's private project format.

### 5.7 React-based component editors are not the foundation

Puck and similar React component editors are intentionally excluded as the core editing engine. Even if React were confined to a private admin route, their component contracts would require React render functions or React replicas of native Astro components. That would create two rendering models and weaken exact preview.

Astro-CMS may use browser JavaScript for editing mechanics, but native `.astro` components remain the only implementation of the published design system.

The private editor shell may itself be a React island. That is an implementation detail of the administration interface, not a second website renderer: React must never supply render functions or replicas for registered Astro components, and the neutral document must remain the boundary between the editor and Astro.

---

## 6. Editing Engine: GrapesJS Core

[GrapesJS Core](https://github.com/GrapesJS/grapesjs) is the leading candidate for the editing mechanics. It is framework-independent, BSD-3-Clause licensed, and designed to be embedded as a web-builder framework.

Astro-CMS should use GrapesJS Core for capabilities such as:

- Component selection.
- Drag-and-drop.
- Component nesting.
- Layers and hierarchy navigation.
- Property controls through traits.
- Block insertion.
- Undo and redo.
- Copy, duplicate, move, and delete commands.
- Extensible editor panels and commands.

Astro-CMS should not use GrapesJS as the production renderer or canonical data model. The commercial GrapesJS Studio SDK is not required for the open-source core solution.

The adapter must disable or omit GrapesJS capabilities that violate the product boundary:

- Generic HTML blocks.
- Arbitrary code blocks.
- Arbitrary CSS editing.
- Unrestricted Style Manager controls.
- Arbitrary DOM restructuring inside registered components.
- Unapproved scripts, embeds, or URLs.

Each Astro-CMS component becomes a custom GrapesJS component type with explicit rules for whether it is selectable, editable, draggable, droppable, duplicable, or removable.

### Go/No-Go Requirement

GrapesJS is a candidate dependency until a technical spike proves all of the following:

1. A native `.astro` component can be represented as a locked custom component in the canvas.
2. Its approved properties can be edited through generated controls.
3. Nested component slots can be composed safely.
4. The editor can preserve stable component identities.
5. Changes can be serialized into the neutral Astro-CMS document.
6. The actual Astro renderer can provide an acceptably accurate and responsive editing preview.

If the preview bridge cannot meet these requirements without fighting GrapesJS's internal model, Astro-CMS should retain its document and component contracts and replace only the editing engine.

### Spike Status — 2026-08-15

The exact-preview bridge has passed its first architectural proof:

- Unsaved neutral JSON is validated on the server before rendering.
- A temporary draft ID addresses the unsaved document without making editor HTML canonical.
- A full Astro-rendered iframe uses the same `DocumentRenderer` and native `.astro` primitives as the public route.
- Edited content is present in the returned HTML before client JavaScript runs.
- The preview contains stable editor boundaries and no GrapesJS runtime.
- Phone, tablet, and desktop preview widths use the native responsive CSS.
- Invalid nesting is rejected before it reaches the renderer.

This resolves preview questions 4 and 5 in favor of a validated draft protocol plus a continuously updated exact-preview pane. The composition update below resolves constrained pointer-based drag-and-drop, reordering, removal, and selection synchronization; rapid-edit latency, reusable templates, durable reload, and interactive Astro islands still require deliberate testing.

### Composition Spike Update — 2026-08-15

The safe-composition layer has now passed a browser-driven vertical test:

- A user can start with an empty document and assemble `Section → Stack → Heading/Text/Button` through visible controls.
- The page root accepts only `Section`; `Section` and `Stack` accept only their declared child types; leaf components accept none.
- One placement policy drives explicit insertion and GrapesJS draggable/droppable hooks.
- A document-tree view stays synchronized with GrapesJS selection and the exact Astro preview.
- Moving a component preserves its stable ID.
- Duplicating a subtree generates fresh IDs for the root and every descendant.
- Delete followed by undo restores the exact deleted IDs and structure.
- Every accepted operation remains a valid neutral document and reaches the server-rendered Astro iframe.
- The tested phone preview has no horizontal overflow.
- Real Chromium pointer tests can drag `Section` to the page root, `Stack` into `Section`, and `Heading` into `Stack`.
- An invalid `Text` drop at the page root is rejected visibly and leaves the neutral document unchanged.
- Reordering two sections by pointer reverses their canonical order without changing either ID.

**GrapesJS go decision:** keep GrapesJS Core as the editing-mechanics dependency and proceed to the local vertical slice. The engine has now preserved the neutral document contract through exact preview, constrained pointer insertion, invalid-drop rejection, pointer reordering, explicit composition commands, and stable identity handling.

This is not evidence that the complete product is solved. Reusable templates, interactive Astro islands, rapid-edit latency under sustained editing, and nontechnical-user usability remain open.

### Local Save/Reload Update — 2026-08-15

The first durable local vertical slice is now implemented:

- The private editor shell is hydrated as a React island, while GrapesJS remains an imperative editing adapter inside it.
- React does not render or duplicate any website component.
- A server-side local storage adapter validates neutral documents and maps routes to deterministic files: `/` uses `content/pages/home.json`, while `/campaigns/summer` uses `content/pages/campaigns/summer.json`.
- The editor can list route-backed documents, create a validated blank page without overwriting an existing route, and switch the exact preview and publishing target together.
- Saves write a uniquely named temporary file and replace the page file only after the complete document has been written.
- The public page, metadata preview, and editor initialization all read the same project file on request.
- Reload passes through the server storage adapter rather than browser storage.
- The file remains formatted, inspectable JSON suitable for Git review.

This proves local durability, multi-page addressing, and editor-shell isolation. It does not prove hosted persistence, multi-user concurrency, page rename/deletion policy, or nontechnical-user usability.

### Direct Astro Canvas Update — 2026-08-15

The actual Astro-rendered iframe is now the primary editing canvas rather than a secondary proof pane:

- Clicking a rendered Astro node selects the matching stable component ID and updates its property controls.
- Editor-only slot markers identify valid child containers without exposing component-internal HTML to the editor.
- Choosing a palette component reveals only insertion points allowed by the neutral placement policy.
- Palette components can be dragged directly to those insertion points.
- Existing Astro-rendered components can be pointer-dragged to compatible insertion points for reordering.
- Direct moves change the neutral document, preserve stable IDs, and return through the native Astro renderer.
- GrapesJS remains mounted offscreen as the structure, trait, selection, and history engine; it is no longer the visual surface presented as the page.
- Editor slot markers and insertion controls are absent from the published route, which still loads neither React nor GrapesJS.

Browser verification selected a native heading, inserted a component through an Astro insertion point, dragged a palette Section into the canvas, and reversed two root Sections by pointer while preserving both IDs. The remaining product risks are sustained-edit latency, inline text editing, reusable compositions, and nontechnical-user usability.

### Registry Generalization Update — 2026-08-15

The component-registration architecture has passed its extensibility gate:

- A single pure-data manifest now defines each component's editor label, category, approved properties, defaults, root eligibility, and valid parents.
- The neutral component type and schema enum are derived from the manifest rather than a second hand-maintained list.
- Child-placement rules are derived from each child's declared valid parents.
- Vite statically discovers native components by the `src/components/primitives/<Type>.astro` filename convention and fails clearly when a manifested implementation is missing.
- `Callout.astro` was added as a seventh developer-written primitive without changing the GrapesJS editor runtime, React editor shell, document adapter, validation code, or recursive Astro renderer.
- The editor automatically displayed Callout in the palette, generated its Message and Tone controls, restricted it to Section and Stack, preserved it in neutral JSON, and rendered it through Astro.
- Browser verification inserted Callout through a native Astro insertion point, edited both generated properties, atomically saved it, and loaded it from the public Astro route with no editor markers or editor resources.
- Responsive browser testing also exposed and corrected an inaccessible Properties panel at widths below 1,000 pixels.

**Registry go decision:** the architecture is sufficiently general to build a shareable local-first solution. This does not justify SaaS or enterprise workflow development. The next value gate is reusable declarative compositions created from registered primitives.

### Reusable Composition and Publish Update — 2026-08-15

The local-first MVP thesis has passed its remaining technical gates:

- A selected component subtree can be named and saved as a copy-based reusable template.
- Template files use a validated, editor-independent JSON contract under `content/templates` and are written atomically without overwriting an existing name.
- Inserting a template preserves structure and approved properties while assigning a fresh identity to every copied node.
- Browser testing saved the Hero section as `Campaign Hero`, started a blank page, inserted it, customized its Heading and Button, saved it, and cold-reloaded both the page and template from disk.
- Validation now rejects unknown properties, wrong value types, unapproved select values, unsafe URL protocols, invalid nesting, duplicate IDs, and invalid root placement.
- A browser attempt to save `javascript:alert(1)` as a Button destination stopped preview and was rejected by the save endpoint.
- The initial publish action validated and saved the current page, ran the installed Astro production builder, and reported whether `dist/` was created successfully; the later Git milestone added review and an isolated commit.
- The generated standalone production server rendered the customized page with no editor markers, direct-editing controls, development toolbar, React editor shell, or GrapesJS resources.

**Thesis verdict:** pass for a local-first, single-project solution. Copy-based templates satisfy the MVP reuse requirement. Linked reusable definitions, second-project packaging, real-user usability observation, hosting integration, authentication, and editorial workflow remain separate adoption and product gates.

### Independent Adoption Update — 2026-08-15

The shareability gate has passed at the workspace-package level:

- The core now exposes an Astro integration, renderer, local store, neutral types, and component contract through `@astro-cms/core`.
- The integration aliases a project-owned manifest and preview layout, statically discovers project-owned `.astro` components, and injects the private editor and local APIs.
- A second Astro site adopted the package with its own `Band`, `Group`, `Title`, `Copy`, and `LinkButton` components and a visually distinct layout. It copied no editor, renderer, schema, validation, preview, storage, template, or publishing implementation.
- Browser testing loaded and edited the second site's content, inserted a reusable template, rejected an unsafe URL, saved atomically, cold-reloaded, and invoked the production builder.
- `injectRoutes: "dev-only"` keeps the private editor, preview, and filesystem write APIs out of production builds. The independent production server returned 404 for `/admin`, while its public page retained the adopter's content and styles with no client scripts or editor markers.
- Editor-triggered builds now force `NODE_ENV=production`, preventing development-only site UI from leaking into the artifact.

**Adoption verdict:** the architecture is reusable enough to continue toward a local-first release. This proves a source/workspace package boundary, not npm distribution, automated installation, compatibility guarantees, or user demand.

**Investment verdict:** continue bounded, shareable local-first capabilities, but do not infer demand for a hosted product. The observed, task-based usability pilot remains the decisive human-usability gate; because it is deferred, ongoing development should avoid SaaS and enterprise-workflow commitments.

### Usability Pilot Preparation — 2026-08-15

The first human-validation gate is ready to run but has **not** passed yet:

- Primary save and publishing controls are now visible above the canvas.
- Developer JSON is collapsed behind an explicitly labeled developer view.
- Editor copy describes the page, preview, settings, and reusable sections in nontechnical language.
- Destructive new-page, restore, and reload actions require confirmation.
- Root-component guidance is derived from the adopter's manifest instead of assuming a component named `Section`.
- The independent fixture includes a realistic participant brief and a deterministic, fixture-scoped reset command.
- The moderator protocol records completion time, rescues, errors, confidence, and whether the participant understands that a production build is not deployment.
- An automated regression completed the exact pilot task, saved and cold-reloaded it, created the production build, and then restored the fixture baseline. This proves readiness of the test environment, not human usability.

The pilot decision requires three observed marketing-content participants under the rules in `USABILITY-PILOT.md`. Do not substitute developer testing or browser automation for those observations.

### Package Distribution Update — 2026-08-15

Because human usability sessions are deferred, development continued along the lowest-risk shareability path:

- The core is now a versioned `@astro-cms/core@0.1.0` package with explicit exports and MIT licensing.
- GrapesJS and Zod are runtime dependencies. Astro, the Astro React integration, React, and React DOM are peer dependencies owned by the adopting site.
- The package archive includes only the integration, contracts, renderer, editor, stores, injected routes, APIs, documentation, and license. Internal tests, sample primitives, and the sample manifest are excluded.
- `prepack` requires the core type check and test suite to pass.
- `pnpm verify:package` installs the generated archive into a disposable consumer with workspace resolution disabled, removes redundant direct GrapesJS and Zod dependencies, and runs the consumer type check and production build.
- Browser verification edited and saved a page through the installed archive. Its production server rendered the changed native Astro page with no client scripts or editor markers, and `/admin` returned 404.

**Distribution verdict:** the source/workspace proof extends to an installable package archive. Registry publishing and API stability remain deliberately unclaimed. The initializer described in the later milestone now creates and verifies the required starter integration.

---

## 7. Core Architecture

```text
Developer-written native .astro components
                    │
                    ▼
       Astro-CMS component definitions
      props + slots + constraints + tokens
                    │
                    ▼
        Generated component registry
           ┌────────┴────────┐
           ▼                 ▼
 GrapesJS adapter      Astro document renderer
 editing mechanics     actual .astro components
           │                 │
           └────────┬────────┘
                    ▼
      Neutral Astro-CMS page document
                    │
          save locally or through Git
                    │
                    ▼
          Astro build / SSR / SSG
                    │
                    ▼
             Published website
```

The browser-based editor necessarily uses JavaScript. That JavaScript belongs to the private editing tool and must not impose a framework or runtime on the published site.

---

## 8. Component Model

Astro-CMS has three component levels.

### 8.1 Developer Primitives

Developer primitives are native Astro components registered for editing.

Examples:

- Heading
- Text
- Image
- Button or Link
- Stack
- Grid
- Section
- Hero
- Feature Card
- Testimonial
- Form

Illustrative registration:

```ts
defineComponent({
  name: "Button",
  source: "src/components/Button.astro",
  properties: {
    label: text({ required: true, maxLength: 40 }),
    href: url({ required: true }),
    appearance: select(["primary", "secondary", "quiet"]),
    size: select(["small", "normal", "large"]),
  },
  slots: {},
  capabilities: {
    removable: true,
    nestable: false,
    arbitraryStyles: false,
  },
});
```

The exact API remains to be designed. The important point is that the definition exposes an editing contract without moving implementation out of `Button.astro`.

### 8.2 Developer Sections

Developer sections are larger, intentionally designed components such as Hero, Feature Grid, Pricing, FAQ, or CTA.

They may contain fixed internal structure, controlled slots, or both. Marketing edits their content and approved variants but cannot alter their responsive implementation.

### 8.3 Marketing-Created Composites

A marketing editor may select an arrangement of approved components and save it as a reusable component.

For example:

```text
Campaign CTA
└── Section
    └── Stack
        ├── Heading
        ├── Text
        └── Button
```

The editor may expose selected values as properties of the new composite:

- Heading text
- Body text
- Button label
- Button destination
- Approved color treatment

The saved composite is declarative. It does not create a new executable `.astro` implementation.

---

## 9. Reuse Semantics

The system must distinguish two different kinds of reuse.

### Template

Inserting a template copies its component tree. Each copy can then diverge independently.

Useful for:

- Page starters.
- Common section arrangements.
- Campaign layouts.

### Linked Component

Inserting a linked component creates an instance that refers to one reusable definition. Updating the definition can update every instance, subject to explicit per-instance overrides.

Useful for:

- Calls to action.
- Repeated disclosures.
- Shared banners.
- Standard contact sections.

MVP may implement templates first, but the document model must not confuse copying with linked reuse.

Required safety rules include:

- Stable identifiers.
- Cycle detection.
- Maximum nesting depth.
- Clear override rules.
- Versioning and migrations.
- Dependency and usage reporting before destructive changes.

---

## 10. Canonical Page Document

The canonical document should be readable, versionable, and independent of GrapesJS.

Illustrative YAML:

```yaml
schemaVersion: 1
route: /campaign
title: Campaign
seo:
  title: Campaign
  description: A short description
  socialImage: /uploads/campaign-card.webp
  socialImageAlt: Campaign artwork
  searchVisibility: public
content:
  - id: hero-1
    type: Hero
    props:
      heading: See the difference
      body: A concise introduction.
      appearance: brand
    slots:
      actions:
        - id: button-1
          type: Button
          props:
            label: Contact us
            href: /contact
            appearance: primary
```

JSON may be used instead of YAML if it produces safer tooling. The schema must support:

- Pages and routes.
- Stable node identifiers.
- Component types.
- Typed properties.
- Named slots.
- References to reusable definitions.
- Per-instance overrides.
- SEO metadata.
- Schema versions and migrations.

The page title and description are the default search and social values. The
SEO object may override the search title, provide a social image and required
alternative text, and choose a constrained search-visibility value. Canonical
URLs should not normally be stored as editable strings: they should be derived
from the validated route plus Astro's configured `site` URL so a safe page
rename cannot leave a stale canonical behind. Open Graph and Twitter tags
should inherit the same values unless a later, demonstrated use case justifies
separate overrides. Arbitrary raw meta tags or JSON-LD are not marketing-editable
fields; structured data must come from typed developer-owned templates.

GrapesJS project JSON may be used as transient editor state, but it is not the public persistence contract.

---

## 11. Astro Rendering and Preview

The renderer maps document nodes to explicitly imported Astro components.

```text
type: Hero   → Hero.astro
type: Button → Button.astro
type: Grid   → Grid.astro
```

The registry should be generated or statically constructed so Astro and Vite can resolve component imports reliably.

### Preview Requirements

The preview system must:

- Render unsaved document state through Astro.
- Use the same components, CSS, assets, fonts, and layout as production.
- Mark rendered component boundaries with editor-only identifiers.
- Support desktop, tablet, and mobile viewport sizes.
- Reflect property changes with low enough latency to feel direct.
- Keep editor-only metadata out of production output.
- Render interactive islands using their normal Astro integration when previewing.

### Preview Spike Decision

The spike compared:

1. Astro-rendered component fragments inside GrapesJS custom views.
2. A full Astro-rendered iframe coordinated with GrapesJS selection and commands.
3. A composition canvas plus a continuously updated exact-preview pane.

Option 2 is selected, extended so that the full Astro-rendered iframe is the primary direct-editing canvas. GrapesJS remains a private mechanics engine and the neutral document remains the integration boundary. Sustained-edit latency still requires deliberate measurement before this becomes a polished editor architecture.

---

## 12. Editing Experience

The primary workflow is:

```text
Open page
   ↓
See the Astro-rendered page
   ↓
Select a component
   ↓
Edit approved properties or slot contents
   ↓
Add, move, duplicate, or remove approved components
   ↓
Optionally save a composition for reuse
   ↓
Preview responsive behavior
   ↓
Validate
   ↓
Save or publish
```

The editor should provide:

- Component library.
- Visual canvas.
- Layer/tree view.
- Property panel.
- Inline text editing where safe.
- Media selection.
- Undo and redo.
- Responsive preview.
- Validation messages.
- Clear draft and published state.

Marketing should never need to see Git terminology, `.astro` syntax, frontmatter, or the GrapesJS data model.

---

## 13. Guardrails

Guardrails are part of the value proposition, not an inconvenience to work around.

Supported constraints should include:

- Required properties.
- Text length guidance and limits.
- URL validation.
- Approved component variants.
- Approved design tokens.
- Required image alt text.
- Image dimensions and aspect-ratio guidance.
- Allowed child component types per slot.
- Minimum and maximum slot items.
- Components that cannot be removed or reordered.
- Route and slug validation.
- Heading hierarchy and basic accessibility checks.

The system must reject or sanitize:

- Arbitrary scripts.
- Event-handler attributes.
- Unapproved raw HTML.
- Unsafe URLs.
- Arbitrary CSS.
- Recursive reusable-component definitions.

---

## 14. Structured Content

Visual page composition is the central capability, but structured collections remain necessary for repeated content such as:

- Blog posts.
- News.
- Events.
- Team members.
- Case studies.
- Resources.

Astro-CMS should integrate with Astro Content Collections where appropriate and generate form-based editing from explicit schemas.

Structured entries may be referenced by visual components without copying their data into the page document. For example, a `FeaturedPosts` component may select entries from a posts collection.

Structured-content support should reuse the same property controls and validation primitives as visual components.

---

## 15. Storage and Publishing

### Local First

The first implementation should read and write files in the local Astro project. This proves the content model, renderer, editor, and serialization without making hosted infrastructure a prerequisite.

### Git Compatible

Canonical documents, reusable definitions, and structured content should be suitable for Git:

- Human-readable diffs where practical.
- Stable ordering.
- Stable identifiers.
- Deterministic serialization.
- Validation before writing.
- Atomic multi-file changes where possible.

### Later GitHub Workflow

After the local workflow is proven, add a GitHub App that translates editorial actions into repository operations.

Simple mode:

```text
Edit → Validate → Publish → Commit → Existing deployment runs
```

Editorial mode:

```text
Edit → Save draft → Preview → Approve → Merge → Deploy
```

Marketing sees Draft, Preview, Approve, and Publish—not branches, commits, and pull requests.

### Search Discovery Outputs

The canonical page document and public route list should also drive search
discovery artifacts. Sitemap inclusion, canonical URLs, robots meta directives,
and social metadata must not become separate hand-maintained sources of truth.

- Public, canonical, indexable pages belong in the sitemap.
- Draft, preview, editor, redirect-only, and `noindex` routes do not.
- `robots.txt` points to the sitemap and expresses environment-level crawl
  policy; it is not an authentication or route-protection mechanism.
- Preview deployments should use both crawl blocking and page-level `noindex`
  protection rather than relying on `robots.txt` alone.
- Page creation, retirement, and rename must be reflected by the next verified
  production build without manual sitemap editing.

For a Git-backed production deployment, “published” means present in the Git
revision being deployed; it is not another mutable flag stored beside the page.
A local review build may contain the current uncommitted candidate so it can be
validated before commit, but that does not make the candidate publicly deployed.

---

## 16. Developer Tooling

Potential CLI commands:

```bash
npx astro-cms init
npx astro-cms dev
npx astro-cms check
```

### `astro-cms init`

Should eventually:

- Verify that the project is Astro.
- Install the integration and editor dependencies.
- Create the Astro-CMS configuration.
- Create content and reusable-component directories.
- Add editor and preview routes.
- Generate the component registry.
- Produce a conversion report rather than rewriting the project blindly.

### `astro-cms dev`

Should run the Astro site, editor, draft-state service, and preview bridge together.

### `astro-cms check`

Should deterministically validate:

- Component definitions.
- Component import paths.
- Property and slot schemas.
- Page documents.
- Reusable-component references.
- Cycles and invalid nesting.
- Missing assets and content references.
- Routes and slugs.
- Schema-version compatibility.
- Whether the Astro project still builds.

---

## 17. Existing Project Adoption

Existing Astro projects remain a first-class target, but automatic conversion is not an MVP promise.

The safe adoption workflow is:

1. Install Astro-CMS.
2. Register a small set of existing components explicitly.
3. Move one page's marketing-controlled values into a page document.
4. Verify that Astro renders the page identically.
5. Enable editing for that page.
6. Convert additional pages incrementally.

AI-assisted conversion can later help identify hard-coded marketing content, draft schemas, and propose registrations. Deterministic validation and developer review remain required.

Astro-CMS must not pretend it can infer the intent of every arbitrary `.astro` component automatically.

---

## 18. MVP

The MVP must prove this statement:

> A developer can expose native Astro components, and a nontechnical user can visually assemble, preview, save, and publish a page without being able to break the responsive design.

### Included

#### Developer

- One existing or sample Astro site.
- Explicit registration of native Astro components.
- Typed text, image, URL, boolean, and select properties.
- One named slot type with nesting rules.
- Generated Astro component registry.
- Deterministic page validation.

#### Marketing

- Page list.
- Open an existing page.
- Add approved components.
- Reorder, duplicate, and remove components.
- Edit approved properties.
- Preview through the actual Astro renderer.
- Save a composition as a reusable template.
- Edit a validated search title, description, social image, social-image text,
  and public/noindex visibility without editing arbitrary head markup.
- Save changes locally.

#### Infrastructure

- GrapesJS Core adapter.
- Neutral page-document serializer.
- Astro preview bridge.
- Local filesystem storage.
- Generated sitemap and robots discovery files for public pages.
- Native Astro head rendering for canonical, robots, Open Graph, and social
  metadata.
- No database required.

### Deliberately Excluded

- Hosted service.
- Authentication and team management.
- GitHub App.
- Approval workflow.
- Arbitrary HTML, CSS, or JavaScript.
- Theme switching or marketplace.
- Plugin marketplace.
- Localization.
- Multisite.
- Comments.
- Scheduled publishing.
- AI-generated content.
- Automatic conversion of arbitrary Astro projects.
- Full digital-asset management.

---

## 19. First Technical Spike

Before building the surrounding CMS, create the smallest possible proof:

### Native Components

- `Section.astro`
- `Stack.astro`
- `Heading.astro`
- `Text.astro`
- `Image.astro`
- `Button.astro`
- `Callout.astro` (registry-generalization proof)

### Required Demonstration

1. Register the original six components and add a seventh without changing core editor code.
2. Display them as approved blocks in GrapesJS Core.
3. Assemble a page by dragging components into allowed slots.
4. Edit a heading and button through generated property controls.
5. Render the unsaved document using the actual `.astro` components.
6. Switch between desktop and mobile previews.
7. Serialize the result into the neutral document format.
8. Reload that document without losing identity or structure.
9. Save a selected subtree as a reusable template.
10. Insert the template into a second page.

Items 1–10 and the seventh-component generalization proof are complete. Actual unfamiliar-user usability remains a separate observation gate.

### Success Criteria

- The published page contains no editor runtime.
- The preview and Astro output are materially identical.
- No React component replicas exist.
- The saved file contains component types and properties, not generated HTML.
- Invalid nesting is prevented before save.
- A nontechnical user can complete the flow without explanation.

### Failure Criteria

The spike should be considered a failure if:

- Native Astro preview requires maintaining duplicate component implementations.
- GrapesJS repeatedly destroys component identities or neutral document semantics.
- The adapter must depend on unrestricted HTML/CSS editing.
- Preview latency prevents direct visual editing.
- Reloading a saved page changes its structure or rendered result.

Failing the GrapesJS spike does not invalidate the Astro-CMS architecture. It means the editing engine must be replaced while preserving the component contract and canonical document.

---

## 20. Development Phases

### Phase 0 — Contract and Spike

- Define the neutral component-tree schema.
- Define the component-registration schema.
- Define slot and nesting rules.
- Prototype the GrapesJS adapter.
- Prove native Astro preview.
- Record the GrapesJS go decision and its tested boundary.

### Phase 1 — Local Vertical Slice (Technically Complete)

- **Implemented:** manifest-driven Astro registry with missing-file failure and seventh-component proof.
- **Implemented:** deterministic route-to-file page storage, listing, safe creation, switching, read/write, and validation.
- **Implemented:** constrained component library panel.
- **Implemented:** property editing.
- **Implemented:** exact responsive preview.
- **Implemented:** direct selection, insertion, and pointer reordering in the Astro-rendered canvas.
- **Implemented:** atomic local save and server-backed reload.

### Phase 2 — Reusable Compositions

- **Implemented:** save selected subtrees as validated, atomic, copy-based templates.
- **Implemented:** insert independent copies with fresh identities and normal generated property controls.
- **Deferred beyond the MVP thesis:** linked reusable definitions, explicit composite-property aliases, cycle prevention, usage reporting, and migrations.

### Phase 2.5 — Independent Adoption (Technically Complete)

- **Implemented:** workspace package exports for integration, renderer, store, types, and contract.
- **Implemented:** adopter-owned manifest, native component discovery, preview layout, content, and public route.
- **Implemented:** development-only editor/API route injection with production exclusion.
- **Verified:** independent edit, template, validation, save/reload, build, and production-runtime workflow.
- **Implemented:** clean package archive with explicit exports, runtime and peer dependencies, licensing, and repeatable non-workspace verification.
- **Implemented:** conservative `astro-cms init` command with dry-run, collision refusal, idempotency, conventional config wiring, native starter components, demo content, and adaptation guidance.
- **Verified:** archive-installed initialization preserves an existing page, checks and builds the generated project, excludes `/admin` from production, and supports exact preview plus durable save in the browser.
- **Still open:** registry publication, semantic-version compatibility, migrations, nonstandard/computed Astro config support, and compatibility across multiple Astro versions.

### Initializer Milestone — Complete

The initializer is intentionally conservative. It creates an isolated demonstration rather than replacing an adopter's route or design system. Before writing, it validates required direct dependencies, a single conventional Astro config, and every generated destination. Different existing content is treated as a collision and stops the whole plan. There is no force mode.

The generated surface is sufficient to answer the adoption question:

1. A developer can preview the full file plan with `astro-cms init --dry-run`.
2. A conventional existing config retains its current properties and integrations.
3. The existing home page remains untouched.
4. Six native `.astro` components, their safe manifest, a starter public image, an exact-preview layout, neutral JSON content, and a separate demo route work immediately.
5. Additional route-backed documents build through the generated nested demo route without adding an editor runtime to production.
6. Running the initializer again makes no changes.
7. The initialized site type-checks and builds with no production editor route.

This removes manual scaffolding as the next technical adoption blocker. The next development choice should address a real capability gap rather than adding more setup automation without evidence.

### Phase 3 — Structured Content and Media

- Integrate Astro Content Collections.
- Add collection forms.
- **Implemented:** read-only browsing of supported project images below `public`, selected through manifest-declared Image properties.
- **Implemented:** required alternative text and image-specific safe-source validation.
- **Implemented:** verified image upload, collision-safe storage, immediate
  preview use, and page-plus-upload Git publication.
- **Implemented:** saved-page, reusable-template, and active-draft usage
  reporting plus guarded unpublished and tracked-upload removal.
- Add image replacement, optimization, dimensions, and file-size metadata.

### Phase 3.5 — Search Discovery and SEO Metadata (In Progress)

This phase adds search readiness without turning Astro-CMS into an SEO analysis
service or introducing a second rendering system.

- **Implemented:** backward-compatible, versioned page SEO metadata with
  validated search title, description, social image and alternative text, and
  constrained `public` or `noindex` visibility. Legacy title and description
  remain fallbacks, and omitted visibility remains public.
- **Implemented:** one shared metadata resolver plus adopter-owned native Astro
  head components in the initializer and independent adoption fixture. They
  render title, description, robots, Open Graph, and Twitter/X tags, derive
  canonical and absolute social-image URLs only from Astro's configured `site`,
  and force editor and preview routes to `noindex`.
- **Implemented:** social images participate in existing upload publication and
  asset-usage protection even when no visible Image component references them.
- **Implemented:** a marketing-facing **Search & sharing** panel edits the
  constrained search title, description, visibility, social image, and required
  image description; approximate search and social previews update with the
  draft, and the publish review describes each metadata change in plain
  language.
- **Proven in a fresh archive-installed website:** a browser edit flowed through
  save, the native Astro renderer, production build, and isolated Git publish.
  The generated page contained the edited title, description, robots policy,
  canonical URL, Open Graph values, absolute social image, and Twitter card,
  while the adopter's existing homepage remained unchanged and `/admin` stayed
  out of production output.
- **Next:** make sitemap and `robots.txt` consume the same visibility policy.

#### Recommended Integration Choices

1. Use Astro's official
   [`@astrojs/sitemap`](https://docs.astro.build/en/guides/integrations-guide/sitemap/)
   integration. Require an adopter-owned `site` URL, exclude non-public routes,
   and support both statically generated CMS paths and explicitly supplied
   pages when an SSR route cannot be discovered automatically.
2. Generate `robots.txt` with a small native `src/pages/robots.txt.ts` endpoint
   following Astro's official sitemap-discovery recipe. Do not make
   [`astro-robots-txt`](https://github.com/alextim/astro-lib/tree/main/packages/astro-robots-txt)
   a core dependency; the native route is small, transparent,
   and uses the same `Astro.site` value without another package boundary.
3. Generate search and social tags through an adopter-owned native
   `SeoHead.astro` component in the production layout, following Astro's
   [site-metadata guidance](https://docs.astro.build/en/guides/configuring-astro/#add-site-metadata).
   Do not require [`astro-seo`](https://github.com/jonasmerlin/astro-seo) or
   [Unhead](https://unhead.unjs.io/) in core. `astro-seo` may receive an optional
   adapter recipe for projects that already use it; Unhead remains an adopter
   choice for applications that genuinely need reactive head merging.
4. Keep the integration optional and collision-safe. `astro-cms init` or a
   later opt-in command must detect existing sitemap, robots, and head systems,
   then stop or produce adaptation instructions rather than overwrite them.

#### Page Contract and Editor Scope

- Add developer-owned site defaults for site name, title template, locale,
  default social image and alternative text, and optional social account data.
  The deployed URL itself remains Astro's `site` configuration value.
- Add a versioned SEO object to the canonical page schema with validated title,
  description, social image, social-image alternative text, and constrained
  search visibility.
- Migrate existing documents non-destructively: current top-level title and
  description remain the fallback inputs until the schema version is upgraded,
  and an existing page is never silently assigned a different indexing policy.
- Derive the canonical absolute URL from the page route, Astro `site`, `base`,
  and trailing-slash policy.
- Reuse the title, description, and social image for Open Graph and Twitter by
  default so marketing does not maintain three nearly identical forms.
- Show search-result and social-card previews as guidance, but label them as
  approximations rather than promises about a search engine or social network.
- Keep canonical overrides, arbitrary robots directives, and typed JSON-LD
  templates developer-owned in the first slice.

#### Build and Safety Contract

- Sitemap generation includes only saved, published, canonical, indexable
  routes and excludes `/admin`, preview endpoints, drafts, redirect aliases,
  and `noindex` pages.
- Static `getStaticPaths()` routes should be discovered by
  `@astrojs/sitemap`; SSR deployments must receive explicit CMS page URLs
  because the official integration cannot discover dynamic SSR routes.
- Production `robots.txt` allows public content and points to the absolute
  sitemap index, uses deterministic plain-text output, and returns a text/plain
  content type. Preview/non-production policy blocks crawling and pages also
  emit `noindex`.
- The build fails on missing required metadata, an invalid canonical/site URL,
  a social image without alternative text, conflicting index/sitemap policy,
  duplicate canonical tags, or a public sitemap entry that does not resolve.
- Do not add sitemap `priority` or `changefreq` controls to the marketing UI;
  search engines may ignore them and they do not represent editorial content.

#### Acceptance Proof

1. Create, publish, rename, and retire a page; after each production build, the
   sitemap contains exactly the current public canonical route.
2. **Proven for the archive-installed starter:** inspect generated HTML and
   prove exactly one title, description, canonical, robots policy, Open Graph
   title, and Twitter title, with the full edited metadata also verified in a
   browser-rendered native Astro page.
3. Prove `robots.txt` points to the generated sitemap and that preview/editor
   routes are absent from the sitemap and protected from indexing.
4. Prove a `noindex` page is absent from the sitemap while remaining available
   for intentional direct preview.
5. **Proven:** the archive-installed consumer and initializer-consumer checks
   pass, so the implemented metadata slice is verified in an adopting Astro
   project rather than only this repository.

### Phase 4 — Git Publishing

- **Implemented:** deterministic page serialization and atomic local save.
- **Implemented:** review against the committed page with plain-language content changes and an optional technical diff.
- **Implemented:** stale-file revision protection, staged-page conflict refusal, and rollback when build or commit fails.
- **Implemented:** production build plus an isolated selected-page Git commit that preserves unrelated staged files, including the first commit of a newly created page.
- **Implemented:** guarded non-home page retirement with incoming-link refusal,
  isolated tracked deletion, and rollback.
- **Implemented:** guarded non-home page rename with automatic saved-link
  rewriting, one build-verified Git transaction, and rollback.
- Add GitHub App integration.
- Add an explicit branch/push or pull-request policy only after choosing the adopter workflow.
- Add deployment-status feedback and rollback.

### Git Review and Local Publish Milestone — Complete

The editor now treats save and publish as different operations. A user may save a draft repeatedly; the eventual review still compares the prospective page with the version in `HEAD`. The review presents content-level sentences first and keeps the unified JSON diff optional.

Publishing is protected by both Git state and a file-content revision. It refuses to overwrite a file changed after review, refuses ambiguity when the active page itself is staged, and does not create empty commits. The builder runs before the commit; a build or commit failure restores the previous saved source. The successful commit uses a route-specific message and includes only the active page document, leaving unrelated staged work untouched.

The archive-installed browser proof created commit `c394502`, rendered the committed heading in the production artifact, excluded `/admin`, and left the generated repository clean. Remote push, branch choice, pull requests, and deployment remain intentionally separate policy decisions.

### Multi-Page Creation and Publishing Milestone — Complete

The editor now lists page documents, switches the active editor/preview/save/publish target as one route, and creates blank pages only for validated, collision-free paths. Route mapping is deterministic and confined below `content/pages`; traversal, unsafe URL syntax, malformed slugs, and duplicate routes are rejected.

The archive-installed browser proof created `/campaigns/summer`, assembled its native Astro component tree, saved `content/pages/campaigns/summer.json`, and published commit `7934576` containing only that untracked page. The subsequent static build generated `/astro-cms-demo/campaigns/summer` and still excluded `/admin`.

Page rename and deletion were deliberately implemented as separate guarded
operations. Deletion refuses known incoming links. Rename repairs exact
manifest-approved destinations in saved pages and templates while preserving
query strings and fragments. Both protect `/`, preserve unrelated staged work,
serialize against other local publication operations, and restore prior files
when verification fails. External redirects remain a separate policy because
the editor cannot discover bookmarks or inbound links outside the repository.

### Phase 5 — Editorial Workflow

- Add drafts and preview deployments.
- Add roles and permissions.
- Add approvals and audit history.

Only after these phases prove real demand should the project consider managed hosting, agency consoles, marketplaces, or other product expansion.

---

## 21. Key Risks

### Native Astro Preview Bridge

Risk: GrapesJS owns an editable HTML-like canvas, while Astro owns server/build-time rendering.

Mitigation:

- Treat preview integration as the first technical spike.
- Keep Astro as the authoritative renderer.
- Use stable editor-only node identifiers.
- Avoid committing to GrapesJS-specific persistence.

### Component Round-Tripping

Risk: Imported rendered HTML may lose the identity and properties of its source Astro component.

Mitigation:

- Never use HTML as the canonical editing document.
- Register explicit component types.
- Lock generated internal markup.
- Test save/reload stability continuously.

### Reusable Component Evolution

Risk: Changing a reusable definition or primitive schema may break many pages.

Mitigation:

- Version schemas.
- Provide migrations.
- Report usages before changes.
- Validate the entire content graph.

### Editor Freedom Leaking Through

Risk: Generic GrapesJS HTML and styling controls turn the system into a fragile free-form builder.

Mitigation:

- Start with an allowlist, not a denylist.
- Disable generic blocks and arbitrary styles.
- Generate controls only from the Astro-CMS contract.
- Validate canonical documents independently of the editor.

### Scope Creep

Risk: Authentication, hosting, GitHub workflows, themes, AI conversion, and marketplaces distract from the composition problem.

Mitigation:

- Prove the local visual composition loop first.
- Treat every additional subsystem as a separate approval decision.
- Preserve the explicit exclusions in the MVP.

---

## 22. Decisions Required During Phase 0

1. JSON versus YAML for canonical documents.
2. Exact component-registration API.
3. How static imports and registry generation work.
4. **Resolved for the spike:** validated neutral JSON reaches an ephemeral server-side draft store and is addressed by draft ID.
5. **Resolved for the spike:** a continuously updated, full Astro-rendered iframe is both the exact-preview strategy and the primary direct-editing canvas.
6. How inline text changes map back to typed properties.
7. Slot rules and allowed-child declarations.
8. Template versus linked-component behavior in the first release.
9. How composite properties point into nested nodes.
10. File locations for pages, composites, and structured content.
11. Schema-versioning and migration conventions.
12. Whether generated `.astro` route files provide meaningful value over a generic document-rendering route.

---

## 23. Open-Source and Dependency Strategy

The solution should be useful without a proprietary service.

Proposed foundations:

- Astro for production rendering.
- TypeScript for schemas, adapters, and validation.
- GrapesJS Core for editing mechanics if the spike succeeds.
- Zod or an equivalent portable schema library for validation.
- Astro's official `@astrojs/sitemap` integration for public route discovery.
- JSON or YAML files for canonical content.
- Git for versioning and rollback.

The Astro-CMS-owned layer should use a permissive open-source license such as MIT or Apache-2.0. Third-party dependencies must be replaceable at architectural boundaries, especially the visual editing engine.

Dependency selection should remain conservative. Prefer official Astro
integrations for build behavior, and prefer a small native Astro component or
endpoint when it is clearer than a third-party wrapper. Community packages such
as `astro-seo` and `astro-robots-txt` may be documented as optional adapters,
but should not become required core dependencies unless they provide a proven
capability the native contract cannot reasonably supply. Reactive head managers
such as Unhead are outside the default architecture because public Astro pages
do not require a client-side or framework-specific head runtime.

The project should document:

- The canonical page schema.
- The component-registration contract.
- The composite-component format.
- The preview protocol.
- The storage adapter interface.
- The editor adapter interface.

That documentation is what makes the solution shareable rather than a one-off integration.

---

## 24. Definition of Early Success

The project has meaningful validation when:

1. A developer registers existing native Astro components without rewriting them in another framework.
2. Marketing assembles a credible new page from those components.
3. Marketing creates and reuses a simple composite such as a CTA.
4. The editor prevents an invalid or brand-breaking composition.
5. Responsive preview matches the published Astro result.
6. The saved content is portable, inspectable, and versionable.
7. Removing the editor does not prevent Astro from rendering the site.
8. **Proven:** another Astro project can adopt the component and document contracts without copying project-specific editor code.
9. A published page emits validated search/social metadata and appears exactly
   once in the generated sitemap, while preview, editor, retired, and `noindex`
   routes remain excluded.

---

## 25. North Star

```text
Developer creates native Astro components
                    ↓
Developer exposes safe properties and slots
                    ↓
Marketing assembles pages visually
                    ↓
Marketing creates reusable compositions
                    ↓
Astro renders the exact responsive design
                    ↓
Content is validated, saved, and published through Git
```

The project succeeds when marketing gains meaningful creative control without taking implementation control away from the developer.

> **Astro-CMS should make safe visual composition a native capability of the Astro ecosystem.**
