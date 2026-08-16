# Astro-CMS Thesis Resolution

**Status:** Passed for a shareable, local-first architecture on 2026-08-15.

## Claim under test

> A developer can expose native Astro components, and a nontechnical editor can visually assemble, preview, reuse, save, and produce a publishable page without being able to alter the responsive implementation.

## Pass/fail evidence

| Required capability                               | Result | Evidence                                                                                                                                                                                                                                                  |
| ------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native Astro remains authoritative                | Pass   | Public and preview routes use the same recursive Astro renderer. The public page loads no React or GrapesJS editor resources.                                                                                                                             |
| Developer can expose another native component     | Pass   | `Callout.astro` acquired its palette entry, properties, placement rules, validation, schema type, and renderer mapping from one manifest entry without core-editor changes.                                                                               |
| Editor can assemble a page visually               | Pass   | Browser testing inserted, selected, reordered, duplicated, and removed constrained component nodes through the Astro-rendered canvas.                                                                                                                     |
| Approved content and variants are editable        | Pass   | Browser testing edited generated Heading, Button, Callout, URL, and select controls and observed the exact Astro rerender.                                                                                                                                |
| Responsive implementation remains developer-owned | Pass   | Documents store only approved properties and component identities. Unknown properties, wrong types, unapproved select values, unsafe URLs, invalid nesting, and root violations are rejected. No arbitrary HTML, CSS, or JavaScript control is exposed.   |
| Reusable marketing composition                    | Pass   | A complete Hero subtree was saved to `content/templates/campaign-hero.json`, inserted into a blank page, and customized independently. Every inserted node received a fresh identity while the template remained unchanged.                               |
| Durable and inspectable storage                   | Pass   | Page and template documents are validated JSON, written atomically, cold-reloaded from disk, and suitable for Git review.                                                                                                                                 |
| Exact preview                                     | Pass   | Unsaved state traveled through the Astro server renderer and returned to the editor iframe; it was not approximated by a React component replica.                                                                                                         |
| Publishable output                                | Pass   | The editor saved the active document and invoked the installed Astro production builder. The generated standalone server rendered the customized page from `dist/` with no editor markers, controls, development toolbar, or editor resources.            |
| Responsive editor access                          | Pass   | Browser testing found that the Properties panel disappeared below 1,000 pixels; the layout now keeps those controls accessible.                                                                                                                           |
| Independent Astro adoption                        | Pass   | A second Astro site supplied only its manifest, native components, layout, styles, page, and content. It consumed the editor, renderer, validation, storage, preview, templates, and publisher through `@astro-cms/core` without copying those internals. |
| Private/public route separation                   | Pass   | The second site exposes editor and filesystem APIs during local development, but its production build contains none of those routes. Its public page loads no client scripts, editor markers, React, or GrapesJS resources.                               |
| Installable package archive                       | Pass   | `@astro-cms/core@0.1.0` was packed with a clean public source set and installed into an isolated consumer with workspace resolution disabled. The installed editor, save API, type check, and production build all passed.                                |
| Safe existing-project initialization              | Pass   | The archive-installed `astro-cms init` command preserved an existing Astro page and integration configuration, created a native-component starter, became a no-op on its second run, and produced a checked static build without `/admin`.                |
| Reviewable Git publishing                         | Pass   | A saved page was compared with its committed baseline, summarized in plain language, built, and committed from the archive-installed editor. The commit contained only the page file; stale/staged conflicts and build rollback are covered by tests.     |
| Route-backed multi-page workflow                  | Pass   | Browser testing created `/campaigns/summer`, switched pages, assembled it through the native Astro canvas, saved it to a deterministic nested file, published only that new file, and built its public static route.                                      |
| Safe project-image selection                      | Pass   | The editor discovered supported assets only below `public`, selected one through an Image property, and rerendered the native Astro preview. Required alternative text and image-safe protocols are enforced by document validation.                      |

## Browser proof workflow

1. Selected the existing Hero section.
2. Saved it as the reusable template **Campaign Hero**.
3. Started a blank page.
4. Inserted Campaign Hero as an independent copy.
5. Changed the heading to **Build campaigns without breaking the site**.
6. Changed the CTA to **Launch a campaign** with destination `/campaign`.
7. Confirmed the live native Astro preview and valid neutral document.
8. Saved the page atomically and cold-reloaded both the page and template.
9. Attempted `javascript:alert(1)` as the button destination; preview stopped and the save endpoint rejected it.
10. Restored the approved destination and created the production build.
11. Started the generated standalone server and verified its public DOM and resource boundary.
12. Repeated the workflow in an independent Astro site using five differently named native components.
13. Cold-reloaded its saved page and template, repeated the unsafe-URL rejection, and built from its editor.
14. Verified that `/admin` is absent from the independent production server while the customized page retains the adopter's own markup, CSS, typography, and link.
15. Packed `@astro-cms/core@0.1.0`, installed the archive into a non-workspace consumer, edited and saved through the installed code, and repeated the clean production-server audit.
16. Installed the archive into a bare Astro project, ran its packaged initializer twice, edited the generated page through `/admin`, confirmed exact preview and durable save, and built the generated static site without editor routes.
17. Initialized Git in that generated project, saved a heading change, reviewed its semantic and technical diff, published commit `c394502`, and verified that the commit contained only the page while the clean production artifact contained the change and omitted `/admin`.
18. Created `/campaigns/summer` from the editor, assembled and exactly previewed **Summer starts here**, published commit `7934576` containing only its nested page document, and verified the generated public route while `/admin` remained absent from production.
19. Added an Image component, opened the project-image chooser, selected `/favicon.svg`, and verified the exact Astro iframe rerendered that source with no console errors while asset traversal and image validation remained constrained.

## What this resolves

The architecture is capable of delivering the intended constrained page-building solution without adopting a React website renderer or granting marketers control over responsive CSS and internal markup. Copy-based reusable templates are sufficient for the MVP thesis; linked global components are not required to establish it. A second-project adoption test also proves that this is no longer merely a one-off editor embedded in the original sample site.

## What this does not prove

- That an unfamiliar marketing user finds the current prototype intuitive without observation or training.
- Publishing to a package registry, a stable versioned API, migrations, nonstandard/computed Astro config support, or compatibility across multiple Astro versions.
- Remote Git push or pull requests, hosted deployment, authentication, multi-user concurrency, approvals, image upload/optimization, full media management, or page rename/deletion policy.
- Commercial demand for a managed product.

These are distribution and product-validation questions. They no longer block the architectural thesis.

## Decision

The technical thesis is resolved in favor of continuing: the native-Astro, constrained-editor architecture works and can cross a project boundary.

It is worth continuing the local-first editor, but **not yet worth building all the way out as a hosted product**. The human usability gate remains unresolved and should still precede SaaS infrastructure or enterprise workflow. While that observation is deferred, additional bounded, shareable capabilities may continue when they strengthen the solution without presuming commercial demand.
