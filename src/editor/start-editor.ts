import grapesjs, {
  type Block,
  type Component,
  type ComponentDragEventData,
  type Editor,
  type Plugin,
} from "grapesjs";

import { componentDefinitions } from "../cms/component-definitions";
import { traitFor } from "./property-traits";
import {
  STYLE_APPLY,
  STYLE_REQUEST,
  STYLE_SELECTION,
  STYLESHEETS_APPLY,
  TEXT_APPLY,
  TEXT_FOCUS,
  type PreviewTextSelection,
  type StyleApply,
  type TextApply,
} from "./style-events";
import { cleanStyles } from "../cms/component-styles";
import { normalizeTextFormats } from "../cms/text-formatting";
import {
  readFormattedText,
  readTextSelection,
  restoreTextSelection,
} from "./rich-text-dom";
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
  PageSeoMetadata,
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

export interface EditorDraft {
  document: PageDocument;
  savedDocumentSource: string;
  selectedId?: string;
}

export interface EditorSession {
  dispose(): EditorDraft;
}

declare global {
  interface Window {
    __astroCmsEditor?: Editor;
  }
}

let activeSession: EditorSession | undefined;
let hotDraft = import.meta.hot?.data.editorDraft as EditorDraft | undefined;
// A hot update must release the same resources as a React unmount.
import.meta.hot?.dispose((data) => {
  data.editorDraft = activeSession?.dispose();
});

