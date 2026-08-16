import { useEffect } from "react";

import "grapesjs/dist/css/grapes.min.css";
import { componentDefinitions } from "../cms/component-definitions";
import type { PageDocument } from "../cms/document-types";
import type { LocalPageSummary } from "../cms/local-page-store";
import "./editor-app.css";

interface EditorAppProps {
  initialDocument: PageDocument;
  initialPages: LocalPageSummary[];
}

const componentCategories = ["Layout", "Content", "Action"] as const;

export default function EditorApp({
  initialDocument,
  initialPages,
}: EditorAppProps) {
  const serializedDocument = JSON.stringify(initialDocument).replaceAll(
    "<",
    "\\u003c",
  );

  useEffect(() => {
    void import("./start-editor");
  }, []);

  return (
    <main className="editor-shell">
      <header className="editor-toolbar">
        <div className="page-heading">
          <p className="eyebrow">Astro-CMS page editor</p>
          <h1>{initialDocument.title}</h1>
          <div className="page-manager">
            <label htmlFor="page-switcher">Page</label>
            <select id="page-switcher" defaultValue={initialDocument.route}>
              {initialPages.map((page) => (
                <option key={page.route} value={page.route}>
                  {page.title} · {page.route}
                </option>
              ))}
            </select>
            <button id="open-create-page" type="button">
              Create page
            </button>
          </div>
        </div>
        <div className="toolbar-actions">
          <button id="save-project-button" type="button" data-primary="">
            Save changes
          </button>
          <button id="publish-project-button" type="button">
            Review &amp; publish
          </button>
          <span className="toolbar-divider" aria-hidden="true" />
          <button id="undo-button" type="button">
            Undo
          </button>
          <button id="redo-button" type="button">
            Redo
          </button>
          <button id="blank-button" type="button">
            Start new page
          </button>
          <button id="reset-button" type="button">
            Restore opening version
          </button>
          <button id="reload-project-button" type="button">
            Reload saved version
          </button>
          <a
            href={`/preview?page=${encodeURIComponent(initialDocument.route)}`}
            target="_blank"
            rel="noreferrer"
          >
            Open saved page
          </a>
        </div>
      </header>
      <p id="save-status" className="save-status" aria-live="polite" />

      <section className="milestone-note">
        <strong>Edit safely:</strong> select something in the preview to change
        its settings. Add approved content from the left or drag it to a visible
        insertion point. The site's responsive design remains locked.
      </section>

      <div className="editor-workspace">
        <aside className="editor-sidebar" aria-label="Available components">
          <h2>Components</h2>
          <p className="sidebar-help">
            Choose a component, then click a matching insertion line in the page
            preview—or drag it there.
          </p>
          <div className="component-library">
            {componentCategories.map((category) => (
              <section key={category} aria-labelledby={`category-${category}`}>
                <h3 id={`category-${category}`}>{category}</h3>
                <div className="component-library__items">
                  {Object.values(componentDefinitions)
                    .filter((definition) => definition.category === category)
                    .map((definition) => (
                      <button
                        key={definition.type}
                        type="button"
                        draggable
                        data-cms-palette-type={definition.type}
                        aria-pressed={definition.type === "Section"}
                      >
                        {definition.label}
                      </button>
                    ))}
                </div>
              </section>
            ))}
          </div>
          <section
            className="composition-tools"
            aria-labelledby="composition-heading"
          >
            <h2 id="composition-heading">Add content</h2>
            <label htmlFor="add-component-type">Choose a component</label>
            <div className="composition-tools__add">
              <select id="add-component-type">
                {Object.values(componentDefinitions).map((definition) => (
                  <option key={definition.type} value={definition.type}>
                    {definition.label}
                  </option>
                ))}
              </select>
              <button id="add-component-button" type="button">
                Add
              </button>
            </div>
            <div
              className="composition-tools__actions"
              aria-label="Selected component actions"
            >
              <button id="move-up-button" type="button">
                Move up
              </button>
              <button id="move-down-button" type="button">
                Move down
              </button>
              <button id="duplicate-button" type="button">
                Duplicate
              </button>
              <button id="delete-button" type="button">
                Delete
              </button>
            </div>
            <p id="composition-status" aria-live="polite">
              Select a component or the page.
            </p>
          </section>
          <section
            className="document-tree-panel"
            aria-labelledby="document-tree-heading"
          >
            <h2 id="document-tree-heading">Page structure</h2>
            <div id="cms-layer-tree" role="tree" aria-label="Page structure" />
          </section>
          <section
            className="template-tools"
            aria-labelledby="template-tools-heading"
          >
            <h2 id="template-tools-heading">Reusable templates</h2>
            <p className="sidebar-help">
              Save the selected section and its contents for reuse. Each new
              insertion can be edited independently.
            </p>
            <label htmlFor="template-name">Template name</label>
            <div className="template-tools__save">
              <input
                id="template-name"
                type="text"
                maxLength={80}
                placeholder="Campaign CTA"
              />
              <button id="save-template-button" type="button">
                Save selected
              </button>
            </div>
            <div
              id="reusable-template-list"
              className="template-library"
              aria-label="Reusable templates"
            />
            <p id="template-status" aria-live="polite" />
          </section>
        </aside>

        <section
          className="live-preview-panel live-preview-panel--workspace"
          aria-labelledby="live-preview-heading"
        >
          <div className="live-preview-panel__header">
            <div>
              <p className="eyebrow">Editing canvas</p>
              <h2 id="live-preview-heading">Page preview</h2>
              <p id="live-preview-status" aria-live="polite">
                Loading the page preview…
              </p>
            </div>
            <div className="preview-actions">
              <div className="preview-size-controls" aria-label="Preview width">
                <button type="button" data-preview-width="390px">
                  Phone
                </button>
                <button type="button" data-preview-width="768px">
                  Tablet
                </button>
                <button type="button" data-preview-width="100%" data-active="">
                  Desktop
                </button>
              </div>
              <button id="refresh-preview-button" type="button">
                Refresh
              </button>
              <a id="open-live-preview" href="/preview" target="_blank" hidden>
                Open separately
              </a>
            </div>
          </div>
          <div
            id="live-preview-frame-shell"
            className="live-preview-frame-shell"
          >
            <iframe id="live-preview-frame" title="Editable page preview" />
          </div>
        </section>

        <aside
          className="editor-sidebar editor-sidebar--right"
          aria-label="Settings"
        >
          <h2>Settings</h2>
          <div id="cms-properties" />
          <section id="image-asset-tools" className="image-asset-tools" hidden>
            <h3>Project image</h3>
            <p id="active-image-path" />
            <button id="open-image-assets" type="button">
              Choose from project images
            </button>
          </section>
          <div className="validation-card">
            <h2>Page check</h2>
            <p id="cms-validation">Checking page…</p>
          </div>
        </aside>
      </div>

      <div className="structure-engine" aria-hidden="true">
        <div id="cms-blocks-engine" />
        <div id="cms-canvas" />
      </div>

      <dialog id="publish-review-dialog" className="publish-review-dialog">
        <div className="publish-review-dialog__header">
          <div>
            <p className="eyebrow">Git publishing</p>
            <h2>Review this change</h2>
          </div>
          <button id="close-publish-review" type="button">
            Cancel
          </button>
        </div>
        <p id="publish-review-intro">
          Confirm what will change before creating a production build and an
          isolated Git commit.
        </p>
        <ul id="publish-change-list" className="publish-change-list" />
        <details className="publish-technical-diff">
          <summary>Technical file changes</summary>
          <pre>
            <code id="publish-change-diff" />
          </pre>
        </details>
        <p id="publish-review-status" aria-live="polite" />
        <div className="publish-review-dialog__actions">
          <button id="confirm-publish" type="button" data-primary="">
            Publish this change
          </button>
        </div>
      </dialog>

      <dialog id="create-page-dialog" className="create-page-dialog">
        <div className="publish-review-dialog__header">
          <div>
            <p className="eyebrow">Pages</p>
            <h2>Create a page</h2>
          </div>
          <button id="cancel-create-page" type="button">
            Cancel
          </button>
        </div>
        <p>
          Start with a blank page, then assemble it from the approved
          components.
        </p>
        <label htmlFor="new-page-title">Page title</label>
        <input id="new-page-title" type="text" maxLength={120} />
        <label htmlFor="new-page-path">Page path</label>
        <div className="page-path-input">
          <span aria-hidden="true">/</span>
          <input
            id="new-page-path"
            type="text"
            maxLength={160}
            placeholder="campaigns/summer-sale"
          />
        </div>
        <label htmlFor="new-page-description">Description (optional)</label>
        <textarea id="new-page-description" rows={3} maxLength={240} />
        <p id="create-page-status" aria-live="polite" />
        <div className="publish-review-dialog__actions">
          <button id="confirm-create-page" type="button" data-primary="">
            Create page
          </button>
        </div>
      </dialog>

      <dialog id="asset-picker-dialog" className="asset-picker-dialog">
        <div className="publish-review-dialog__header">
          <div>
            <p className="eyebrow">Project images</p>
            <h2>Choose an image</h2>
          </div>
          <button id="close-asset-picker" type="button">
            Cancel
          </button>
        </div>
        <p>
          These images come from the website's public folder. Choosing one
          changes only the selected component's approved image path.
        </p>
        <div
          id="asset-picker-list"
          className="asset-picker-list"
          aria-label="Available project images"
        />
        <p id="asset-picker-status" aria-live="polite" />
      </dialog>

      <details className="document-panel">
        <summary>Developer page data</summary>
        <div className="document-panel__body">
          <div>
            <p>
              This validated document is the portable content saved by the
              editor. Marketing users do not need it for normal editing.
            </p>
          </div>
          <pre>
            <code id="cms-document-output" />
          </pre>
        </div>
      </details>

      <script
        id="initial-document"
        type="application/json"
        dangerouslySetInnerHTML={{ __html: serializedDocument }}
      />
    </main>
  );
}
