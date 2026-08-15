import grapesjs, {
  type Block,
  type Component,
  type ComponentDragEventData,
  type Editor,
  type Plugin,
  type TraitProperties,
} from "grapesjs";

import { componentDefinitions } from "../cms/component-definitions";
import {
  canContainComponent,
  cloneComponentNodeWithFreshIds,
  createComponentNode,
} from "../cms/composition";
import type {
  ComponentDefinition,
  ComponentNode,
  ComponentType,
  PageDocument,
  PropertyDefinition,
} from "../cms/document-types";
import type { ReusableTemplate } from "../cms/template-types";
import { assertPageDocument, validatePageDocument } from "../cms/validation";
import {
  editorComponentToNode,
  editorRootToDocument,
  editorTypeFor,
  nodeToEditorComponent,
} from "./document-adapter";
import {
  createReusableTemplateControls,
  type ReusableTemplateControls,
} from "./reusable-template-controls";

const initialDocumentElement =
  document.querySelector<HTMLScriptElement>("#initial-document");

if (!initialDocumentElement?.textContent) {
  throw new Error("The editor requires an initial Astro-CMS document.");
}

const initialDocument = assertPageDocument(
  JSON.parse(initialDocumentElement.textContent),
);

function componentTypeOf(component: Component): ComponentType | null {
  const type = component.get("cmsType") as ComponentType | undefined;
  return type && type in componentDefinitions ? type : null;
}

function canPlaceEditorComponent(
  source: Component,
  target: Component,
): boolean {
  const sourceType = componentTypeOf(source);
  return sourceType
    ? canContainComponent(componentTypeOf(target), sourceType)
    : false;
}

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
        copyable: false,
        stylable: false,
        draggable: (source: Component, target: Component) =>
          canPlaceEditorComponent(source, target),
        droppable: definition.acceptsChildren
          ? (source: Component, target: Component) =>
              canPlaceEditorComponent(source, target)
          : false,
        traits: Object.entries(definition.properties).map(([name, property]) =>
          traitFor(name, property),
        ),
      },
      init(this: Component) {
        if (!this.get("cmsId")) {
          this.set("cmsId", crypto.randomUUID());
        }
        this.addAttributes({ "data-cms-id": String(this.get("cmsId")) });
      },
    },
  });

  editor.Blocks.add(`block-${definition.type}`, {
    attributes: {
      "aria-label": `Add ${definition.label}`,
      role: "button",
      tabindex: "0",
    },
    label: definition.label,
    category: definition.category,
    content: {
      type: editorTypeFor(definition.type),
    },
    onClick: () => addComponent(definition.type),
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
  blockManager: { appendTo: "#cms-blocks-engine" },
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

const wrapper = editor.getWrapper()!;
if (!wrapper) {
  throw new Error("The editor did not create a page wrapper.");
}
wrapper.set({
  copyable: false,
  draggable: false,
  droppable: (source: Component, target: Component) =>
    canPlaceEditorComponent(source, target),
  removable: false,
});
wrapper.addAttributes({
  "aria-label": "Page canvas drop zone",
  "data-cms-drop-root": "",
  role: "group",
  tabindex: "0",
});
editor.addComponents(initialDocument.content.map(nodeToEditorComponent));

const output = document.querySelector<HTMLElement>("#cms-document-output");
const validation = document.querySelector<HTMLElement>("#cms-validation");
const propertiesPanel = document.querySelector<HTMLElement>("#cms-properties");
const layerTree = document.querySelector<HTMLElement>("#cms-layer-tree");
const compositionStatus = document.querySelector<HTMLElement>(
  "#composition-status",
);
const addComponentType = document.querySelector<HTMLSelectElement>(
  "#add-component-type",
);
const addComponentButton = document.querySelector<HTMLButtonElement>(
  "#add-component-button",
);
const paletteButtons = [
  ...document.querySelectorAll<HTMLButtonElement>("[data-cms-palette-type]"),
];
const moveUpButton =
  document.querySelector<HTMLButtonElement>("#move-up-button");
const moveDownButton =
  document.querySelector<HTMLButtonElement>("#move-down-button");
const duplicateButton =
  document.querySelector<HTMLButtonElement>("#duplicate-button");
const deleteButton =
  document.querySelector<HTMLButtonElement>("#delete-button");
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
const saveStatus = document.querySelector<HTMLElement>("#save-status");
const saveProjectButton = document.querySelector<HTMLButtonElement>(
  "#save-project-button",
);
const publishProjectButton = document.querySelector<HTMLButtonElement>(
  "#publish-project-button",
);
const reloadProjectButton = document.querySelector<HTMLButtonElement>(
  "#reload-project-button",
);
const templateNameInput =
  document.querySelector<HTMLInputElement>("#template-name");
const saveTemplateButton = document.querySelector<HTMLButtonElement>(
  "#save-template-button",
);
const reusableTemplateList = document.querySelector<HTMLElement>(
  "#reusable-template-list",
);
const templateStatus = document.querySelector<HTMLElement>("#template-status");

let activeComponent: Component | null = null;
let lastDeletedCmsId: string | undefined;
let livePreviewDraftId: string | undefined;
let livePreviewTimer: ReturnType<typeof setTimeout> | undefined;
let livePreviewRequest = 0;
let reusableTemplateControls: ReusableTemplateControls | undefined;

const PALETTE_DRAG_MIME = "application/x-astro-cms-component";
const COMPONENT_DRAG_MIME = "application/x-astro-cms-node";
const PAGE_PARENT_ID = "page";

interface LivePreviewResponse {
  ok: boolean;
  draftId?: string;
  revision?: number;
  previewUrl?: string;
  message?: string;
  issues?: Array<{ message: string }>;
}

interface PageDocumentResponse {
  ok: boolean;
  document?: PageDocument;
  message?: string;
  issues?: Array<{ message: string }>;
}

interface InsertionPoint {
  parent: Component;
  at: number;
}

interface ComponentDragOrigin {
  cmsId?: string;
  parentId: string;
  index: number;
}

interface DirectPreviewDrag {
  type: ComponentType;
  sourceId?: string;
}

let componentDragOrigin: ComponentDragOrigin | undefined;
let directPreviewDrag: DirectPreviewDrag | undefined;
let suppressNextPreviewClick = false;

function setCompositionStatus(
  message: string,
  state: "neutral" | "success" | "error" = "neutral",
): void {
  if (!compositionStatus) return;
  compositionStatus.textContent = message;
  compositionStatus.dataset.state = state;
}

function selectedComponentType(): ComponentType {
  const selected = addComponentType?.value as ComponentType | undefined;
  return selected && selected in componentDefinitions ? selected : "Section";
}

function selectPaletteType(type: ComponentType): void {
  if (addComponentType) addComponentType.value = type;
  paletteButtons.forEach((button) => {
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.cmsPaletteType === type),
    );
  });
  updateCompositionActions();
  updateDirectInsertionZones();
}

