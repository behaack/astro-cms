import { useEffect } from "react";

import "grapesjs/dist/css/grapes.min.css";
import { componentDefinitions } from "../cms/component-definitions";
import type { PageDocument } from "../cms/document-types";
import "./editor-app.css";

interface EditorAppProps {
  initialDocument: PageDocument;
}

const componentCategories = ["Layout", "Content", "Action"] as const;

export default function EditorApp({ initialDocument }: EditorAppProps) {
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
        <div>
          <p className="eyebrow">Astro-CMS page editor</p>
          <h1>{initialDocument.title}</h1>
        </div>
        <div className="toolbar-actions">
          <button id="save-project-button" type="button" data-primary="">
            Save changes
          </button>
          <button id="publish-project-button" type="button">
            Build for publishing
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
          <a href="/preview" target="_blank" rel="noreferrer">
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
