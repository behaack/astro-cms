import { beforeEach, describe, expect, it } from "vitest";

import homeDocumentJson from "../content/pages/home.json";
import {
  clearLivePreviewDrafts,
  getLivePreviewDraft,
  saveLivePreviewDraft,
} from "./live-preview-store";
import { assertPageDocument } from "./validation";

const originalDocument = assertPageDocument(homeDocumentJson);

describe("live preview store", () => {
  beforeEach(() => {
    clearLivePreviewDrafts();
  });

  it("stores a validated neutral document for server rendering", () => {
    const result = saveLivePreviewDraft(originalDocument, undefined, 1_000);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.draft.revision).toBe(1);
    expect(getLivePreviewDraft(result.draft.id, 1_001)?.document).toEqual(
      originalDocument,
    );
  });

  it("updates the same draft and advances its revision", () => {
    const first = saveLivePreviewDraft(originalDocument, undefined, 1_000);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const updatedDocument = structuredClone(originalDocument);
    updatedDocument.content[0].children![0].children![0].props.text =
      "Rendered live by Astro";

    const second = saveLivePreviewDraft(updatedDocument, first.draft.id, 2_000);

    expect(second.ok).toBe(true);
    if (!second.ok) return;

    expect(second.draft.id).toBe(first.draft.id);
    expect(second.draft.revision).toBe(2);
    expect(
      getLivePreviewDraft(second.draft.id, 2_001)?.document.content[0]
        .children![0].children![0].props.text,
    ).toBe("Rendered live by Astro");
  });

  it("rejects a structurally invalid document", () => {
    const invalidDocument = structuredClone(originalDocument);
    const heading = invalidDocument.content[0].children![0].children![0];
    heading.children = [
      {
        id: "illegal-child",
        type: "Text",
        props: { text: "Not allowed inside a heading" },
      },
    ];

    const result = saveLivePreviewDraft(invalidDocument);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((issue) => issue.message)).toContain(
      "Heading cannot contain child components.",
    );
  });
});
