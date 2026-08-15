import grapesjs, {
  type Component,
  type Editor,
  type Plugin,
  type TraitProperties,
} from "grapesjs";

import { componentDefinitions } from "../cms/component-definitions";
import type {
  ComponentDefinition,
  ComponentNode,
  PageDocument,
  PropertyDefinition,
} from "../cms/document-types";
import { assertPageDocument, validatePageDocument } from "../cms/validation";
import {
  editorRootToDocument,
  editorTypeFor,
  nodeToEditorComponent,
} from "./document-adapter";

const initialDocumentElement =
  document.querySelector<HTMLScriptElement>("#initial-document");

if (!initialDocumentElement?.textContent) {
  throw new Error("The editor requires an initial Astro-CMS document.");
}

const initialDocument = assertPageDocument(
  JSON.parse(initialDocumentElement.textContent),
);

function traitFor(name: string, property: PropertyDefinition): TraitProperties {
  if (property.type === "select") {
    return {
      type: "select",
      name,
      label: property.label,
      changeProp: true,
      options: property.options?.map((option) => ({
        id: String(option.id),
        label: option.label,
      })),
    };
  }

  if (property.type === "boolean") {
    return {
      type: "checkbox",
      name,
      label: property.label,
      changeProp: true,
    };
  }

  return {
    type: "text",
    name,
    label: property.label,
    changeProp: true,
  };
}

function registerDefinition(
  editor: Editor,
  definition: ComponentDefinition,
): void {
  const propertyDefaults = Object.fromEntries(
    Object.entries(definition.properties).map(([name, property]) => [
      name,
      property.defaultValue,
    ]),
  );

  editor.Components.addType(editorTypeFor(definition.type), {
    model: {
      defaults: {
        tagName: "div",
        name: definition.label,
        cmsType: definition.type,
        ...propertyDefaults,
        attributes: {
          class: "astro-cms-canvas-node",
          "data-cms-label": definition.label,
          "data-cms-type": definition.type,
        },
        stylable: false,
        droppable: definition.acceptsChildren,
        traits: Object.entries(definition.properties).map(([name, property]) =>
          traitFor(name, property),
        ),
      },
      init(this: Component) {
        if (!this.get("cmsId")) {
          this.set("cmsId", crypto.randomUUID());
        }
      },
    },
  });

  editor.Blocks.add(`block-${definition.type}`, {
    label: definition.label,
    category: definition.category,
    content: {
      type: editorTypeFor(definition.type),
    },
  });
}

const astroCmsPlugin: Plugin = (editor) => {
  Object.values(componentDefinitions).forEach((definition) =>
    registerDefinition(editor, definition),
  );
};

const canvasStyles = `
  body {
    margin: 0;
    padding: 24px;
    color: #17201d;
    background: #f7f9f6;
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  }

  .astro-cms-canvas-node {
    min-height: 64px;
    margin: 10px;
    padding: 16px;
    border: 1px solid #b9c9c0;
    border-radius: 10px;
    background: #ffffff;
    box-shadow: 0 8px 24px rgb(23 60 48 / 8%);
  }

  .astro-cms-canvas-node::before {
    display: block;
    margin-bottom: 8px;
    color: #315f50;
    content: attr(data-cms-label);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  [data-cms-type='Section'] {
    background: #edf4ef;
  }

  [data-cms-type='Stack'] {
    background: #f8faf8;
  }
`;

const editor = grapesjs.init({
  container: "#cms-canvas",
  height: "100%",
  width: "auto",
  storageManager: false,
  panels: { defaults: [] },
  styleManager: { sectors: [] },
  selectorManager: { componentFirst: true },
  blockManager: { appendTo: "#cms-blocks" },
  traitManager: { appendTo: "#cms-properties" },
  plugins: [astroCmsPlugin],
  style: canvasStyles,
});

declare global {
  interface Window {
    __astroCmsEditor?: Editor;
  }
}

window.__astroCmsEditor = editor;

editor.addComponents(initialDocument.content.map(nodeToEditorComponent));

