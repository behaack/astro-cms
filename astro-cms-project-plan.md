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

This resolves preview questions 4 and 5 in favor of a validated draft protocol plus a continuously updated exact-preview pane. It does not complete the GrapesJS go/no-go decision: constrained drag-and-drop, reordering, removal, selection synchronization, rapid-edit latency, and interactive Astro islands still require deliberate testing.

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
  description: A short description
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

### Preview Spike Options

The first spike should compare:

1. Astro-rendered component fragments inside GrapesJS custom views.
2. A full Astro-rendered iframe coordinated with GrapesJS selection and commands.
3. A composition canvas plus a continuously updated exact-preview pane.

The project should not commit to a polished editor architecture until one option proves exact rendering, reliable selection, safe nesting, and acceptable latency.

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
- Save changes locally.

#### Infrastructure

- GrapesJS Core adapter.
- Neutral page-document serializer.
- Astro preview bridge.
- Local filesystem storage.
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

### Required Demonstration

1. Register the six components.
2. Display them as approved blocks in GrapesJS Core.
3. Assemble a page by dragging components into allowed slots.
4. Edit a heading and button through generated property controls.
5. Render the unsaved document using the actual `.astro` components.
6. Switch between desktop and mobile previews.
7. Serialize the result into the neutral document format.
8. Reload that document without losing identity or structure.
9. Save a selected subtree as a reusable template.
10. Insert the template into a second page.

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
- Make the GrapesJS go/no-go decision.

### Phase 1 — Local Vertical Slice

- Build the generated Astro registry.
- Build page read/write and validation.
- Build the constrained component library panel.
- Build property editing.
- Build exact responsive preview.
- Save and reload locally.

### Phase 2 — Reusable Compositions

- Save selected subtrees as templates.
- Add linked reusable definitions.
- Add exposed composite properties.
- Add cycle prevention, usage reporting, and migrations.

### Phase 3 — Structured Content and Media

- Integrate Astro Content Collections.
- Add collection forms.
- Add image browsing and upload.
- Add asset validation and usage reporting.

### Phase 4 — Git Publishing

- Add deterministic serialization and change previews.
- Add GitHub App integration.
- Add simple publish mode.
- Add deployment-status feedback and rollback.

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
5. **Resolved for the spike:** a continuously updated, full Astro-rendered iframe is the exact-preview strategy.
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
- JSON or YAML files for canonical content.
- Git for versioning and rollback.

The Astro-CMS-owned layer should use a permissive open-source license such as MIT or Apache-2.0. Third-party dependencies must be replaceable at architectural boundaries, especially the visual editing engine.

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
8. Another Astro project can adopt the component and document contracts without copying project-specific code.

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