function setSaveStatus(
  message: string,
  state: "pending" | "success" | "error",
): void {
  if (!saveStatus) return;
  saveStatus.textContent = message;
  saveStatus.dataset.state = state;
}

function pageDocumentResponseMessage(
  result: PageDocumentResponse,
  fallback: string,
): string {
  return (
    result.message ??
    result.issues?.map((issue) => issue.message).join(" ") ??
    fallback
  );
}

function componentChildren(component: Component): Component[] {
  return component.components().models as Component[];
}

function findComponentByCmsId(id: string): Component | undefined {
  const visit = (component: Component): Component | undefined => {
    if (String(component.get("cmsId")) === id) return component;
    for (const child of componentChildren(component)) {
      const match = visit(child);
      if (match) return match;
    }
    return undefined;
  };

  for (const component of componentChildren(wrapper)) {
    const match = visit(component);
    if (match) return match;
  }
  return undefined;
}

function activeCmsId(): string | undefined {
  if (!activeComponent || activeComponent === wrapper) return undefined;
  const value = activeComponent.get("cmsId");
  return value ? String(value) : undefined;
}

function componentTreeLabel(component: Component): string {
  const type = componentTypeOf(component);
  if (!type) return "Page";
  const detail = component.get("text") ?? component.get("label");
  if (typeof detail !== "string" || detail.trim().length === 0) return type;
  const shortened = detail.trim().slice(0, 28);
  return `${type}: ${shortened}${detail.trim().length > 28 ? "…" : ""}`;
}

function selectComponent(component: Component): void {
  activeComponent = component;
  editor.select(component);
  renderCompositionTree();
  updateCompositionActions();
  reusableTemplateControls?.refreshSelection();
  syncLivePreviewSelection();
}

function selectInitialComponent(): void {
  const heading = wrapper.findType(editorTypeFor("Heading")).at(0);
  const initialSelection =
    heading ?? componentChildren(wrapper).at(0) ?? wrapper;
  selectComponent(initialSelection);
}

function renderCompositionTree(): void {
  if (!layerTree) return;
  layerTree.replaceChildren();

  const addTreeItem = (component: Component, depth: number): void => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tree-item";
    button.setAttribute("role", "treeitem");
    button.setAttribute("aria-level", String(depth + 1));
    button.setAttribute("aria-selected", String(component === activeComponent));
    button.style.setProperty("--tree-depth", String(depth));
    button.textContent = componentTreeLabel(component);
    button.addEventListener("click", () => selectComponent(component));
    layerTree.append(button);

    componentChildren(component).forEach((child) =>
      addTreeItem(child, depth + 1),
    );
  };

  addTreeItem(wrapper, 0);
}

function resolveInsertionPoint(type: ComponentType): InsertionPoint | null {
  let cursor = activeComponent ?? wrapper;

  if (canContainComponent(componentTypeOf(cursor), type)) {
    return { parent: cursor, at: componentChildren(cursor).length };
  }

  while (cursor !== wrapper) {
    const parent = cursor.parent();
    if (!parent) break;
    if (canContainComponent(componentTypeOf(parent), type)) {
      return { parent, at: cursor.index() + 1 };
    }
    cursor = parent;
  }

  return null;
}