const output = document.querySelector<HTMLElement>("#cms-document-output");
const validation = document.querySelector<HTMLElement>("#cms-validation");
const propertiesPanel = document.querySelector<HTMLElement>("#cms-properties");
const livePreviewFrame = document.querySelector<HTMLIFrameElement>(
  "#live-preview-frame",
);
const livePreviewFrameShell = document.querySelector<HTMLElement>(
  "#live-preview-frame-shell",
);
const livePreviewStatus = document.querySelector<HTMLElement>(
  "#live-preview-status",
);
const openLivePreview =
  document.querySelector<HTMLAnchorElement>("#open-live-preview");
let activeComponent: Component | null = null;
let livePreviewDraftId: string | undefined;
let livePreviewTimer: ReturnType<typeof setTimeout> | undefined;
let livePreviewRequest = 0;

interface LivePreviewResponse {
  ok: boolean;
  draftId?: string;
  revision?: number;
  previewUrl?: string;
  message?: string;
  issues?: Array<{ message: string }>;
}

function selectInitialComponent(): void {
  const initialSelection = editor
    .getWrapper()
    ?.findType(editorTypeFor("Heading"))
    .at(0);
  if (initialSelection) {
    activeComponent = initialSelection;
    editor.select(initialSelection);
  }
}

function currentDocument(): PageDocument {
  const models = editor.getWrapper()?.components().models as Component[];
  return editorRootToDocument(models ?? [], initialDocument);
}

function setLivePreviewStatus(
  message: string,
  state: "pending" | "ready" | "error",
): void {
  if (!livePreviewStatus) return;
  livePreviewStatus.textContent = message;
  livePreviewStatus.dataset.state = state;
}

async function renderLivePreview(documentValue: PageDocument): Promise<void> {
  const issues = validatePageDocument(documentValue);
  if (issues.length > 0) {
    setLivePreviewStatus(
      `Preview paused: ${issues.map((issue) => issue.message).join(" ")}`,
      "error",
    );
    return;
  }

  const requestNumber = ++livePreviewRequest;
  setLivePreviewStatus("Sending the neutral document to Astro…", "pending");

  try {
    const response = await fetch("/api/preview-drafts", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        draftId: livePreviewDraftId,
        document: documentValue,
      }),
    });
    const result = (await response.json()) as LivePreviewResponse;

    if (requestNumber !== livePreviewRequest) return;

    if (
      !response.ok ||
      !result.ok ||
      !result.draftId ||
      !result.revision ||
      !result.previewUrl
    ) {
      const detail =
        result.issues?.map((issue) => issue.message).join(" ") ??
        result.message ??
        `Preview request failed (${response.status}).`;
      setLivePreviewStatus(detail, "error");
      return;
    }

    livePreviewDraftId = result.draftId;
    const previewUrl = `${result.previewUrl}?revision=${result.revision}`;

    if (openLivePreview) {
      openLivePreview.href = previewUrl;
      openLivePreview.hidden = false;
    }

    if (livePreviewFrame) {
      livePreviewFrame.src = previewUrl;
    }
  } catch (error) {
    if (requestNumber !== livePreviewRequest) return;
    const message = error instanceof Error ? error.message : "Unknown error";
    setLivePreviewStatus(`Astro preview failed: ${message}`, "error");
  }
}

function scheduleLivePreview(documentValue: PageDocument): void {
  if (livePreviewTimer) clearTimeout(livePreviewTimer);
  livePreviewTimer = setTimeout(() => {
    void renderLivePreview(documentValue);
  }, 250);
}

function refreshDocumentOutput(): void {
  const documentValue = currentDocument();
  const issues = validatePageDocument(documentValue);

  if (output) {
    output.textContent = JSON.stringify(documentValue, null, 2);
  }

  if (validation) {
    validation.textContent =
      issues.length === 0
        ? "Document is valid."
        : issues.map((issue) => issue.message).join(" ");
    validation.dataset.state = issues.length === 0 ? "valid" : "invalid";
  }

  if (issues.length === 0) {
    scheduleLivePreview(documentValue);
  } else {
    if (livePreviewTimer) clearTimeout(livePreviewTimer);
    setLivePreviewStatus(
      `Preview paused: ${issues.map((issue) => issue.message).join(" ")}`,
      "error",
    );
  }
}

function replaceEditorContent(nodes: ComponentNode[]): void {
  editor.getWrapper()?.components(nodes.map(nodeToEditorComponent));
  selectInitialComponent();
  refreshDocumentOutput();
}

