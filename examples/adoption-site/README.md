# Independent adoption proof

This is a separate Astro site that consumes `@astro-cms/core` through the
workspace package boundary. It owns its page, layout, styles, manifest, and five
native Astro components: `Band`, `Group`, `Title`, `Copy`, and `LinkButton`.
It does not copy the editor, renderer, validation, storage, template, preview,
or publish implementation.

## Adoption surface

The site supplies three paths to the integration. Astro's React integration is
present only to support the private editor shell; no React component renders the
website:

```js
defineConfig({
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

- The manifest declares approved components, properties, defaults, and nesting.
- The component directory contains the adopting site's real `.astro` files.
- The preview layout supplies the adopting site's real global styles and page shell.
- `dev-only` adds the editor and local write APIs during development but excludes
  them from production builds.

The public route imports only the package renderer and local document store.

## Verified workflow

The second site has been browser-tested through this complete flow:

1. Load the page and reusable template from project files.
2. Insert the template as an independent copy.
3. Edit its title and link through generated controls.
4. Preview the unsaved document through the site's real Astro components.
5. Reject and refuse to save an unsafe `javascript:` URL.
6. Save the valid page atomically and recover it after a cold reload.
7. Build and run the independent production artifact.
8. Confirm the production build contains no editor routes, and that its public
   page loads no editor controls, markers, React, GrapesJS, or client scripts.

This proves workspace-level adoption. It does not yet prove a published npm
package, automated installation, hosted persistence, authentication, or a polished
first-time developer experience.
