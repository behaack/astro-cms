import { describe, expect, it } from "vitest";

import homeDocumentJson from "../../content/pages/home.json";
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

  it("accepts a manifested component without schema changes", () => {
    const document = {
      schemaVersion: 1 as const,
      route: "/callout",
      title: "Callout registration proof",
      content: [
        {
          id: "section-1",
          type: "Section" as const,
          props: { tone: "plain", width: "wide" },
          children: [
            {
              id: "callout-1",
              type: "Callout" as const,
              props: { text: "Manifest-driven", tone: "important" },
            },
          ],
        },
      ],
    };

    expect(assertPageDocument(document)).toEqual(document);
    expect(validatePageDocument(document)).toEqual([]);
  });

  it("rejects properties outside the developer contract", () => {
    const issues = validatePageDocument({
      schemaVersion: 1,
      route: "/unsafe-properties",
      title: "Unsafe properties",
      content: [
        {
          id: "section-unsafe",
          type: "Section",
          props: { tone: "neon", width: "wide", style: "display:none" },
          children: [
            {
              id: "button-unsafe",
              type: "Button",
              props: {
                label: "Unsafe",
                href: "javascript:alert(1)",
                appearance: "primary",
              },
            },
          ],
        },
      ],
    });

    expect(issues.map((issue) => issue.message)).toEqual(
      expect.arrayContaining([
        "Section.tone must use an approved option.",
        "Section.style is not an approved property.",
        "Button.href must be a safe relative, HTTP, HTTPS, mail, or telephone URL.",
      ]),
    );
  });

  it("preserves select value types", () => {
    const issues = validatePageDocument({
      schemaVersion: 1,
      route: "/wrong-property-type",
      title: "Wrong property type",
      content: [
        {
          id: "section-1",
          type: "Section",
          props: { tone: "plain", width: "wide" },
          children: [
            {
              id: "heading-1",
              type: "Heading",
              props: { text: "Heading", level: "1" },
            },
          ],
        },
      ],
    });

    expect(issues).toContainEqual({
      nodeId: "heading-1",
      message: "Heading.level must use an approved option.",
    });
  });

  it("requires accessible images and rejects non-image URL protocols", () => {
    const issues = validatePageDocument({
      schemaVersion: 1,
      route: "/unsafe-image",
      title: "Unsafe image",
      content: [
        {
          id: "section-image",
          type: "Section",
          props: { tone: "plain", width: "wide" },
          children: [
            {
              id: "image-unsafe",
              type: "Image",
              props: {
                src: "mailto:tracking@example.com",
                alt: "",
                aspect: "landscape",
              },
            },
          ],
        },
      ],
    });

    expect(issues.map((issue) => issue.message)).toEqual(
      expect.arrayContaining([
        "Image.src must be a safe relative, HTTP, or HTTPS image path.",
        "Image.alt is required.",
      ]),
    );
  });
});