function updateCompositionActions(): void {
  const selectedType = addComponentType?.value as ComponentType | undefined;
  if (addComponentButton) {
    addComponentButton.disabled =
      !selectedType || resolveInsertionPoint(selectedType) === null;
  }

  const isPage = !activeComponent || activeComponent === wrapper;
  const parent = isPage ? undefined : activeComponent?.parent();
  const index = isPage ? -1 : (activeComponent?.index() ?? -1);
  const siblingCount = parent ? componentChildren(parent).length : 0;

  if (moveUpButton) moveUpButton.disabled = isPage || index <= 0;
  if (moveDownButton) {
    moveDownButton.disabled = isPage || index < 0 || index >= siblingCount - 1;
  }
  if (duplicateButton) duplicateButton.disabled = isPage;
  if (deleteButton) deleteButton.disabled = isPage;
}

function currentDocument(): PageDocument {
  return editorRootToDocument(componentChildren(wrapper), initialDocument);
}

function setLivePreviewStatus(
  message: string,
  state: "pending" | "ready" | "error",
): void {
  if (!livePreviewStatus) return;
  livePreviewStatus.textContent = message;
  livePreviewStatus.dataset.state = state;
}

function syncLivePreviewSelection(): void {
  const previewDocument = livePreviewFrame?.contentDocument;
  if (!previewDocument) return;

  const selectedId = activeCmsId();
  previewDocument
    .querySelectorAll<HTMLElement>("[data-astro-cms-selected]")
    .forEach((element) => element.removeAttribute("data-astro-cms-selected"));

  if (!selectedId) return;
  const matchingNode = [
    ...previewDocument.querySelectorAll<HTMLElement>("[data-astro-cms-node]"),
  ].find((element) => element.dataset.astroCmsNode === selectedId);
  matchingNode?.setAttribute("data-astro-cms-selected", "");
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
  setLivePreviewStatus("Updating the page preview…", "pending");

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
    setLivePreviewStatus(`Page preview failed: ${message}`, "error");
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
        ? "Page is ready."
        : issues.map((issue) => issue.message).join(" ");
    validation.dataset.state = issues.length === 0 ? "valid" : "invalid";
  }

  renderCompositionTree();
  updateCompositionActions();

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
  wrapper.components(nodes.map(nodeToEditorComponent));
  selectInitialComponent();
  refreshDocumentOutput();
}

function insertComponentAt(
  type: ComponentType,
  insertion: InsertionPoint,
  placementDescription = "the selected location",
): Component | undefined {
  if (!canContainComponent(componentTypeOf(insertion.parent), type)) {
    setCompositionStatus(
      `${type} cannot be placed at ${placementDescription}.`,
      "error",
    );
    return undefined;
  }

  const node = createComponentNode(type);
  const componentDefinition = nodeToEditorComponent(node);
  const canMove = editor.Components.canMove(
    insertion.parent,
    componentDefinition,
    insertion.at,
  );
  if (!canMove.result) {
    setCompositionStatus(
      `${type} was rejected by the editor placement policy.`,
      "error",
    );
    return undefined;
  }

  const created = insertion.parent.append(componentDefinition, {
    at: insertion.at,
  })[0];
  if (!created) return undefined;
  lastDeletedCmsId = undefined;
  selectComponent(created);
  setCompositionStatus(`${type} added at ${placementDescription}.`, "success");
  refreshDocumentOutput();
  return created;
}

function selectedComponentNode(): ComponentNode | null {
  if (!activeComponent || activeComponent === wrapper) return null;
  return editorComponentToNode(activeComponent);
}

function insertReusableTemplate(template: ReusableTemplate): boolean {
  const insertion = resolveInsertionPoint(template.root.type);
  if (!insertion) {
    setCompositionStatus(
      `${template.name} cannot be placed here. Select a compatible parent or sibling.`,
      "error",
    );
    return false;
  }

  const clone = cloneComponentNodeWithFreshIds(template.root);
  const componentDefinition = nodeToEditorComponent(clone);
  const canMove = editor.Components.canMove(
    insertion.parent,
    componentDefinition,
    insertion.at,
  );
  if (!canMove.result) {
    setCompositionStatus(
      `${template.name} was rejected by the placement policy.`,
      "error",
    );
    return false;
  }

  const created = insertion.parent.append(componentDefinition, {
    at: insertion.at,
  })[0];
  if (!created) return false;

  lastDeletedCmsId = undefined;
  selectComponent(created);
  setCompositionStatus(
    `${template.name} inserted as an independent copy with fresh identities.`,
    "success",
  );
  refreshDocumentOutput();
  return true;
}

function addComponent(type: ComponentType): void {
  const insertion = resolveInsertionPoint(type);
  if (!insertion) {
    setCompositionStatus(
      `${type} cannot be placed here. Select a compatible parent or sibling.`,
      "error",
    );
    return;
  }

  insertComponentAt(type, insertion);
}

