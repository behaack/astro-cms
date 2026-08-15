import { describe, expect, it } from "vitest";

import homeDocumentJson from "../content/pages/home.json";
import { componentNodeSchema } from "./document-schema";
import { assertPageDocument, validatePageDocument } from "./validation";

describe("Astro-CMS page documents", () => {
  it("accepts the sample page", () => {
    expect(assertPageDocument(homeDocumentJson).route).toBe("/");
    expect(validatePageDocument(homeDocumentJson)).toEqual([]);
  });

  it("rejects children inside a leaf component", () => {
    const invalidNode = componentNodeSchema.parse({
      id: "heading-1",
      type: "Heading",
      props: { text: "Heading", level: 2 },
      children: [
        {
          id: "text-1",
          type: "Text",
          props: { text: "Not allowed" },
        },
      ],
    });

    const issues = validatePageDocument({
      schemaVersion: 1,
      route: "/invalid",
      title: "Invalid",
      content: [invalidNode],
    });

    expect(issues).toContainEqual({
      nodeId: "heading-1",
      message: "Heading cannot contain child components.",
    });
  });

  it("rejects duplicate node identifiers", () => {
    const issues = validatePageDocument({
      schemaVersion: 1,
      route: "/duplicate",
      title: "Duplicate",
      content: [
        { id: "same-id", type: "Text", props: { text: "One" } },
        { id: "same-id", type: "Text", props: { text: "Two" } },
      ],
    });

    expect(issues).toContainEqual({
      nodeId: "same-id",
      message: "Duplicate node id: same-id",
    });
  });
});