export function startEditor(draft?: EditorDraft): EditorSession {
  const previousDraft = activeSession?.dispose();
  const events = new AbortController();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let disposedDraft: EditorDraft | undefined;
  const delay = (callback: () => void, milliseconds: number) => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      if (!events.signal.aborted) callback();
    }, milliseconds);
    timers.add(timer);
    return timer;
  };
  const cancelDelay = (timer: ReturnType<typeof setTimeout> | undefined) => {
    if (timer === undefined) return;
    clearTimeout(timer);
    timers.delete(timer);
  };

  const initialDocumentElement =
    document.querySelector<HTMLScriptElement>("#initial-document");

  if (!initialDocumentElement?.textContent) {
    throw new Error("The editor requires an initial Astro-CMS document.");
  }

  const initialDocument = assertPageDocument(
    JSON.parse(initialDocumentElement.textContent),
  );
  const candidate = draft ?? previousDraft ?? hotDraft;
  const restoredDraft =
    candidate?.document.route === initialDocument.route ? candidate : undefined;
  hotDraft = undefined;
  const openingDraft = restoredDraft?.document ?? initialDocument;

  interface EditorConfirmation {
    title: string;
    description: string;
    confirmLabel: string;
    note?: string;
    danger?: boolean;
    cancelLabel?: string | false;
  }

  async function confirmEditorAction(
    options: EditorConfirmation,
  ): Promise<boolean> {
    const dialog = document.querySelector<HTMLDialogElement>(
      "#editor-confirmation-dialog",
    );
    const heading = dialog?.querySelector("#editor-confirmation-heading");
    const description = dialog?.querySelector(
      "#editor-confirmation-description",
    );
    const note = dialog?.querySelector<HTMLElement>(
      "#editor-confirmation-note",
    );
    const confirmButton = dialog?.querySelector<HTMLButtonElement>(
      "#confirm-editor-action",
    );
    const cancelButton = dialog?.querySelector<HTMLButtonElement>(
      "#cancel-editor-action",
    );
    if (
      !dialog ||
      dialog.open ||
      !heading ||
      !description ||
      !note ||
      !confirmButton ||
      !cancelButton
    )
      return false;

    const trigger = document.activeElement;
    heading.textContent = options.title;
    description.textContent = options.description;
    note.textContent = options.note ?? "";
    note.hidden = !options.note;
    confirmButton.textContent = options.confirmLabel;
    confirmButton.toggleAttribute("data-danger", options.danger ?? false);
    cancelButton.hidden = options.cancelLabel === false;
    cancelButton.textContent = options.cancelLabel || "Cancel";
    dialog.returnValue = "";

    return new Promise((resolve) => {
      const cancel = () => resolve(false);
      events.signal.addEventListener("abort", cancel, { once: true });
      dialog.addEventListener(
        "close",
        () => {
          events.signal.removeEventListener("abort", cancel);
          const focusTarget =
            trigger instanceof HTMLElement &&
            trigger.isConnected &&
            trigger.getClientRects().length
              ? trigger
              : document.querySelector<HTMLButtonElement>(
                  "#toolbar-more-actions",
                );
          focusTarget?.focus();
          resolve(dialog.returnValue === "confirm");
        },
        { once: true, signal: events.signal },
      );
      dialog.showModal();
      (options.cancelLabel === false ? confirmButton : cancelButton).focus();
    });
  }

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
          traits: Object.entries(definition.properties)
            .filter(([, property]) => !property.formatting)
            .map(([name, property]) => traitFor(name, property)),
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

  const canvas = document.querySelector<HTMLElement>("#cms-canvas");
  // Dispose any legacy instance before attaching panels to this editor surface.
  [...grapesjs.editors].forEach((existing) => {
    if (existing.getContainer() === canvas) existing.destroy();
  });
  document.querySelector("#cms-properties")?.replaceChildren();
  document.querySelector("#cms-blocks-engine")?.replaceChildren();

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

  window.__astroCmsEditor = editor;

  const wrapper = editor.getWrapper()!;
  if (!wrapper) {
    throw new Error("The editor did not create a page wrapper.");
  }
  wrapper.set({
    cmsStylesheets: openingDraft.stylesheets ?? [],
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
  editor.addComponents(openingDraft.content.map(nodeToEditorComponent));

  const output = document.querySelector<HTMLElement>("#cms-document-output");
  const validation = document.querySelector<HTMLElement>("#cms-validation");
  const propertiesPanel =
    document.querySelector<HTMLElement>("#cms-properties");
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
  const templateStatus =
    document.querySelector<HTMLElement>("#template-status");
  const publishReviewDialog = document.querySelector<HTMLDialogElement>(
    "#publish-review-dialog",
  );
  const closePublishReviewButton = document.querySelector<HTMLButtonElement>(
    "#close-publish-review",
  );
  const confirmPublishButton =
    document.querySelector<HTMLButtonElement>("#confirm-publish");
  const publishChangeList = document.querySelector<HTMLUListElement>(
    "#publish-change-list",
  );
  const publishChangeDiff = document.querySelector<HTMLElement>(
    "#publish-change-diff",
  );
  const publishReviewStatus = document.querySelector<HTMLElement>(
    "#publish-review-status",
  );
  const pageSwitcher =
    document.querySelector<HTMLSelectElement>("#page-switcher");
  const openCreatePageButton =
    document.querySelector<HTMLButtonElement>("#open-create-page");
  const openRenamePageButton =
    document.querySelector<HTMLButtonElement>("#open-rename-page");
  const removePageButton =
    document.querySelector<HTMLButtonElement>("#remove-page");
  const createPageDialog = document.querySelector<HTMLDialogElement>(
    "#create-page-dialog",
  );
  const cancelCreatePageButton = document.querySelector<HTMLButtonElement>(
    "#cancel-create-page",
  );
  const confirmCreatePageButton = document.querySelector<HTMLButtonElement>(
    "#confirm-create-page",
  );
  const newPageTitleInput =
    document.querySelector<HTMLInputElement>("#new-page-title");
  const newPagePathInput =
    document.querySelector<HTMLInputElement>("#new-page-path");
  const newPageDescriptionInput = document.querySelector<HTMLTextAreaElement>(
    "#new-page-description",
  );
  const createPageStatus = document.querySelector<HTMLElement>(
    "#create-page-status",
  );
  const renamePageDialog = document.querySelector<HTMLDialogElement>(
    "#rename-page-dialog",
  );
  const cancelRenamePageButton = document.querySelector<HTMLButtonElement>(
    "#cancel-rename-page",
  );
  const confirmRenamePageButton = document.querySelector<HTMLButtonElement>(
    "#confirm-rename-page",
  );
  const renamedPagePathInput =
    document.querySelector<HTMLInputElement>("#renamed-page-path");
  const renamePageStatus = document.querySelector<HTMLElement>(
    "#rename-page-status",
  );
  const imageAssetTools =
    document.querySelector<HTMLElement>("#image-asset-tools");
  const activeImagePath =
    document.querySelector<HTMLElement>("#active-image-path");
  const openImageAssetsButton =
    document.querySelector<HTMLButtonElement>("#open-image-assets");
  const assetPickerDialog = document.querySelector<HTMLDialogElement>(
    "#asset-picker-dialog",
  );
  const closeAssetPickerButton = document.querySelector<HTMLButtonElement>(
    "#close-asset-picker",
  );
  const assetPickerList =
    document.querySelector<HTMLElement>("#asset-picker-list");
  const assetPickerStatus = document.querySelector<HTMLElement>(
    "#asset-picker-status",
  );
  const assetUploadForm =
    document.querySelector<HTMLFormElement>("#asset-upload-form");
  const assetUploadInput = document.querySelector<HTMLInputElement>(
    "#asset-upload-input",
  );
  const uploadImageButton =
    document.querySelector<HTMLButtonElement>("#upload-image");
  const openSeoSettingsButton =
    document.querySelector<HTMLButtonElement>("#open-seo-settings");
  const seoSettingsDialog = document.querySelector<HTMLDialogElement>(
    "#seo-settings-dialog",
  );
  const closeSeoSettingsButton = document.querySelector<HTMLButtonElement>(
    "#close-seo-settings",
  );
  const seoTitleInput = document.querySelector<HTMLInputElement>("#seo-title");
  const seoDescriptionInput =
    document.querySelector<HTMLTextAreaElement>("#seo-description");
  const seoSearchVisibilitySelect = document.querySelector<HTMLSelectElement>(
    "#seo-search-visibility",
  );
  const seoSocialImageInput =
    document.querySelector<HTMLInputElement>("#seo-social-image");
  const seoSocialImageAltInput = document.querySelector<HTMLTextAreaElement>(
    "#seo-social-image-alt",
  );
  const openSeoImageAssetsButton = document.querySelector<HTMLButtonElement>(
    "#open-seo-image-assets",
  );
  const clearSeoImageButton =
    document.querySelector<HTMLButtonElement>("#clear-seo-image");
  const seoTitleCount = document.querySelector<HTMLElement>("#seo-title-count");
  const seoDescriptionCount = document.querySelector<HTMLElement>(
    "#seo-description-count",
  );
  const seoSocialImageAltCount = document.querySelector<HTMLElement>(
    "#seo-social-image-alt-count",
  );
  const seoVisibilityHelp = document.querySelector<HTMLElement>(
    "#seo-visibility-help",
  );
  const seoSearchPreviewTitle = document.querySelector<HTMLElement>(
    "#seo-search-preview-title",
  );
  const seoSearchPreviewDescription = document.querySelector<HTMLElement>(
    "#seo-search-preview-description",
  );
  const seoSocialPreviewTitle = document.querySelector<HTMLElement>(
    "#seo-social-preview-title",
  );
  const seoSocialPreviewDescription = document.querySelector<HTMLElement>(
    "#seo-social-preview-description",
  );
  const seoSocialPreviewImage = document.querySelector<HTMLImageElement>(
    "#seo-social-preview-image",
  );

  let activeComponent: Component | null = null;
  let previewTextSelection: PreviewTextSelection | undefined;
  let restoringPreviewTextSelection = false;
  let lastDeletedCmsId: string | undefined;
  let livePreviewDraftId: string | undefined;
  let livePreviewTimer: ReturnType<typeof setTimeout> | undefined;
  let livePreviewRequest = 0;
  let reusableTemplateControls: ReusableTemplateControls | undefined;
  let activeChangeReview: ChangeReview | undefined;
  let reviewedDocument: PageDocument | undefined;
  let savedDocumentSource =
    restoredDraft?.savedDocumentSource ?? JSON.stringify(initialDocument);
  let activeImagePropertyName: string | undefined;
  let assetPickerTarget: "component" | "seo" | undefined;
  let currentSeoMetadata = openingDraft.seo
    ? structuredClone(openingDraft.seo)
    : undefined;

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

  interface ChangeReview {
    baseRevision: string;
    filePath: string;
    assetFiles: string[];
    hasChanges: boolean;
    changes: Array<{
      kind: "page" | "asset" | "added" | "removed" | "changed" | "moved";
      summary: string;
    }>;
    diff: string;
  }

  interface ChangeReviewResponse extends PageDocumentResponse {
    review?: ChangeReview;
  }

  interface PublishResponse extends PageDocumentResponse {
    commit?: string;
    shortCommit?: string;
    filePath?: string;
  }

  interface CreatePageResponse extends PageDocumentResponse {}

  interface PageRemovalResponse {
    ok: boolean;
    route?: string;
    title?: string;
    tracked?: boolean;
    commit?: string;
    shortCommit?: string;
    message?: string;
    usages?: Array<{
      kind: "page" | "template";
      id: string;
      label: string;
    }>;
  }

  interface PageRenameResponse {
    ok: boolean;
    fromRoute?: string;
    toRoute?: string;
    title?: string;
    tracked?: boolean;
    updatedLinks?: number;
    updatedDocuments?: number;
    commit?: string;
    shortCommit?: string;
    message?: string;
  }

  interface ImageAssetIdentity {
    publicPath: string;
    fileName: string;
    extension: string;
  }

  interface ImageAsset extends ImageAssetIdentity {
    managedUpload: boolean;
    usages: ImageUsage[];
  }

  interface ImageUsage {
    kind: "page" | "template" | "draft";
    id: string;
    label: string;
  }

  interface ImageAssetsResponse {
    ok: boolean;
    assets?: ImageAsset[];
    message?: string;
  }

  interface ImageUploadResponse {
    ok: boolean;
    asset?: ImageAssetIdentity;
    message?: string;
  }

  interface ImageRemovalResponse {
    ok: boolean;
    publicPath?: string;
    tracked?: boolean;
    commit?: string;
    shortCommit?: string;
    message?: string;
    usages?: ImageUsage[];
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

  function setPublishReviewStatus(
    message: string,
    state: "neutral" | "pending" | "success" | "error" = "neutral",
  ): void {
    if (!publishReviewStatus) return;
    publishReviewStatus.textContent = message;
    publishReviewStatus.dataset.state = state;
  }

  function setAssetPickerStatus(
    message: string,
    state: "neutral" | "success" | "error" = "neutral",
  ): void {
    if (!assetPickerStatus) return;
    assetPickerStatus.textContent = message;
    assetPickerStatus.dataset.state = state;
  }

  function seoMetadataFromControls(): PageSeoMetadata | undefined {
    const title = seoTitleInput?.value.trim() ?? "";
    const description = seoDescriptionInput?.value.trim() ?? "";
    const socialImage = seoSocialImageInput?.value.trim() ?? "";
    const socialImageAlt = seoSocialImageAltInput?.value.trim() ?? "";
    const searchVisibility = seoSearchVisibilitySelect?.value ?? "public";

    if (
      !title &&
      !description &&
      !socialImage &&
      !socialImageAlt &&
      searchVisibility === "public"
    ) {
      return undefined;
    }

    return {
      schemaVersion: 1,
      ...(title ? { title } : {}),
      ...(description ? { description } : {}),
      ...(socialImage ? { socialImage } : {}),
      ...(socialImageAlt ? { socialImageAlt } : {}),
      searchVisibility: searchVisibility as "public" | "noindex",
    };
  }

  function updateSeoPreview(): void {
    const searchTitle = seoTitleInput?.value.trim() || initialDocument.title;
    const searchDescription =
      seoDescriptionInput?.value.trim() ||
      initialDocument.description ||
      "No page description is set.";
    const socialImage = seoSocialImageInput?.value.trim() ?? "";
    const socialImageAlt = seoSocialImageAltInput?.value.trim() ?? "";
    const hiddenFromSearch = seoSearchVisibilitySelect?.value === "noindex";

    if (seoTitleCount) {
      seoTitleCount.textContent = `${seoTitleInput?.value.length ?? 0}/120`;
    }
    if (seoDescriptionCount) {
      seoDescriptionCount.textContent = `${seoDescriptionInput?.value.length ?? 0}/320`;
    }
    if (seoSocialImageAltCount) {
      seoSocialImageAltCount.textContent = `${seoSocialImageAltInput?.value.length ?? 0}/300`;
    }
    if (seoVisibilityHelp) {
      seoVisibilityHelp.textContent = hiddenFromSearch
        ? "This page asks search engines not to include it in results."
        : "Search engines may index this page.";
    }
    if (seoSearchPreviewTitle) seoSearchPreviewTitle.textContent = searchTitle;
    if (seoSocialPreviewTitle) seoSocialPreviewTitle.textContent = searchTitle;
    if (seoSearchPreviewDescription) {
      seoSearchPreviewDescription.textContent = searchDescription;
    }
    if (seoSocialPreviewDescription) {
      seoSocialPreviewDescription.textContent = searchDescription;
    }
    if (seoSocialImageAltInput) {
      seoSocialImageAltInput.disabled = !socialImage;
    }
    if (clearSeoImageButton) clearSeoImageButton.disabled = !socialImage;
    if (seoSocialPreviewImage) {
      seoSocialPreviewImage.hidden = !socialImage;
      seoSocialPreviewImage.alt = socialImageAlt;
      if (socialImage) {
        seoSocialPreviewImage.src = socialImage;
      } else {
        seoSocialPreviewImage.removeAttribute("src");
      }
    }
  }

  function setSeoMetadata(metadata: PageSeoMetadata | undefined): void {
    currentSeoMetadata = metadata ? structuredClone(metadata) : undefined;
    if (seoTitleInput) seoTitleInput.value = metadata?.title ?? "";
    if (seoDescriptionInput) {
      seoDescriptionInput.value = metadata?.description ?? "";
    }
    if (seoSearchVisibilitySelect) {
      seoSearchVisibilitySelect.value = metadata?.searchVisibility ?? "public";
    }
    if (seoSocialImageInput) {
      seoSocialImageInput.value = metadata?.socialImage ?? "";
    }
    if (seoSocialImageAltInput) {
      seoSocialImageAltInput.value = metadata?.socialImageAlt ?? "";
    }
    updateSeoPreview();
  }

  function synchronizeSeoControls(): void {
    currentSeoMetadata = seoMetadataFromControls();
    updateSeoPreview();
    refreshDocumentOutput();
  }

  setSeoMetadata(openingDraft.seo);

  function useImageAsset(asset: ImageAssetIdentity): void {
    if (assetPickerTarget === "seo") {
      if (!seoSocialImageInput) return;
      seoSocialImageInput.value = asset.publicPath;
      synchronizeSeoControls();
      setCompositionStatus(
        `${asset.fileName} selected as the social image.`,
        "success",
      );
      assetPickerTarget = undefined;
      assetPickerDialog?.close();
      return;
    }

    if (!activeComponent || !activeImagePropertyName) return;
    activeComponent.set(activeImagePropertyName, asset.publicPath);
    updateImageAssetTools();
    refreshDocumentOutput();
    setCompositionStatus(`${asset.fileName} selected.`, "success");
    assetPickerTarget = undefined;
    assetPickerDialog?.close();
  }

  function currentPageReferencesImage(publicPath: string): boolean {
    const visit = (node: ComponentNode): boolean => {
      const definition = componentDefinitions[node.type];
      const usesImage = Object.entries(definition.properties).some(
        ([propertyName, property]) =>
          property.type === "image" && node.props[propertyName] === publicPath,
      );
      return usesImage || Boolean(node.children?.some(visit));
    };
    const page = currentDocument();
    return page.seo?.socialImage === publicPath || page.content.some(visit);
  }

  async function removeImageAsset(
    asset: ImageAsset,
    button: HTMLButtonElement,
  ): Promise<void> {
    const confirmed = await confirmEditorAction({
      title: "Remove project image?",
      description: `Remove ${asset.fileName} from the project?`,
      note: "If it was already published, Astro-CMS will verify the production build and create an isolated Git commit.",
      confirmLabel: "Remove image",
      danger: true,
    });
    if (!confirmed) return;

    button.disabled = true;
    setAssetPickerStatus(`Checking and removing ${asset.fileName}…`);
    try {
      const response = await fetch("/api/assets", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          publicPath: asset.publicPath,
          document: currentDocument(),
        }),
      });
      const result = (await response.json()) as ImageRemovalResponse;
      if (events.signal.aborted) return;
      if (!response.ok || !result.ok) {
        throw new Error(result.message ?? "The image could not be removed.");
      }
      await loadImageAssets();
      const message = result.message ?? `${asset.fileName} removed.`;
      setAssetPickerStatus(message, "success");
      setCompositionStatus(message, "success");
    } catch (error) {
      if (events.signal.aborted) return;
      setAssetPickerStatus(
        error instanceof Error
          ? error.message
          : "The image could not be removed.",
        "error",
      );
      button.disabled = false;
    }
  }

  async function loadImageAssets(): Promise<void> {
    if (!assetPickerList) return;
    assetPickerList.replaceChildren();
    setAssetPickerStatus("Loading project images…");

    try {
      const response = await fetch("/api/assets", { cache: "no-store" });
      const result = (await response.json()) as ImageAssetsResponse;
      if (events.signal.aborted) return;
      if (!response.ok || !result.ok || !result.assets) {
        throw new Error(
          result.message ?? "Project images could not be loaded.",
        );
      }

      if (result.assets.length === 0) {
        setAssetPickerStatus(
          "No images were found in this website's public folder.",
        );
        return;
      }

      for (const asset of result.assets) {
        const card = document.createElement("article");
        card.className = "asset-picker-card";
        const chooseButton = document.createElement("button");
        chooseButton.type = "button";
        chooseButton.className = "asset-picker-card__choose";
        chooseButton.setAttribute("aria-label", `Use ${asset.fileName}`);

        const image = document.createElement("img");
        image.src = asset.publicPath;
        image.alt = "";
        image.loading = "lazy";

        const name = document.createElement("span");
        name.textContent = asset.fileName;
        const publicPath = document.createElement("code");
        publicPath.textContent = asset.publicPath;
        chooseButton.append(image, name, publicPath);
        chooseButton.addEventListener(
          "click",
          () => {
            useImageAsset(asset);
          },
          { signal: events.signal },
        );

        const usage = document.createElement("p");
        usage.className = "asset-picker-card__usage";
        const usedByCurrentPage = currentPageReferencesImage(asset.publicPath);
        const usageLabels = asset.usages.map((item) =>
          item.kind === "template"
            ? `template: ${item.label}`
            : `page: ${item.label}`,
        );
        if (
          usedByCurrentPage &&
          !asset.usages.some(
            (item) => item.kind === "page" && item.id === initialDocument.route,
          )
        ) {
          usageLabels.push("current page edit");
        }
        usage.textContent =
          usageLabels.length > 0
            ? `Used by ${usageLabels.join(", ")}`
            : asset.managedUpload
              ? "Not currently used"
              : "Developer-managed project image";
        card.append(chooseButton, usage);

        if (asset.managedUpload) {
          const removeButton = document.createElement("button");
          removeButton.type = "button";
          removeButton.className = "asset-picker-card__remove";
          removeButton.textContent = "Remove unused image";
          removeButton.disabled = usageLabels.length > 0;
          removeButton.title =
            usageLabels.length > 0
              ? "Remove this image from every page and template before deleting it."
              : "Remove this uploaded image from the project.";
          removeButton.addEventListener(
            "click",
            () => {
              void removeImageAsset(asset, removeButton);
            },
            { signal: events.signal },
          );
          card.append(removeButton);
        }
        assetPickerList.append(card);
      }
      setAssetPickerStatus(
        `${result.assets.length} project image${result.assets.length === 1 ? "" : "s"} available.`,
      );
    } catch (error) {
      if (events.signal.aborted) return;
      setAssetPickerStatus(
        error instanceof Error
          ? error.message
          : "Project images could not be loaded.",
        "error",
      );
    }
  }

  function showChangeReview(review: ChangeReview): void {
    if (!publishChangeList || !publishChangeDiff || !confirmPublishButton)
      return;
    publishChangeList.replaceChildren();
    if (review.changes.length === 0) {
      const item = document.createElement("li");
      item.textContent = "There are no unpublished page changes.";
      publishChangeList.append(item);
    } else {
      review.changes.forEach((change) => {
        const item = document.createElement("li");
        item.dataset.kind = change.kind;
        item.textContent = change.summary;
        publishChangeList.append(item);
      });
    }
    publishChangeDiff.textContent = review.diff || "No file changes.";
    confirmPublishButton.disabled = !review.hasChanges;
    setPublishReviewStatus(
      review.hasChanges
        ? `Ready to publish ${review.filePath}.`
        : "Everything on this page is already published to Git.",
      review.hasChanges ? "neutral" : "success",
    );
  }

  function hasUnsavedChanges(): boolean {
    return JSON.stringify(currentDocument()) !== savedDocumentSource;
  }

  function editorUrlForPage(route: string): string {
    const url = new URL("/admin", window.location.origin);
    url.searchParams.set("page", route);
    return `${url.pathname}${url.search}`;
  }

  function setCreatePageStatus(message: string, error = false): void {
    if (!createPageStatus) return;
    createPageStatus.textContent = message;
    createPageStatus.dataset.state = error ? "error" : "neutral";
  }

  function setRenamePageStatus(message: string, error = false): void {
    if (!renamePageStatus) return;
    renamePageStatus.textContent = message;
    renamePageStatus.dataset.state = error ? "error" : "neutral";
  }

  function setPageOperationControlsDisabled(disabled: boolean): void {
    if (pageSwitcher) pageSwitcher.disabled = disabled;
    if (openCreatePageButton) openCreatePageButton.disabled = disabled;
    if (openRenamePageButton) {
      openRenamePageButton.disabled = disabled || initialDocument.route === "/";
    }
    if (removePageButton) {
      removePageButton.disabled = disabled || initialDocument.route === "/";
    }
    if (saveProjectButton) saveProjectButton.disabled = disabled;
    if (publishProjectButton) publishProjectButton.disabled = disabled;
  }

  function suggestedPagePath(title: string): string {
    return title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
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

  function updateImageAssetTools(): void {
    activeImagePropertyName = undefined;
    if (!imageAssetTools || !activeComponent || activeComponent === wrapper) {
      if (imageAssetTools) imageAssetTools.hidden = true;
      return;
    }

    const componentType = componentTypeOf(activeComponent);
    const imageProperty = componentType
      ? Object.entries(componentDefinitions[componentType].properties).find(
          ([, property]) => property.type === "image",
        )
      : undefined;
    if (!imageProperty) {
      imageAssetTools.hidden = true;
      return;
    }

    activeImagePropertyName = imageProperty[0];
    imageAssetTools.hidden = false;
    if (activeImagePath) {
      activeImagePath.textContent = String(
        activeComponent.get(activeImagePropertyName) ?? "No image selected",
      );
    }
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
    if (String(component.get("cmsId")) !== previewTextSelection?.nodeId)
      previewTextSelection = undefined;
    activeComponent = component;
    editor.select(component);
    renderCompositionTree();
    updateCompositionActions();
    reusableTemplateControls?.refreshSelection();
    syncLivePreviewSelection();
    updateImageAssetTools();
    refreshStyleSelection();
  }

  function refreshStyleSelection(): void {
    if (events.signal.aborted) return;
    const selectedType = activeComponent && componentTypeOf(activeComponent);
    const textProperties = selectedType
      ? Object.entries(
          (componentDefinitions[selectedType] as ComponentDefinition)
            .properties,
        )
          .filter(
            ([, property]) => property.type === "text" && property.formatting,
          )
          .map(([name, property]) => ({
            name,
            label: property.label,
            text: String(activeComponent?.get(name) ?? ""),
          }))
      : [];
    const classes = new Set<string>();
    const visitRules = (rules: CSSRuleList): void => {
      for (const rule of rules) {
        if ("selectorText" in rule) {
          const selector = (rule as CSSStyleRule).selectorText;
          if (
            selector.includes("[data-astro-cid-") ||
            selector.includes("[data-astro-cms-page]") ||
            selector.includes("[data-cms-style") ||
            selector.includes("\\")
          )
            continue;
          for (const match of (rule as CSSStyleRule).selectorText.matchAll(
            /\.([a-zA-Z_][\w-]*)/g,
          )) {
            if (!match[1].startsWith("astro-")) classes.add(match[1]);
          }
        }
        if ("cssRules" in rule) visitRules((rule as CSSGroupingRule).cssRules);
      }
    };
    for (const sheet of livePreviewFrame?.contentDocument?.styleSheets ?? []) {
      try {
        visitRules(sheet.cssRules);
      } catch {
        /* Cross-origin sheets can still be used by class name. */
      }
    }
    window.dispatchEvent(
      new CustomEvent(STYLE_SELECTION, {
        detail: {
          nodeId:
            activeComponent && activeComponent !== wrapper
              ? activeCmsId()
              : undefined,
          label: activeComponent ? componentTreeLabel(activeComponent) : "Page",
          styles: activeComponent?.get("cmsStyles"),
          stylesheets: wrapper.get("cmsStylesheets") ?? [],
          availableClasses: [...classes].sort().slice(0, 300),
          textProperties,
          textSelection:
            previewTextSelection?.nodeId === activeCmsId()
              ? previewTextSelection
              : undefined,
        },
      }),
    );
  }

  function selectInitialComponent(): void {
    const restoredSelection = restoredDraft?.selectedId
      ? findComponentByCmsId(restoredDraft.selectedId)
      : undefined;
    if (restoredSelection) {
      selectComponent(restoredSelection);
      return;
    }
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
      button.setAttribute(
        "aria-selected",
        String(component === activeComponent),
      );
      button.style.setProperty("--tree-depth", String(depth));
      button.textContent = componentTreeLabel(component);
      button.addEventListener("click", () => selectComponent(component), {
        signal: events.signal,
      });
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
      moveDownButton.disabled =
        isPage || index < 0 || index >= siblingCount - 1;
    }
    if (duplicateButton) duplicateButton.disabled = isPage;
    if (deleteButton) deleteButton.disabled = isPage;
  }

  function currentDocument(): PageDocument {
    return editorRootToDocument(componentChildren(wrapper), {
      ...initialDocument,
      seo: currentSeoMetadata,
      stylesheets: wrapper.get("cmsStylesheets")?.length
        ? wrapper.get("cmsStylesheets")
        : undefined,
    });
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

  function previewTextElement(
    previewDocument: Document,
    selected: PreviewTextSelection,
  ): HTMLElement | undefined {
    return [
      ...previewDocument.querySelectorAll<HTMLElement>("[data-astro-cms-text]"),
    ].find(
      (element) =>
        element.dataset.astroCmsText === selected.name &&
        element.closest<HTMLElement>("[data-astro-cms-node]")?.dataset
          .astroCmsNode === selected.nodeId,
    );
  }

  function capturePreviewTextSelection(previewDocument: Document): void {
    if (
      restoringPreviewTextSelection ||
      previewDocument !== livePreviewFrame?.contentDocument
    )
      return;
    const selection = previewDocument.getSelection();
    if (!selection?.rangeCount || selection.isCollapsed) {
      if (previewTextSelection) {
        previewTextSelection = undefined;
        refreshStyleSelection();
      }
      return;
    }
    const range = selection.getRangeAt(0);
    const elementFor = (node: Node) =>
      (node.nodeType === 1
        ? (node as Element)
        : node.parentElement
      )?.closest<HTMLElement>("[data-astro-cms-text]");
    const target = elementFor(range.startContainer);
    if (!target || target !== elementFor(range.endContainer)) return;
    const nodeId = target.closest<HTMLElement>("[data-astro-cms-node]")?.dataset
      .astroCmsNode;
    const name = target.dataset.astroCmsText;
    const component = nodeId ? findComponentByCmsId(nodeId) : undefined;
    const type = component && componentTypeOf(component);
    const property =
      type && name
        ? (componentDefinitions[type] as ComponentDefinition).properties[name]
        : undefined;
    const text = component?.get(name ?? "");
    const offsets = readTextSelection(target);
    if (
      !component ||
      !nodeId ||
      !name ||
      !property?.formatting ||
      typeof text !== "string" ||
      !offsets ||
      offsets.end > text.length ||
      readFormattedText(target).text !== text
    )
      return;
    previewTextSelection = { nodeId, name, ...offsets };
    if (component !== activeComponent) selectComponent(component);
    else refreshStyleSelection();
    setCompositionStatus(
      "Words selected in the preview. Use the Content formatting buttons to style them.",
    );
  }

  function restorePreviewTextSelection(previewDocument: Document): void {
    if (!previewTextSelection || previewTextSelection.nodeId !== activeCmsId())
      return;
    const target = previewTextElement(previewDocument, previewTextSelection);
    if (!target) return;
    restoringPreviewTextSelection = true;
    if (target.tabIndex < 0) target.tabIndex = -1;
    if (document.activeElement === livePreviewFrame)
      target.focus({ preventScroll: true });
    restoreTextSelection(target, previewTextSelection);
    delay(() => {
      restoringPreviewTextSelection = false;
    }, 0);
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
      if (events.signal.aborted) return;

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
      if (events.signal.aborted) return;
      if (requestNumber !== livePreviewRequest) return;
      const message = error instanceof Error ? error.message : "Unknown error";
      setLivePreviewStatus(`Page preview failed: ${message}`, "error");
    }
  }

  function scheduleLivePreview(documentValue: PageDocument): void {
    cancelDelay(livePreviewTimer);
    livePreviewTimer = delay(() => {
      void renderLivePreview(documentValue);
    }, 250);
  }

  function refreshDocumentOutput(): void {
    if (events.signal.aborted) return;
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
    refreshStyleSelection();

    if (issues.length === 0) {
      scheduleLivePreview(documentValue);
    } else {
      cancelDelay(livePreviewTimer);
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
    setCompositionStatus(
      `${type} added at ${placementDescription}.`,
      "success",
    );
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
    return parentId === PAGE_PARENT_ID
      ? wrapper
      : findComponentByCmsId(parentId);
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

    const created = parent.append(componentDefinition, {
      at: insertionIndex,
    })[0];
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
    const preferred = preferredId
      ? findComponentByCmsId(preferredId)
      : undefined;
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
      previewNode.querySelector<HTMLElement>("[data-astro-cms-slot]") ??
      undefined
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
          parent === wrapper
            ? "page"
            : parent
              ? componentTreeLabel(parent)
              : "";
        const verb = sourceId ? "Move" : "Add";

        // The permanent page control handles adding sections. Positional root
        // guides are only needed while dragging a component.
        zone.hidden = !allowed || (parent === wrapper && !directPreviewDrag);
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

    zone.addEventListener(
      "click",
      (event) => {
        event.preventDefault();
        event.stopPropagation();
        const targetParent = parentForPreviewId(
          zone.dataset.cmsInsertParent ?? "",
        );
        if (!targetParent) return;
        insertComponentAt(
          selectedComponentType(),
          { parent: targetParent, at },
          `position ${at + 1} in ${componentTreeLabel(targetParent)}`,
        );
      },
      { signal: events.signal },
    );

    zone.addEventListener(
      "dragover",
      (event) => {
        if (zone.hidden) return;
        event.preventDefault();
        event.stopPropagation();
        if (event.dataTransfer) {
          event.dataTransfer.dropEffect = directPreviewDrag?.sourceId
            ? "move"
            : "copy";
        }
        zone.dataset.cmsDragOver = "";
      },
      { signal: events.signal },
    );

    zone.addEventListener(
      "dragleave",
      () => {
        delete zone.dataset.cmsDragOver;
      },
      { signal: events.signal },
    );

    zone.addEventListener(
      "drop",
      (event) => {
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
        const targetParent = parentForPreviewId(
          zone.dataset.cmsInsertParent ?? "",
        );
        if (
          droppedType &&
          droppedType in componentDefinitions &&
          targetParent
        ) {
          selectPaletteType(droppedType);
          insertComponentAt(
            droppedType,
            { parent: targetParent, at },
            `position ${at + 1} in ${componentTreeLabel(targetParent)}`,
          );
        }
        clearDirectPreviewDrag();
      },
      { signal: events.signal },
    );

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

    [data-astro-cms-text], [data-astro-cms-text] * {
      cursor: text;
      user-select: text;
      -webkit-user-select: text;
    }

    [data-astro-cms-text]::selection, [data-astro-cms-text] *::selection {
      color: #102d23;
      background: #cde8d9;
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
        const zone = hit?.closest<HTMLButtonElement>(
          "[data-cms-insert-parent]",
        );
        if (zone && !zone.hidden) {
          pointerDrag.dropZone = zone;
          zone.dataset.cmsDragOver = "";
        }
      },
      { capture: true, signal: events.signal },
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
          delay(() => {
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
      { capture: true, signal: events.signal },
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
    previewDocument.addEventListener(
      "selectionchange",
      () => capturePreviewTextSelection(previewDocument),
      { signal: events.signal },
    );

    previewDocument
      .querySelectorAll<HTMLElement>("[data-astro-cms-node]")
      .forEach((previewNode) => {
        const cmsId = previewNode.dataset.astroCmsNode;
        const component = cmsId ? findComponentByCmsId(cmsId) : undefined;
        const type = component ? componentTypeOf(component) : null;
        if (!cmsId || !type || !component) return;
        const directComponent = component;
        const textRegion = previewNode.matches("[data-astro-cms-text]")
          ? previewNode
          : previewNode.querySelector("[data-astro-cms-text]");
        if (textRegion)
          textRegion.setAttribute(
            "title",
            "Highlight words to format them. Hold Alt while dragging to reorder this component.",
          );

        previewNode.draggable = false;
        previewNode.setAttribute(
          "aria-label",
          `${componentTreeLabel(directComponent)}. Click to edit or drag to reorder.`,
        );
        if (previewNode.tabIndex < 0) previewNode.tabIndex = 0;
        previewNode.addEventListener(
          "keydown",
          (event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            selectComponent(directComponent);
            setCompositionStatus(
              `${componentTreeLabel(directComponent)} selected from preview.`,
            );
          },
          { signal: events.signal },
        );
        previewNode.addEventListener(
          "pointerdown",
          (event) => {
            if (event.button !== 0) return;
            event.stopPropagation();
            const textTarget = (event.target as Element | null)?.closest(
              "[data-astro-cms-text]",
            );
            if (textTarget && !event.altKey) {
              previewTextSelection = undefined;
              selectComponent(directComponent);
              return;
            }
            pointerDrag = {
              sourceId: cmsId,
              type,
              pointerId: event.pointerId,
              startX: event.clientX,
              startY: event.clientY,
              started: false,
            };
            previewNode.setPointerCapture?.(event.pointerId);
          },
          { signal: events.signal },
        );
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
      const cmsId = target.get("cmsId")
        ? String(target.get("cmsId"))
        : undefined;
      if (componentDragOrigin?.cmsId && cmsId !== componentDragOrigin.cmsId) {
        throw new Error(
          "Dragging a component changed its stable CMS identity.",
        );
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
    if (String(component.get("cmsId")) !== previewTextSelection?.nodeId)
      previewTextSelection = undefined;
    activeComponent = component;
    renderCompositionTree();
    updateCompositionActions();
    syncLivePreviewSelection();
    updateImageAssetTools();
    refreshStyleSelection();
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
    const propertyClass = [...(traitWrapper?.classList ?? [])].find(
      (className) => className.startsWith("gjs-trt-trait__wrp-"),
    );
    const propertyName = propertyClass?.replace("gjs-trt-trait__wrp-", "");
    const componentType = activeComponent?.get("cmsType") as
      ComponentType | undefined;

    if (!propertyName || !componentType || !activeComponent) return;

    const definition = componentDefinitions[
      componentType
    ] as ComponentDefinition;
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
    updateImageAssetTools();
    refreshDocumentOutput();
  }

  propertiesPanel?.addEventListener("input", synchronizePropertyControl, {
    signal: events.signal,
  });
  propertiesPanel?.addEventListener("change", synchronizePropertyControl, {
    signal: events.signal,
  });

  [seoTitleInput, seoDescriptionInput, seoSocialImageAltInput].forEach(
    (control) =>
      control?.addEventListener("input", synchronizeSeoControls, {
        signal: events.signal,
      }),
  );
  seoSearchVisibilitySelect?.addEventListener(
    "change",
    synchronizeSeoControls,
    { signal: events.signal },
  );
  openSeoSettingsButton?.addEventListener(
    "click",
    () => {
      updateSeoPreview();
      seoSettingsDialog?.showModal();
    },
    { signal: events.signal },
  );
  closeSeoSettingsButton?.addEventListener(
    "click",
    () => {
      seoSettingsDialog?.close();
    },
    { signal: events.signal },
  );
  openSeoImageAssetsButton?.addEventListener(
    "click",
    () => {
      assetPickerTarget = "seo";
      assetPickerDialog?.showModal();
      void loadImageAssets();
    },
    { signal: events.signal },
  );
  clearSeoImageButton?.addEventListener(
    "click",
    () => {
      if (seoSocialImageInput) seoSocialImageInput.value = "";
      if (seoSocialImageAltInput) seoSocialImageAltInput.value = "";
      synchronizeSeoControls();
      setCompositionStatus(
        "The social image was removed from this page draft.",
      );
    },
    { signal: events.signal },
  );

  livePreviewFrame?.addEventListener(
    "load",
    () => {
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

      // A document can report load again during development or preview updates.
      // Its insertion controls and editing listeners must only be installed once.
      if (
        previewDocument.querySelector("style[data-astro-cms-direct-editing]")
      ) {
        syncLivePreviewSelection();
        setLivePreviewStatus("Preview updated.", "ready");
        return;
      }

      previewDocument.addEventListener(
        "click",
        (event) => {
          if (suppressNextPreviewClick) {
            event.preventDefault();
            event.stopPropagation();
            suppressNextPreviewClick = false;
            return;
          }
          const target = event.target as HTMLElement | null;
          const previewNode = target?.closest?.<HTMLElement>(
            "[data-astro-cms-node]",
          );
          const cmsId = previewNode?.dataset.astroCmsNode;
          const component = cmsId ? findComponentByCmsId(cmsId) : undefined;
          if (!component) return;
          event.preventDefault();
          selectComponent(component);
          setCompositionStatus(
            `${componentTreeLabel(component)} selected from preview.`,
          );
        },
        { signal: events.signal },
      );

      installDirectPreviewEditing(previewDocument);
      refreshStyleSelection();
      syncLivePreviewSelection();
      restorePreviewTextSelection(previewDocument);
      setLivePreviewStatus("Preview updated.", "ready");
    },
    { signal: events.signal },
  );

  document.querySelector("#refresh-preview-button")?.addEventListener(
    "click",
    () => {
      cancelDelay(livePreviewTimer);
      void renderLivePreview(currentDocument());
    },
    { signal: events.signal },
  );

  let previewWidth =
    Number.parseInt(
      document.querySelector<HTMLButtonElement>(
        "[data-preview-width][data-active]",
      )?.dataset.previewWidth ?? "1280",
    ) || 1280;
  const fitPreviewViewport = (): void => {
    if (!livePreviewFrameShell || !livePreviewFrame) return;
    livePreviewFrameShell.style.maxWidth = `${previewWidth}px`;
    const scale = Math.min(1, livePreviewFrameShell.clientWidth / previewWidth);
    if (!scale) return;
    livePreviewFrame.style.width = `${previewWidth}px`;
    livePreviewFrame.style.height = "928px";
    livePreviewFrame.style.transform = `scale(${scale})`;
    livePreviewFrameShell.style.height = `${928 * scale + 2}px`;
    const sizeLabel = document.querySelector("#preview-viewport-size");
    if (sizeLabel)
      sizeLabel.textContent = `${previewWidth === 390 ? "Phone" : previewWidth === 768 ? "Tablet" : "Desktop"} · ${previewWidth}px · ${Math.round(scale * 100)}% zoom`;
  };
  const previewResizeObserver = new ResizeObserver(fitPreviewViewport);
  if (livePreviewFrameShell)
    previewResizeObserver.observe(livePreviewFrameShell);
  fitPreviewViewport();

  document
    .querySelectorAll<HTMLButtonElement>("[data-preview-width]")
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          if (!livePreviewFrameShell || !button.dataset.previewWidth) return;

          previewWidth = Number.parseInt(button.dataset.previewWidth) || 1280;
          fitPreviewViewport();
          document
            .querySelectorAll<HTMLButtonElement>("[data-preview-width]")
            .forEach((candidate) => {
              candidate.setAttribute(
                "aria-pressed",
                String(candidate === button),
              );
              if (candidate === button) {
                candidate.dataset.active = "";
              } else {
                delete candidate.dataset.active;
              }
            });
        },
        { signal: events.signal },
      );
    });

  paletteButtons.forEach((button) => {
    const type = button.dataset.cmsPaletteType as ComponentType | undefined;
    if (!type || !(type in componentDefinitions)) return;

    button.addEventListener(
      "click",
      () => {
        selectPaletteType(type);
        setCompositionStatus(
          type === addPageSectionButton?.dataset.cmsRootType
            ? `${componentDefinitions[type].label} selected. Use the Add ${componentDefinitions[type].label} to page button above the preview, or drag it into place.`
            : `${type} selected. Choose a visible insertion point in the page preview or use Add.`,
        );
      },
      { signal: events.signal },
    );
    button.addEventListener(
      "dragstart",
      (event) => {
        selectPaletteType(type);
        directPreviewDrag = { type };
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = "copy";
          event.dataTransfer.setData(PALETTE_DRAG_MIME, type);
          event.dataTransfer.setData("text/plain", type);
        }
        setCompositionStatus(`Dragging ${type} into the page preview…`);
        updateDirectInsertionZones();
      },
      { signal: events.signal },
    );
    button.addEventListener("dragend", clearDirectPreviewDrag, {
      signal: events.signal,
    });
  });

  addComponentType?.addEventListener(
    "change",
    () => {
      selectPaletteType(selectedComponentType());
    },
    { signal: events.signal },
  );
  addComponentButton?.addEventListener(
    "click",
    () => {
      if (addComponentType)
        addComponent(addComponentType.value as ComponentType);
    },
    { signal: events.signal },
  );

  const addPageSectionButton =
    document.querySelector<HTMLButtonElement>("#add-page-section");
  addPageSectionButton?.addEventListener(
    "click",
    () => {
      const type = addPageSectionButton.dataset.cmsRootType as
        ComponentType | undefined;
      if (!type || !canContainComponent(null, type)) return;
      insertComponentAt(
        type,
        { parent: wrapper, at: componentChildren(wrapper).length },
        "the end of the page",
      );
    },
    { signal: events.signal },
  );
  moveUpButton?.addEventListener("click", () => moveSelected(-1), {
    signal: events.signal,
  });
  moveDownButton?.addEventListener("click", () => moveSelected(1), {
    signal: events.signal,
  });
  duplicateButton?.addEventListener("click", duplicateSelected, {
    signal: events.signal,
  });
  deleteButton?.addEventListener("click", deleteSelected, {
    signal: events.signal,
  });

  document.querySelector("#undo-button")?.addEventListener(
    "click",
    () => {
      const preferredId = lastDeletedCmsId ?? activeCmsId();
      editor.UndoManager.undo();
      delay(() => restoreSelection(preferredId), 0);
    },
    { signal: events.signal },
  );

  document.querySelector("#redo-button")?.addEventListener(
    "click",
    () => {
      const preferredId = activeCmsId();
      editor.UndoManager.redo();
      delay(() => restoreSelection(preferredId), 0);
    },
    { signal: events.signal },
  );

  document.querySelector("#blank-button")?.addEventListener(
    "click",
    async () => {
      if (
        !(await confirmEditorAction({
          title: "Clear page content?",
          description:
            "Remove all content from this page. The page and its address will stay in place.",
          note: "Your saved page will stay unchanged until you save.",
          confirmLabel: "Clear page content",
          danger: true,
        }))
      )
        return;

      wrapper.components([]);
      lastDeletedCmsId = undefined;
      selectComponent(wrapper);
      const rootLabel = Object.values(componentDefinitions).find(
        (definition) => definition.allowedAtRoot,
      )?.label;
      setCompositionStatus(
        `Page content cleared.${rootLabel ? ` Add a ${rootLabel} to begin.` : ""}`,
        "success",
      );
      refreshDocumentOutput();
    },
    { signal: events.signal },
  );

  document.querySelector("#reset-button")?.addEventListener(
    "click",
    async () => {
      if (
        !(await confirmEditorAction({
          title: "Restore opening version?",
          description:
            "Restore the version from when this editor opened? Unsaved changes will be discarded.",
          confirmLabel: "Restore version",
          danger: true,
        }))
      ) {
        return;
      }
      lastDeletedCmsId = undefined;
      setSeoMetadata(initialDocument.seo);
      wrapper.set("cmsStylesheets", initialDocument.stylesheets ?? []);
      replaceEditorContent(initialDocument.content);
      setCompositionStatus("Opening version restored.", "success");
    },
    { signal: events.signal },
  );

  saveProjectButton?.addEventListener(
    "click",
    async () => {
      saveProjectButton.disabled = true;
      setSaveStatus("Saving changes…", "pending");

      try {
        const response = await fetch("/api/page-document", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ document: currentDocument() }),
        });
        const result = (await response.json()) as PageDocumentResponse;
        if (events.signal.aborted) return;
        if (!response.ok || !result.ok || !result.document) {
          throw new Error(
            pageDocumentResponseMessage(
              result,
              "The project file was not saved.",
            ),
          );
        }

        setSeoMetadata(result.document.seo);
        savedDocumentSource = JSON.stringify(result.document);
        setSaveStatus("Changes saved.", "success");
      } catch (error) {
        if (events.signal.aborted) return;
        const message =
          error instanceof Error ? error.message : "Unknown error";
        setSaveStatus(`Save failed: ${message}`, "error");
      } finally {
        if (!events.signal.aborted) {
          saveProjectButton.disabled = false;
        }
      }
    },
    { signal: events.signal },
  );

  reloadProjectButton?.addEventListener(
    "click",
    async () => {
      if (
        !(await confirmEditorAction({
          title: "Reload saved version?",
          description:
            "Reload the saved version? Unsaved changes in the editor will be discarded.",
          confirmLabel: "Reload version",
          danger: true,
        }))
      ) {
        return;
      }
      reloadProjectButton.disabled = true;
      setSaveStatus("Loading the saved version…", "pending");

      try {
        const pageUrl = new URL("/api/page-document", window.location.origin);
        pageUrl.searchParams.set("route", initialDocument.route);
        const response = await fetch(pageUrl, { cache: "no-store" });
        const result = (await response.json()) as PageDocumentResponse;
        if (events.signal.aborted) return;
        if (!response.ok || !result.ok || !result.document) {
          throw new Error(
            pageDocumentResponseMessage(
              result,
              "The project file was not loaded.",
            ),
          );
        }

        const storedDocument = assertPageDocument(result.document);
        savedDocumentSource = JSON.stringify(storedDocument);
        lastDeletedCmsId = undefined;
        setSeoMetadata(storedDocument.seo);
        wrapper.set("cmsStylesheets", storedDocument.stylesheets ?? []);
        replaceEditorContent(storedDocument.content);
        setCompositionStatus("Saved page reloaded.", "success");
        setSaveStatus("Saved version loaded.", "success");
      } catch (error) {
        if (events.signal.aborted) return;
        const message =
          error instanceof Error ? error.message : "Unknown error";
        setSaveStatus(`Reload failed: ${message}`, "error");
      } finally {
        if (!events.signal.aborted) {
          reloadProjectButton.disabled = false;
        }
      }
    },
    { signal: events.signal },
  );

  publishProjectButton?.addEventListener(
    "click",
    async () => {
      publishProjectButton.disabled = true;
      setSaveStatus("Preparing a Git change review…", "pending");

      try {
        reviewedDocument = currentDocument();
        const response = await fetch("/api/change-review", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ document: reviewedDocument }),
        });
        const result = (await response.json()) as ChangeReviewResponse;
        if (events.signal.aborted) return;
        if (!response.ok || !result.ok || !result.review) {
          throw new Error(
            pageDocumentResponseMessage(
              result,
              "The change review could not be created.",
            ),
          );
        }

        activeChangeReview = result.review;
        showChangeReview(result.review);
        publishReviewDialog?.showModal();
        setSaveStatus("Review the change before publishing.", "success");
      } catch (error) {
        if (events.signal.aborted) return;
        const message =
          error instanceof Error ? error.message : "Unknown error";
        setSaveStatus(`Review failed: ${message}`, "error");
      } finally {
        if (!events.signal.aborted) {
          publishProjectButton.disabled = false;
        }
      }
    },
    { signal: events.signal },
  );

  pageSwitcher?.addEventListener(
    "change",
    async () => {
      const nextRoute = pageSwitcher.value;
      if (nextRoute === initialDocument.route) return;
      if (
        hasUnsavedChanges() &&
        !(await confirmEditorAction({
          title: "Open another page?",
          description:
            "Unsaved changes on this page will be discarded when you open another page.",
          confirmLabel: "Open page",
        }))
      ) {
        pageSwitcher.value = initialDocument.route;
        return;
      }
      window.location.assign(editorUrlForPage(nextRoute));
    },
    { signal: events.signal },
  );

  openCreatePageButton?.addEventListener(
    "click",
    async () => {
      if (
        hasUnsavedChanges() &&
        !(await confirmEditorAction({
          title: "Create another page?",
          description:
            "Unsaved changes on this page will be discarded if you create another page.",
          confirmLabel: "Continue to create page",
        }))
      ) {
        return;
      }
      setCreatePageStatus("");
      createPageDialog?.showModal();
      newPageTitleInput?.focus();
    },
    { signal: events.signal },
  );

  openRenamePageButton?.addEventListener(
    "click",
    async () => {
      if (initialDocument.route === "/" || !renamedPagePathInput) return;
      if (
        hasUnsavedChanges() &&
        !(await confirmEditorAction({
          title: "Rename this page?",
          description:
            "Unsaved editor changes will be discarded after the rename.",
          confirmLabel: "Continue to rename",
        }))
      ) {
        return;
      }
      renamedPagePathInput.value = initialDocument.route.slice(1);
      setRenamePageStatus("");
      renamePageDialog?.showModal();
      renamedPagePathInput.focus();
      renamedPagePathInput.select();
    },
    { signal: events.signal },
  );

  cancelRenamePageButton?.addEventListener(
    "click",
    () => {
      renamePageDialog?.close();
    },
    { signal: events.signal },
  );

  confirmRenamePageButton?.addEventListener(
    "click",
    async () => {
      if (!renamedPagePathInput || !confirmRenamePageButton) return;
      const newRoute = `/${renamedPagePathInput.value
        .trim()
        .replace(/^\/+|\/+$/g, "")}`;
      if (newRoute === "/" || newRoute === initialDocument.route) {
        setRenamePageStatus("Enter a different non-home page path.", true);
        return;
      }

      confirmRenamePageButton.disabled = true;
      if (cancelRenamePageButton) cancelRenamePageButton.disabled = true;
      renamedPagePathInput.disabled = true;
      setPageOperationControlsDisabled(true);
      setRenamePageStatus("Updating saved links and verifying the site…");
      setSaveStatus(
        "Renaming the page and checking the production build…",
        "pending",
      );
      try {
        const response = await fetch("/api/pages", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            route: initialDocument.route,
            newRoute,
          }),
        });
        const result = (await response.json()) as PageRenameResponse;
        if (events.signal.aborted) return;
        if (!response.ok || !result.ok || !result.toRoute) {
          throw new Error(result.message ?? "The page could not be renamed.");
        }
        const message = result.message ?? `${initialDocument.title} renamed.`;
        setRenamePageStatus(message);
        setSaveStatus(message, "success");
        await confirmEditorAction({
          title: "Page renamed",
          description: message,
          confirmLabel: "Continue",
          cancelLabel: false,
        });
        if (events.signal.aborted) return;
        window.location.assign(editorUrlForPage(result.toRoute));
      } catch (error) {
        if (events.signal.aborted) return;
        const message =
          error instanceof Error
            ? error.message
            : "The page could not be renamed.";
        setRenamePageStatus(message, true);
        setSaveStatus(`Rename failed: ${message}`, "error");
        confirmRenamePageButton.disabled = false;
        if (cancelRenamePageButton) cancelRenamePageButton.disabled = false;
        renamedPagePathInput.disabled = false;
        setPageOperationControlsDisabled(false);
      }
    },
    { signal: events.signal },
  );

  removePageButton?.addEventListener(
    "click",
    async () => {
      if (initialDocument.route === "/") return;
      const unsavedNotice = hasUnsavedChanges()
        ? " Unsaved changes on this page will also be discarded."
        : "";
      if (
        !(await confirmEditorAction({
          title: "Remove this page?",
          description: `Remove ${initialDocument.title} (${initialDocument.route})? Astro-CMS will refuse if another page or reusable template links here.${unsavedNotice}`,
          confirmLabel: "Remove page",
          danger: true,
        }))
      ) {
        return;
      }

      setPageOperationControlsDisabled(true);
      setSaveStatus("Checking links and removing the page…", "pending");
      try {
        const response = await fetch("/api/pages", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ route: initialDocument.route }),
        });
        const result = (await response.json()) as PageRemovalResponse;
        if (events.signal.aborted) return;
        if (!response.ok || !result.ok) {
          throw new Error(result.message ?? "The page could not be removed.");
        }
        const message = result.message ?? `${initialDocument.title} removed.`;
        setSaveStatus(message, "success");
        await confirmEditorAction({
          title: "Page removed",
          description: message,
          confirmLabel: "Continue",
          cancelLabel: false,
        });
        if (events.signal.aborted) return;
        window.location.assign(editorUrlForPage("/"));
      } catch (error) {
        if (events.signal.aborted) return;
        const message =
          error instanceof Error
            ? error.message
            : "The page could not be removed.";
        setSaveStatus(`Removal failed: ${message}`, "error");
        setPageOperationControlsDisabled(false);
      }
    },
    { signal: events.signal },
  );

  cancelCreatePageButton?.addEventListener(
    "click",
    () => {
      createPageDialog?.close();
    },
    { signal: events.signal },
  );

  newPageTitleInput?.addEventListener(
    "input",
    () => {
      if (!newPagePathInput || newPagePathInput.dataset.edited === "true")
        return;
      newPagePathInput.value = suggestedPagePath(newPageTitleInput.value);
    },
    { signal: events.signal },
  );

  newPagePathInput?.addEventListener(
    "input",
    () => {
      newPagePathInput.dataset.edited = String(
        newPagePathInput.value.length > 0,
      );
    },
    { signal: events.signal },
  );

  confirmCreatePageButton?.addEventListener(
    "click",
    async () => {
      if (!newPageTitleInput || !newPagePathInput) return;
      const title = newPageTitleInput.value.trim();
      const route = `/${newPagePathInput.value.trim().replace(/^\/+|\/+$/g, "")}`;
      if (!title || route === "/") {
        setCreatePageStatus("Enter a page title and path.", true);
        return;
      }
      confirmCreatePageButton.disabled = true;
      if (cancelCreatePageButton) cancelCreatePageButton.disabled = true;
      setCreatePageStatus("Creating the page…");

      try {
        const response = await fetch("/api/pages", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            route,
            title,
            description: newPageDescriptionInput?.value.trim() ?? "",
          }),
        });
        const result = (await response.json()) as CreatePageResponse;
        if (events.signal.aborted) return;
        if (!response.ok || !result.ok || !result.document) {
          throw new Error(
            pageDocumentResponseMessage(
              result,
              "The page could not be created.",
            ),
          );
        }
        setCreatePageStatus("Page created.");
        createPageDialog?.close();
        window.location.assign(editorUrlForPage(result.document.route));
      } catch (error) {
        if (events.signal.aborted) return;
        const message =
          error instanceof Error ? error.message : "Unknown error";
        setCreatePageStatus(message, true);
        confirmCreatePageButton.disabled = false;
        if (cancelCreatePageButton) cancelCreatePageButton.disabled = false;
      }
    },
    { signal: events.signal },
  );

  openImageAssetsButton?.addEventListener(
    "click",
    () => {
      if (!activeImagePropertyName) return;
      assetPickerTarget = "component";
      assetPickerDialog?.showModal();
      void loadImageAssets();
    },
    { signal: events.signal },
  );

  closeAssetPickerButton?.addEventListener(
    "click",
    () => {
      assetPickerTarget = undefined;
      assetPickerDialog?.close();
    },
    { signal: events.signal },
  );

  assetUploadForm?.addEventListener(
    "submit",
    async (event) => {
      event.preventDefault();
      const file = assetUploadInput?.files?.[0];
      if (!file) {
        setAssetPickerStatus("Choose an image to upload.", "error");
        return;
      }

      if (uploadImageButton) uploadImageButton.disabled = true;
      if (assetUploadInput) assetUploadInput.disabled = true;
      setAssetPickerStatus(`Uploading ${file.name}…`);
      try {
        const formData = new FormData();
        formData.append("file", file);
        const response = await fetch("/api/assets", {
          method: "POST",
          body: formData,
        });
        const result = (await response.json()) as ImageUploadResponse;
        if (events.signal.aborted) return;
        if (!response.ok || !result.ok || !result.asset) {
          throw new Error(result.message ?? "The image could not be uploaded.");
        }
        assetUploadForm.reset();
        setAssetPickerStatus(`${result.asset.fileName} uploaded.`, "success");
        useImageAsset(result.asset);
      } catch (error) {
        if (events.signal.aborted) return;
        setAssetPickerStatus(
          error instanceof Error
            ? error.message
            : "The image could not be uploaded.",
          "error",
        );
      } finally {
        if (!events.signal.aborted) {
          if (uploadImageButton) uploadImageButton.disabled = false;
          if (assetUploadInput) assetUploadInput.disabled = false;
        }
      }
    },
    { signal: events.signal },
  );

  closePublishReviewButton?.addEventListener(
    "click",
    () => {
      publishReviewDialog?.close();
    },
    { signal: events.signal },
  );

  confirmPublishButton?.addEventListener(
    "click",
    async () => {
      if (!activeChangeReview || !reviewedDocument) return;
      confirmPublishButton.disabled = true;
      if (closePublishReviewButton) closePublishReviewButton.disabled = true;
      if (saveProjectButton) saveProjectButton.disabled = true;
      if (publishProjectButton) publishProjectButton.disabled = true;
      setPublishReviewStatus(
        "Building the site and creating an isolated Git commit…",
        "pending",
      );

      try {
        const response = await fetch("/api/publish", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            document: reviewedDocument,
            baseRevision: activeChangeReview.baseRevision,
          }),
        });
        const result = (await response.json()) as PublishResponse;
        if (events.signal.aborted) return;
        if (
          !response.ok ||
          !result.ok ||
          !result.document ||
          !result.shortCommit
        ) {
          throw new Error(
            pageDocumentResponseMessage(result, "The Git publish failed."),
          );
        }

        setPublishReviewStatus(
          `Published as Git commit ${result.shortCommit}.`,
          "success",
        );
        setSaveStatus(
          result.message ?? `Published as Git commit ${result.shortCommit}.`,
          "success",
        );
        setSeoMetadata(result.document.seo);
        savedDocumentSource = JSON.stringify(result.document);
        activeChangeReview = undefined;
        reviewedDocument = undefined;
        delay(() => publishReviewDialog?.close(), 700);
      } catch (error) {
        if (events.signal.aborted) return;
        const message =
          error instanceof Error ? error.message : "Unknown error";
        setPublishReviewStatus(`Publish failed: ${message}`, "error");
        setSaveStatus(`Publish failed: ${message}`, "error");
        confirmPublishButton.disabled = false;
      } finally {
        if (!events.signal.aborted) {
          if (closePublishReviewButton)
            closePublishReviewButton.disabled = false;
          if (saveProjectButton) saveProjectButton.disabled = false;
          if (publishProjectButton) publishProjectButton.disabled = false;
        }
      }
    },
    { signal: events.signal },
  );

  if (
    templateNameInput &&
    saveTemplateButton &&
    reusableTemplateList &&
    templateStatus
  ) {
    reusableTemplateControls = createReusableTemplateControls({
      signal: events.signal,
      nameInput: templateNameInput,
      saveButton: saveTemplateButton,
      list: reusableTemplateList,
      status: templateStatus,
      selectedNode: selectedComponentNode,
      insertTemplate: insertReusableTemplate,
    });
  }

  window.addEventListener(STYLE_REQUEST, refreshStyleSelection, {
    signal: events.signal,
  });
  window.addEventListener(
    TEXT_FOCUS,
    () => {
      previewTextSelection = undefined;
      refreshStyleSelection();
    },
    { signal: events.signal },
  );
  window.addEventListener(
    TEXT_APPLY,
    (event) => {
      const detail = (event as CustomEvent<TextApply>).detail;
      if (detail.nodeId !== activeCmsId() || !activeComponent) return;
      const type = componentTypeOf(activeComponent);
      const property = type
        ? (componentDefinitions[type] as ComponentDefinition).properties[
            detail.name
          ]
        : undefined;
      if (
        !property?.formatting ||
        property.type !== "text" ||
        typeof detail.text !== "string"
      )
        return;
      const styles = activeComponent.get("cmsStyles");
      previewTextSelection =
        detail.previewSelection?.nodeId === detail.nodeId
          ? detail.previewSelection
          : undefined;
      const nextStyles = cleanStyles({
        ...styles,
        text: {
          ...styles?.text,
          [detail.name]: normalizeTextFormats(
            detail.text.length,
            detail.formats,
          ),
        },
      });
      if (
        activeComponent.get(detail.name) === detail.text &&
        JSON.stringify(styles) === JSON.stringify(nextStyles)
      )
        return;
      activeComponent.set({
        [detail.name]: detail.text,
        cmsStyles: nextStyles,
      });
      refreshDocumentOutput();
    },
    { signal: events.signal },
  );
  window.addEventListener(
    STYLE_APPLY,
    (event) => {
      const detail = (event as CustomEvent<StyleApply>).detail;
      if (
        detail.nodeId !== activeCmsId() ||
        !activeComponent ||
        activeComponent === wrapper
      )
        return;
      if (
        JSON.stringify(activeComponent.get("cmsStyles")) ===
        JSON.stringify(detail.styles)
      )
        return;
      activeComponent.set(
        "cmsStyles",
        detail.styles ? structuredClone(detail.styles) : undefined,
      );
      refreshDocumentOutput();
    },
    { signal: events.signal },
  );
  window.addEventListener(
    STYLESHEETS_APPLY,
    (event) => {
      wrapper.set("cmsStylesheets", [
        ...(event as CustomEvent<string[]>).detail,
      ]);
      refreshDocumentOutput();
    },
    { signal: events.signal },
  );

  selectInitialComponent();
  selectPaletteType(selectedComponentType());
  refreshDocumentOutput();

  const session: EditorSession = {
    dispose() {
      if (disposedDraft) return disposedDraft;
      disposedDraft = {
        document: currentDocument(),
        savedDocumentSource,
        selectedId: activeCmsId(),
      };
      // Resolve an open confirmation as cancelled before removing its listener.
      const confirmation = document.querySelector<HTMLDialogElement>(
        "#editor-confirmation-dialog",
      );
      if (confirmation?.open) confirmation.close("cancel");
      events.abort();
      previewResizeObserver.disconnect();
      livePreviewRequest++;
      timers.forEach(clearTimeout);
      timers.clear();
      const previewDocument = livePreviewFrame?.contentDocument;
      previewDocument
        ?.querySelectorAll(
          "style[data-astro-cms-direct-editing], [data-cms-insert-parent]",
        )
        .forEach((node) => node.remove());
      editor.destroy();
      propertiesPanel?.replaceChildren();
      document.querySelector("#cms-blocks-engine")?.replaceChildren();
      if (window.__astroCmsEditor === editor) delete window.__astroCmsEditor;
      if (activeSession === session) activeSession = undefined;
      return disposedDraft;
    },
  };
  activeSession = session;
  return session;
}