function parentForPreviewId(parentId: string): Component | undefined {
  return parentId === PAGE_PARENT_ID ? wrapper : findComponentByCmsId(parentId);
}

function componentContains(
  possibleAncestor: Component,
  component: Component,
): boolean {
  let cursor: Component | undefined = component;
  while (cursor && cursor !== wrapper) {
    if (cursor === possibleAncestor) return true;
    cursor = cursor.parent() ?? undefined;
  }
  return false;
}

function moveComponentToInsertion(
  sourceId: string,
  parentId: string,
  insertionAt: number,
): void {
  const source = findComponentByCmsId(sourceId);
  const parent = parentForPreviewId(parentId);
  if (!source || !parent || source === wrapper) return;

  if (source === parent || componentContains(source, parent)) {
    setCompositionStatus(
      "A component cannot be moved inside itself or one of its children.",
      "error",
    );
    return;
  }

  const sourceType = componentTypeOf(source);
  if (
    !sourceType ||
    !canContainComponent(componentTypeOf(parent), sourceType)
  ) {
    setCompositionStatus(
      `${sourceType ?? "Component"} cannot be moved to that insertion point.`,
      "error",
    );
    return;
  }

  const originalParent = source.parent();
  const originalIndex = source.index();
  const targetIndex =
    originalParent === parent && originalIndex < insertionAt
      ? insertionAt - 1
      : insertionAt;

  if (originalParent === parent && originalIndex === targetIndex) {
    setCompositionStatus("The component is already at that position.");
    return;
  }

  const stableId = String(source.get("cmsId"));
  source.move(parent, { at: targetIndex });
  if (String(source.get("cmsId")) !== stableId) {
    throw new Error(
      "Direct preview reordering changed the stable CMS identity.",
    );
  }

  lastDeletedCmsId = undefined;
  selectComponent(source);
  setCompositionStatus(`${componentTreeLabel(source)} moved.`, "success");
  refreshDocumentOutput();
}

function moveSelected(offset: -1 | 1): void {
  if (!activeComponent || activeComponent === wrapper) return;
  const parent = activeComponent.parent();
  if (!parent) return;

  const currentIndex = activeComponent.index();
  const targetIndex = currentIndex + offset;
  if (targetIndex < 0 || targetIndex >= componentChildren(parent).length)
    return;

  const stableId = activeCmsId();
  activeComponent.move(parent, { at: targetIndex });
  if (stableId && activeCmsId() !== stableId) {
    throw new Error("Moving a component changed its stable CMS identity.");
  }
  lastDeletedCmsId = undefined;
  selectComponent(activeComponent);
  setCompositionStatus(
    `Component moved ${offset < 0 ? "up" : "down"}. Its identity was preserved.`,
    "success",
  );
  refreshDocumentOutput();
}

function duplicateSelected(): void {
  if (!activeComponent || activeComponent === wrapper) return;
  const parent = activeComponent.parent();
  const sourceNode = editorComponentToNode(activeComponent);
  if (!parent || !sourceNode) return;

  const clone = cloneComponentNodeWithFreshIds(sourceNode);
  const componentDefinition = nodeToEditorComponent(clone);
  const insertionIndex = activeComponent.index() + 1;
  const canMove = editor.Components.canMove(
    parent,
    componentDefinition,
    insertionIndex,
  );
  if (!canMove.result) {
    setCompositionStatus(
      "The duplicate was rejected by the placement policy.",
      "error",
    );
    return;
  }

  const created = parent.append(componentDefinition, { at: insertionIndex })[0];
  if (!created) return;
  lastDeletedCmsId = undefined;
  selectComponent(created);
  setCompositionStatus(
    "Component duplicated with fresh identities for the entire copied subtree.",
    "success",
  );
  refreshDocumentOutput();
}

function deleteSelected(): void {
  if (!activeComponent || activeComponent === wrapper) return;
  const deleted = activeComponent;
  const parent = deleted.parent() ?? wrapper;
  const siblings = componentChildren(parent);
  const index = deleted.index();
  lastDeletedCmsId = activeCmsId();
  const fallback = siblings[index + 1] ?? siblings[index - 1] ?? parent;

  deleted.remove();
  selectComponent(fallback === deleted ? parent : fallback);
  setCompositionStatus(
    "Component deleted. Undo will restore its identity.",
    "success",
  );
  refreshDocumentOutput();
}

function restoreSelection(preferredId?: string): void {
  const preferred = preferredId ? findComponentByCmsId(preferredId) : undefined;
  selectComponent(preferred ?? componentChildren(wrapper).at(0) ?? wrapper);
  refreshDocumentOutput();
}

function previewNodeById(
  previewDocument: Document,
  id: string,
): HTMLElement | undefined {
  return [
    ...previewDocument.querySelectorAll<HTMLElement>("[data-astro-cms-node]"),
  ].find((element) => element.dataset.astroCmsNode === id);
}