editor.on("update", refreshDocumentOutput);
editor.on("component:update", refreshDocumentOutput);
editor.on("trait:value", refreshDocumentOutput);
editor.on("component:selected", (component: Component) => {
  activeComponent = component;
});
editor.on("load", () => {
  selectInitialComponent();
  refreshDocumentOutput();
});

function synchronizePropertyControl(event: Event): void {
  const control = event.target;
  if (
    !(control instanceof HTMLInputElement) &&
    !(control instanceof HTMLSelectElement)
  ) {
    return;
  }

  const traitWrapper = control.closest<HTMLElement>(
    "[class*='gjs-trt-trait__wrp-']",
  );
  const propertyClass = [...(traitWrapper?.classList ?? [])].find((className) =>
    className.startsWith("gjs-trt-trait__wrp-"),
  );
  const propertyName = propertyClass?.replace("gjs-trt-trait__wrp-", "");
  const componentType = activeComponent?.get("cmsType") as
    keyof typeof componentDefinitions | undefined;

  if (!propertyName || !componentType || !activeComponent) return;

  const definition = componentDefinitions[componentType] as ComponentDefinition;
  const property: PropertyDefinition | undefined =
    definition.properties[propertyName];
  if (!property) return;

  let value: string | number | boolean = control.value;
  if (control instanceof HTMLInputElement && control.type === "checkbox") {
    value = control.checked;
  } else if (property.type === "select") {
    value =
      property.options?.find((option) => String(option.id) === control.value)
        ?.id ?? control.value;
  }

  activeComponent.set(propertyName, value);
  refreshDocumentOutput();
}

propertiesPanel?.addEventListener("input", synchronizePropertyControl);
propertiesPanel?.addEventListener("change", synchronizePropertyControl);

livePreviewFrame?.addEventListener("load", () => {
  const marker = livePreviewFrame.contentDocument?.querySelector<HTMLElement>(
    '[data-astro-live-preview="server"]',
  );

  if (!marker) {
    setLivePreviewStatus(
      "The preview loaded, but the Astro server-render marker is missing.",
      "error",
    );
    return;
  }

  const revision = marker.dataset.previewRevision ?? "unknown";
  setLivePreviewStatus(
    `Astro server-rendered revision ${revision}. No editor HTML was used.`,
    "ready",
  );
});

document
  .querySelector("#refresh-preview-button")
  ?.addEventListener("click", () => {
    if (livePreviewTimer) clearTimeout(livePreviewTimer);
    void renderLivePreview(currentDocument());
  });

document
  .querySelectorAll<HTMLButtonElement>("[data-preview-width]")
  .forEach((button) => {
    button.addEventListener("click", () => {
      if (!livePreviewFrameShell || !button.dataset.previewWidth) return;

      livePreviewFrameShell.style.maxWidth = button.dataset.previewWidth;
      document
        .querySelectorAll<HTMLButtonElement>("[data-preview-width]")
        .forEach((candidate) => {
          if (candidate === button) {
            candidate.dataset.active = "";
          } else {
            delete candidate.dataset.active;
          }
        });
    });
  });

selectInitialComponent();
refreshDocumentOutput();

document.querySelector("#undo-button")?.addEventListener("click", () => {
  editor.UndoManager.undo();
});

document.querySelector("#redo-button")?.addEventListener("click", () => {
  editor.UndoManager.redo();
});

document.querySelector("#reset-button")?.addEventListener("click", () => {
  replaceEditorContent(initialDocument.content);
});

document
  .querySelector("#save-browser-button")
  ?.addEventListener("click", () => {
    localStorage.setItem("astro-cms-draft", JSON.stringify(currentDocument()));
    const saveStatus = document.querySelector<HTMLElement>("#save-status");
    if (saveStatus) {
      saveStatus.textContent = "Draft saved in this browser.";
    }
  });

document
  .querySelector("#load-browser-button")
  ?.addEventListener("click", () => {
    const stored = localStorage.getItem("astro-cms-draft");
    if (!stored) return;
    const storedDocument = assertPageDocument(JSON.parse(stored));
    replaceEditorContent(storedDocument.content);
  });
