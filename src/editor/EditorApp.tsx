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
          <p className="eyebrow">Astro-CMS feasibility prototype</p>
          <h1>Constrained component editor</h1>
        </div>
        <div className="toolbar-actions">
          <button id="blank-button" type="button">
            Start blank
          </button>
          <button id="undo-button" type="button">
            Undo
          </button>
          <button id="redo-button" type="button">
            Redo
          </button>
          <button id="reset-button" type="button">
            Reset
          </button>
          <a href="/preview" target="_blank" rel="noreferrer">
            Project-file preview
          </a>
        </div>
      </header>

      <section className="milestone-note">
        <strong>Direct Astro editing:</strong> choose or drag an approved
        component, place it at a visible insertion point in the real preview,
        and drag existing components there to reorder them. The preview is the
        same native Astro component tree used by the published page.
      </section>

      <div className="editor-workspace">
        <aside className="editor-sidebar" aria-label="Available components">
          <h2>Components</h2>
          <p className="sidebar-help">
            Choose a component, then click a matching insertion line in the
            Astro canvas—or drag it there.
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
            <h2 id="composition-heading">Compose</h2>
            <label htmlFor="add-component-type">Component type</label>
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
            <h2 id="document-tree-heading">Document tree</h2>
            <div id="cms-layer-tree" role="tree" aria-label="Page structure" />
          </section>
        </aside>

        <section
          className="live-preview-panel live-preview-panel--workspace"
          aria-labelledby="live-preview-heading"
        >
          <div className="live-preview-panel__header">
            <div>
              <p className="eyebrow">Primary editing canvas</p>
              <h2 id="live-preview-heading">Live Astro page</h2>
              <p id="live-preview-status" aria-live="polite">
                Preparing the first Astro render…
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
            <iframe
              id="live-preview-frame"
              title="Directly editable Astro page"
            />
          </div>
        </section>

        <aside
          className="editor-sidebar editor-sidebar--right"
          aria-label="Properties"
        >
          <h2>Properties</h2>
          <div id="cms-properties" />
          <div className="validation-card">
            <h2>Validation</h2>
            <p id="cms-validation">Checking document…</p>
          </div>
        </aside>
      </div>

      <div className="structure-engine" aria-hidden="true">
        <div id="cms-blocks-engine" />
        <div id="cms-canvas" />
      </div>

      <section className="document-panel">
        <div className="document-panel__header">
          <div>
            <p className="eyebrow">Canonical output</p>
            <h2>Neutral Astro-CMS document</h2>
          </div>
          <div className="toolbar-actions">
            <button id="save-project-button" type="button">
              Save to project
            </button>
            <button id="reload-project-button" type="button">
              Reload project file
            </button>
          </div>
        </div>
        <p id="save-status" aria-live="polite" />
        <pre>
          <code id="cms-document-output" />
        </pre>
      </section>

      <script
        id="initial-document"
        type="application/json"
        dangerouslySetInnerHTML={{ __html: serializedDocument }}
      />
    </main>
  );
}