function previewSlotForParent(
  previewDocument: Document,
  parent: Component,
): HTMLElement | undefined {
  if (parent === wrapper) {
    return (
      previewDocument.querySelector<HTMLElement>(
        "[data-astro-cms-document][data-astro-cms-slot]",
      ) ?? undefined
    );
  }

  const id = parent.get("cmsId");
  if (!id) return undefined;
  const previewNode = previewNodeById(previewDocument, String(id));
  if (!previewNode) return undefined;
  if (previewNode.matches("[data-astro-cms-slot]")) return previewNode;
  return (
    previewNode.querySelector<HTMLElement>("[data-astro-cms-slot]") ?? undefined
  );
}

function directInsertionAllowed(
  parent: Component,
  type: ComponentType,
  sourceId?: string,
): boolean {
  if (!canContainComponent(componentTypeOf(parent), type)) return false;
  if (!sourceId) return true;

  const source = findComponentByCmsId(sourceId);
  return Boolean(
    source && source !== parent && !componentContains(source, parent),
  );
}

function updateDirectInsertionZones(): void {
  const previewDocument = livePreviewFrame?.contentDocument;
  if (!previewDocument) return;

  const type = directPreviewDrag?.type ?? selectedComponentType();
  const sourceId = directPreviewDrag?.sourceId;
  previewDocument
    .querySelectorAll<HTMLButtonElement>("[data-cms-insert-parent]")
    .forEach((zone) => {
      const parentId = zone.dataset.cmsInsertParent;
      const parent = parentId ? parentForPreviewId(parentId) : undefined;
      const allowed = Boolean(
        parent && directInsertionAllowed(parent, type, sourceId),
      );
      const parentLabel =
        parent === wrapper ? "page" : parent ? componentTreeLabel(parent) : "";
      const verb = sourceId ? "Move" : "Add";

      zone.hidden = !allowed;
      zone.textContent = `+ ${verb} ${type} to ${parentLabel}`;
      zone.setAttribute(
        "aria-label",
        `${verb} ${type} at position ${Number(zone.dataset.cmsInsertAt) + 1} in ${parentLabel}`,
      );
    });
}

function clearDirectPreviewDrag(): void {
  directPreviewDrag = undefined;
  const previewDocument = livePreviewFrame?.contentDocument;
  previewDocument
    ?.querySelectorAll<HTMLElement>("[data-cms-drag-over]")
    .forEach((element) => element.removeAttribute("data-cms-drag-over"));
  updateDirectInsertionZones();
}

function createDirectInsertionZone(
  previewDocument: Document,
  parent: Component,
  at: number,
): HTMLButtonElement {
  const zone = previewDocument.createElement("button");
  zone.type = "button";
  zone.className = "astro-cms-direct-insertion";
  zone.dataset.cmsInsertParent =
    parent === wrapper ? PAGE_PARENT_ID : String(parent.get("cmsId"));
  zone.dataset.cmsInsertAt = String(at);

  zone.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const targetParent = parentForPreviewId(zone.dataset.cmsInsertParent ?? "");
    if (!targetParent) return;
    insertComponentAt(
      selectedComponentType(),
      { parent: targetParent, at },
      `position ${at + 1} in ${componentTreeLabel(targetParent)}`,
    );
  });

  zone.addEventListener("dragover", (event) => {
    if (zone.hidden) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = directPreviewDrag?.sourceId
        ? "move"
        : "copy";
    }
    zone.dataset.cmsDragOver = "";
  });

  zone.addEventListener("dragleave", () => {
    delete zone.dataset.cmsDragOver;
  });

  zone.addEventListener("drop", (event) => {
    event.preventDefault();
    event.stopPropagation();
    delete zone.dataset.cmsDragOver;

    const sourceId =
      event.dataTransfer?.getData(COMPONENT_DRAG_MIME) ??
      directPreviewDrag?.sourceId;
    if (sourceId) {
      moveComponentToInsertion(
        sourceId,
        zone.dataset.cmsInsertParent ?? "",
        at,
      );
      clearDirectPreviewDrag();
      return;
    }

    const droppedType =
      (event.dataTransfer?.getData(PALETTE_DRAG_MIME) as
        ComponentType | undefined) ?? directPreviewDrag?.type;
    const targetParent = parentForPreviewId(zone.dataset.cmsInsertParent ?? "");
    if (droppedType && droppedType in componentDefinitions && targetParent) {
      selectPaletteType(droppedType);
      insertComponentAt(
        droppedType,
        { parent: targetParent, at },
        `position ${at + 1} in ${componentTreeLabel(targetParent)}`,
      );
    }
    clearDirectPreviewDrag();
  });

  return zone;
}

