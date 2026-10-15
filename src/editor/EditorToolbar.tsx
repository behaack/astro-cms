import { useEffect, useRef, useState } from "react";

import type { PageDocument } from "../cms/document-types";
import type { LocalPageSummary } from "../cms/local-page-store";
import ToolbarAction from "./ToolbarAction";

interface EditorToolbarProps {
  document: PageDocument;
  pages: LocalPageSummary[];
}

export default function EditorToolbar({
  document: page,
  pages,
}: EditorToolbarProps) {
  const [overflowOpen, setOverflowOpen] = useState(false);
  const controlsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!overflowOpen) return;
    const controls = controlsRef.current;
    controls
      ?.querySelector<HTMLElement>(
        ".toolbar-secondary-actions button:not(:disabled), .toolbar-secondary-actions a[href]",
      )
      ?.focus();

    const closeOutside = (event: Event) => {
      if (event.target instanceof Node && !controls?.contains(event.target)) {
        setOverflowOpen(false);
      }
    };
    const media = window.matchMedia("(max-width: 1100px)");
    const closeOnWideLayout = () => {
      if (!media.matches) setOverflowOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("focusin", closeOutside);
    media.addEventListener("change", closeOnWideLayout);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("focusin", closeOutside);
      media.removeEventListener("change", closeOnWideLayout);
    };
  }, [overflowOpen]);

  return (
    <header className="editor-toolbar">
      <div className="page-heading">
        <p className="eyebrow">Astro-CMS page editor</p>
        <h1>{page.title}</h1>
      </div>
      <div
        ref={controlsRef}
        className="editor-toolbar__controls"
        onKeyDown={(event) => {
          if (event.key === "Escape" && overflowOpen) {
            event.preventDefault();
            setOverflowOpen(false);
            document.getElementById("toolbar-more-actions")?.focus();
          }
        }}
        onClick={(event) => {
          const control =
            event.target instanceof Element
              ? event.target.closest("button, a")
              : null;
          if (control && control.id !== "toolbar-more-actions") {
            setOverflowOpen(false);
          }
        }}
      >
        <div className="page-manager" role="group" aria-label="Page management">
          <label htmlFor="page-switcher">Page</label>
          <select id="page-switcher" aria-label="Page" defaultValue={page.route}>
            {pages.map((item) => (
              <option key={item.route} value={item.route}>
                {item.title} · {item.route}
              </option>
            ))}
          </select>
          <ToolbarAction
            id="open-create-page"
            label="Create page"
            icon="create"
            tooltip="Create a separate page with its own address"
          />
        </div>
        <div
          id="toolbar-secondary-actions"
          className="toolbar-secondary-actions"
          data-open={overflowOpen ? "" : undefined}
        >
          <div
            className="toolbar-page-actions"
            role="group"
            aria-label="Page actions"
          >
            <span className="toolbar-menu-heading">Page actions</span>
            <ToolbarAction
              id="open-rename-page"
              label="Rename page"
              icon="rename"
              disabled={page.route === "/"}
              tooltip={
                page.route === "/"
                  ? "Rename page: the homepage path cannot be renamed."
                  : "Rename page and update known internal links"
              }
            />
            <ToolbarAction
              id="remove-page"
              label="Remove page"
              icon="remove"
              disabled={page.route === "/"}
              tooltip={
                page.route === "/"
                  ? "Remove page: the homepage cannot be deleted."
                  : "Remove page after checking incoming links"
              }
            />
            <ToolbarAction
              id="blank-button"
              label="Clear page content"
              icon="clear"
              tooltip="Clear the current page's content, keeping its address"
            />
          </div>
          <div
            className="toolbar-editor-actions"
            role="group"
            aria-label="Edit and publish current page"
          >
            <span className="toolbar-menu-heading">Edit and publish</span>
            <ToolbarAction
              id="open-seo-settings"
              label="Search & sharing"
              icon="search"
            />
            <ToolbarAction
              id="publish-project-button"
              label="Review & publish"
              icon="publish"
            />
            <span className="toolbar-divider" aria-hidden="true" />
            <ToolbarAction id="undo-button" label="Undo" icon="undo" />
            <ToolbarAction id="redo-button" label="Redo" icon="redo" />
            <ToolbarAction
              id="reset-button"
              label="Restore opening version"
              icon="restore"
            />
            <ToolbarAction
              id="reload-project-button"
              label="Reload saved version"
              icon="reload"
            />
            <ToolbarAction
              id="open-saved-page"
              label="Open saved page"
              icon="open"
              href={`/preview?page=${encodeURIComponent(page.route)}`}
            />
          </div>
        </div>
        <div className="toolbar-primary-actions">
          <ToolbarAction
            id="save-project-button"
            label="Save changes"
            icon="save"
            primary
          />
          <ToolbarAction
            id="toolbar-more-actions"
            label="More actions"
            icon="more"
            className="toolbar-overflow-trigger"
            expanded={overflowOpen}
            controls="toolbar-secondary-actions"
            onClick={() => setOverflowOpen((open) => !open)}
          />
        </div>
      </div>
    </header>
  );
}