function installDirectPreviewEditing(previewDocument: Document): void {
  const style = previewDocument.createElement("style");
  style.dataset.astroCmsDirectEditing = "";
  style.textContent = `
    [data-astro-cms-node] {
      cursor: grab;
    }

    [data-astro-cms-node]:active {
      cursor: grabbing;
    }

    .astro-cms-direct-insertion {
      box-sizing: border-box;
      display: block;
      width: calc(100% - 1rem);
      min-height: 1.65rem;
      margin: 0.35rem 0.5rem;
      padding: 0.15rem 0.5rem;
      border: 1px dashed #167253;
      border-radius: 999px;
      color: #134f3c;
      background: rgb(239 249 244 / 92%);
      cursor: copy;
      font: 700 0.68rem/1.2 Inter, ui-sans-serif, system-ui, sans-serif;
      letter-spacing: 0.02em;
      opacity: 0.72;
    }

    .astro-cms-direct-insertion:hover,
    .astro-cms-direct-insertion:focus-visible,
    .astro-cms-direct-insertion[data-cms-drag-over] {
      border-style: solid;
      color: #fff;
      background: #167253;
      opacity: 1;
      outline: 3px solid rgb(213 121 40 / 35%);
      outline-offset: 2px;
    }

    .astro-cms-direct-insertion[hidden] {
      display: none;
    }
  `;
  previewDocument.head.append(style);

  let pointerDrag:
    | {
        sourceId: string;
        type: ComponentType;
        pointerId: number;
        startX: number;
        startY: number;
        started: boolean;
        dropZone?: HTMLButtonElement;
      }
    | undefined;

  const clearPointerDropZone = (): void => {
    if (pointerDrag?.dropZone) {
      delete pointerDrag.dropZone.dataset.cmsDragOver;
      pointerDrag.dropZone = undefined;
    }
  };

  previewDocument.addEventListener(
    "pointermove",
    (event) => {
      if (!pointerDrag || event.pointerId !== pointerDrag.pointerId) return;

      const distance = Math.hypot(
        event.clientX - pointerDrag.startX,
        event.clientY - pointerDrag.startY,
      );
      if (!pointerDrag.started && distance < 6) return;

      if (!pointerDrag.started) {
        pointerDrag.started = true;
        directPreviewDrag = {
          type: pointerDrag.type,
          sourceId: pointerDrag.sourceId,
        };
        updateDirectInsertionZones();
        const component = findComponentByCmsId(pointerDrag.sourceId);
        if (component) {
          setCompositionStatus(
            `Dragging ${componentTreeLabel(component)} in the page preview…`,
          );
        }
      }

      event.preventDefault();
      clearPointerDropZone();
      const hit = previewDocument.elementFromPoint(
        event.clientX,
        event.clientY,
      );
      const zone = hit?.closest<HTMLButtonElement>("[data-cms-insert-parent]");
      if (zone && !zone.hidden) {
        pointerDrag.dropZone = zone;
        zone.dataset.cmsDragOver = "";
      }
    },
    true,
  );

  previewDocument.addEventListener(
    "pointerup",
    (event) => {
      if (!pointerDrag || event.pointerId !== pointerDrag.pointerId) return;
      const completedDrag = pointerDrag.started;
      const sourceId = pointerDrag.sourceId;
      const zone = pointerDrag.dropZone;

      clearPointerDropZone();
      pointerDrag = undefined;

      if (completedDrag && zone) {
        event.preventDefault();
        event.stopPropagation();
        suppressNextPreviewClick = true;
        moveComponentToInsertion(
          sourceId,
          zone.dataset.cmsInsertParent ?? "",
          Number(zone.dataset.cmsInsertAt),
        );
        setTimeout(() => {
          suppressNextPreviewClick = false;
        }, 0);
      } else if (completedDrag) {
        setCompositionStatus(
          "The component was not moved. Drop it on a visible insertion point.",
          "error",
        );
      }

      clearDirectPreviewDrag();
    },
    true,
  );

  const installParent = (parent: Component): void => {
    const slot = previewSlotForParent(previewDocument, parent);
    if (!slot) return;

    const children = componentChildren(parent);
    children.forEach((child, index) => {
      const childId = child.get("cmsId");
      const childElement = childId
        ? previewNodeById(previewDocument, String(childId))
        : undefined;
      const zone = createDirectInsertionZone(previewDocument, parent, index);
      if (childElement && childElement.parentElement === slot) {
        slot.insertBefore(zone, childElement);
      } else {
        slot.append(zone);
      }
    });
    slot.append(
      createDirectInsertionZone(previewDocument, parent, children.length),
    );

    children.forEach((child) => {
      const childType = componentTypeOf(child);
      if (childType && componentDefinitions[childType].acceptsChildren) {
        installParent(child);
      }
    });
  };

  installParent(wrapper);

  previewDocument
    .querySelectorAll<HTMLElement>("[data-astro-cms-node]")
    .forEach((previewNode) => {
      const cmsId = previewNode.dataset.astroCmsNode;
      const component = cmsId ? findComponentByCmsId(cmsId) : undefined;
      const type = component ? componentTypeOf(component) : null;
      if (!cmsId || !type || !component) return;
      const directComponent = component;

      previewNode.draggable = false;
      previewNode.setAttribute(
        "aria-label",
        `${componentTreeLabel(directComponent)}. Click to edit or drag to reorder.`,
      );
      if (previewNode.tabIndex < 0) previewNode.tabIndex = 0;
      previewNode.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        selectComponent(directComponent);
        setCompositionStatus(
          `${componentTreeLabel(directComponent)} selected from preview.`,
        );
      });
      previewNode.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        event.stopPropagation();
        pointerDrag = {
          sourceId: cmsId,
          type,
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          started: false,
        };
        previewNode.setPointerCapture?.(event.pointerId);
      });
    });

  updateDirectInsertionZones();
}

editor.on("update", refreshDocumentOutput);
editor.on("component:update", refreshDocumentOutput);
editor.on("trait:value", refreshDocumentOutput);
editor.on("block:drag:start", (block: Block) => {
  setCompositionStatus(`Dragging ${String(block.get("label"))}…`);
});
editor.on(
  "block:drag:stop",
  (component: Component | undefined, block: Block) => {
    const label = String(block.get("label"));
    if (!component) {
      setCompositionStatus(
        `${label} cannot be dropped there. The document was not changed.`,
        "error",
      );
      return;
    }

    selectComponent(component);
    setCompositionStatus(`${label} dropped.`, "success");
    refreshDocumentOutput();
  },
);
editor.on("component:drag:start", ({ target }: ComponentDragEventData) => {
  if (!target) return;
  const parent = target.parent();
  componentDragOrigin = {
    cmsId: target.get("cmsId") ? String(target.get("cmsId")) : undefined,
    parentId:
      parent === wrapper ? "page" : String(parent?.get("cmsId") ?? "unknown"),
    index: target.index(),
  };
  setCompositionStatus(`Moving ${componentTreeLabel(target)}…`);
});
editor.on(
  "component:drag:end",
  ({ target, parent, index }: ComponentDragEventData) => {
    if (!target) {
      componentDragOrigin = undefined;
      setCompositionStatus(
        "The component move did not complete. The document was not changed.",
        "error",
      );
      return;
    }

    const resolvedParent = parent ?? target.parent();
    const resolvedIndex = index ?? target.index();
    const cmsId = target.get("cmsId") ? String(target.get("cmsId")) : undefined;
    if (componentDragOrigin?.cmsId && cmsId !== componentDragOrigin.cmsId) {
      throw new Error("Dragging a component changed its stable CMS identity.");
    }

    const parentId =
      resolvedParent === wrapper
        ? "page"
        : String(resolvedParent?.get("cmsId") ?? "unknown");
    const moved =
      parentId !== componentDragOrigin?.parentId ||
      resolvedIndex !== componentDragOrigin?.index;

    selectComponent(target);
    setCompositionStatus(
      moved
        ? `${componentTreeLabel(target)} moved. Its identity was preserved.`
        : `${componentTreeLabel(target)} was not moved. The drop was rejected or made no change.`,
      moved ? "success" : "error",
    );
    componentDragOrigin = undefined;
    refreshDocumentOutput();
  },
);
editor.on("component:selected", (component: Component) => {
  activeComponent = component;
  renderCompositionTree();
  updateCompositionActions();
  syncLivePreviewSelection();
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
    ComponentType | undefined;

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
  const previewDocument = livePreviewFrame.contentDocument;
  const marker = previewDocument?.querySelector<HTMLElement>(
    '[data-astro-live-preview="server"]',
  );

  if (!marker || !previewDocument) {
    setLivePreviewStatus(
      "The preview loaded, but its editing controls are unavailable. Refresh the preview and try again.",
      "error",
    );
    return;
  }

  previewDocument.addEventListener("click", (event) => {
    if (suppressNextPreviewClick) {
      event.preventDefault();
      event.stopPropagation();
      suppressNextPreviewClick = false;
      return;
    }
    const target = event.target as HTMLElement | null;
    const previewNode = target?.closest?.<HTMLElement>("[data-astro-cms-node]");
    const cmsId = previewNode?.dataset.astroCmsNode;
    const component = cmsId ? findComponentByCmsId(cmsId) : undefined;
    if (!component) return;
    event.preventDefault();
    selectComponent(component);
    setCompositionStatus(
      `${componentTreeLabel(component)} selected from preview.`,
    );
  });

  installDirectPreviewEditing(previewDocument);
  syncLivePreviewSelection();
  setLivePreviewStatus("Preview updated.", "ready");
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

paletteButtons.forEach((button) => {
  const type = button.dataset.cmsPaletteType as ComponentType | undefined;
  if (!type || !(type in componentDefinitions)) return;

  button.addEventListener("click", () => {
    selectPaletteType(type);
    setCompositionStatus(
      `${type} selected. Choose a visible insertion point in the page preview or use Add.`,
    );
  });
  button.addEventListener("dragstart", (event) => {
    selectPaletteType(type);
    directPreviewDrag = { type };
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "copy";
      event.dataTransfer.setData(PALETTE_DRAG_MIME, type);
      event.dataTransfer.setData("text/plain", type);
    }
    setCompositionStatus(`Dragging ${type} into the page preview…`);
    updateDirectInsertionZones();
  });
  button.addEventListener("dragend", clearDirectPreviewDrag);
});

addComponentType?.addEventListener("change", () => {
  selectPaletteType(selectedComponentType());
});
addComponentButton?.addEventListener("click", () => {
  if (addComponentType) addComponent(addComponentType.value as ComponentType);
});
moveUpButton?.addEventListener("click", () => moveSelected(-1));
moveDownButton?.addEventListener("click", () => moveSelected(1));
duplicateButton?.addEventListener("click", duplicateSelected);
deleteButton?.addEventListener("click", deleteSelected);

document.querySelector("#undo-button")?.addEventListener("click", () => {
  const preferredId = lastDeletedCmsId ?? activeCmsId();
  editor.UndoManager.undo();
  setTimeout(() => restoreSelection(preferredId), 0);
});

document.querySelector("#redo-button")?.addEventListener("click", () => {
  const preferredId = activeCmsId();
  editor.UndoManager.redo();
  setTimeout(() => restoreSelection(preferredId), 0);
});

document.querySelector("#blank-button")?.addEventListener("click", () => {
  if (
    !window.confirm(
      "Start a new page? Unsaved changes in the editor will be discarded.",
    )
  ) {
    return;
  }
  wrapper.components([]);
  lastDeletedCmsId = undefined;
  selectComponent(wrapper);
  const rootLabel = Object.values(componentDefinitions).find(
    (definition) => definition.allowedAtRoot,
  )?.label;
  setCompositionStatus(
    `New page started.${rootLabel ? ` Add a ${rootLabel} to begin.` : ""}`,
    "success",
  );
  refreshDocumentOutput();
});

document.querySelector("#reset-button")?.addEventListener("click", () => {
  if (
    !window.confirm(
      "Restore the version from when this editor opened? Unsaved changes will be discarded.",
    )
  ) {
    return;
  }
  lastDeletedCmsId = undefined;
  replaceEditorContent(initialDocument.content);
  setCompositionStatus("Opening version restored.", "success");
});

saveProjectButton?.addEventListener("click", async () => {
  saveProjectButton.disabled = true;
  setSaveStatus("Saving changes…", "pending");

  try {
    const response = await fetch("/api/page-document", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ document: currentDocument() }),
    });
    const result = (await response.json()) as PageDocumentResponse;
    if (!response.ok || !result.ok || !result.document) {
      throw new Error(
        pageDocumentResponseMessage(result, "The project file was not saved."),
      );
    }

    setSaveStatus("Changes saved.", "success");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    setSaveStatus(`Save failed: ${message}`, "error");
  } finally {
    saveProjectButton.disabled = false;
  }
});

reloadProjectButton?.addEventListener("click", async () => {
  if (
    !window.confirm(
      "Reload the saved version? Unsaved changes in the editor will be discarded.",
    )
  ) {
    return;
  }
  reloadProjectButton.disabled = true;
  setSaveStatus("Loading the saved version…", "pending");

  try {
    const response = await fetch("/api/page-document", { cache: "no-store" });
    const result = (await response.json()) as PageDocumentResponse;
    if (!response.ok || !result.ok || !result.document) {
      throw new Error(
        pageDocumentResponseMessage(result, "The project file was not loaded."),
      );
    }

    const storedDocument = assertPageDocument(result.document);
    lastDeletedCmsId = undefined;
    replaceEditorContent(storedDocument.content);
    setCompositionStatus("Saved page reloaded.", "success");
    setSaveStatus("Saved version loaded.", "success");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    setSaveStatus(`Reload failed: ${message}`, "error");
  } finally {
    reloadProjectButton.disabled = false;
  }
});

publishProjectButton?.addEventListener("click", async () => {
  publishProjectButton.disabled = true;
  if (saveProjectButton) saveProjectButton.disabled = true;
  setSaveStatus("Checking the page and building it for publishing…", "pending");

  try {
    const response = await fetch("/api/publish", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ document: currentDocument() }),
    });
    const result = (await response.json()) as PageDocumentResponse;
    if (!response.ok || !result.ok || !result.document) {
      throw new Error(
        pageDocumentResponseMessage(result, "The production build failed."),
      );
    }

    setSaveStatus(
      result.message ??
        "Production build ready. Deployment is not connected in this pilot.",
      "success",
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    setSaveStatus(`Publish failed: ${message}`, "error");
  } finally {
    publishProjectButton.disabled = false;
    if (saveProjectButton) saveProjectButton.disabled = false;
  }
});

if (
  templateNameInput &&
  saveTemplateButton &&
  reusableTemplateList &&
  templateStatus
) {
  reusableTemplateControls = createReusableTemplateControls({
    nameInput: templateNameInput,
    saveButton: saveTemplateButton,
    list: reusableTemplateList,
    status: templateStatus,
    selectedNode: selectedComponentNode,
    insertTemplate: insertReusableTemplate,
  });
}

selectInitialComponent();
selectPaletteType(selectedComponentType());
refreshDocumentOutput();
