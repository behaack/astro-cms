import { describe, expect, it } from "vitest";

import {
  canContainComponent,
  cloneComponentNodeWithFreshIds,
  createComponentNode,
} from "./composition";
import type { ComponentNode } from "./document-types";
import { validatePageDocument } from "./validation";

describe("safe page composition", () => {
  it("allows only sections at the page root", () => {
    expect(canContainComponent(null, "Section")).toBe(true);
    expect(canContainComponent(null, "Text")).toBe(false);
    expect(
      validatePageDocument({
        schemaVersion: 1,
        route: "/invalid-root",
        title: "Invalid root",
        content: [
          { id: "root-text", type: "Text", props: { text: "No section" } },
        ],
      }),
    ).toContainEqual({
      nodeId: "root-text",
      message: "Text is not allowed at the page root.",
    });
  });

  it("enforces the section, stack, and leaf hierarchy", () => {
    expect(canContainComponent("Section", "Stack")).toBe(true);
    expect(canContainComponent("Section", "Heading")).toBe(true);
    expect(canContainComponent("Section", "Section")).toBe(false);
    expect(canContainComponent("Stack", "Stack")).toBe(true);
    expect(canContainComponent("Stack", "Button")).toBe(true);
    expect(canContainComponent("Stack", "Section")).toBe(false);
    expect(canContainComponent("Heading", "Text")).toBe(false);
  });

  it("derives placement and defaults for a newly manifested component", () => {
    expect(canContainComponent(null, "Callout")).toBe(false);
    expect(canContainComponent("Section", "Callout")).toBe(true);
    expect(canContainComponent("Stack", "Callout")).toBe(true);
    expect(createComponentNode("Callout", () => "callout-new")).toEqual({
      id: "callout-new",
      type: "Callout",
      props: {
        text: "Highlight an important piece of information.",
        tone: "note",
      },
    });
  });

  it("creates components from registry defaults", () => {
    expect(createComponentNode("Button", () => "button-new")).toEqual({
      id: "button-new",
      type: "Button",
      props: {
        label: "Learn more",
        href: "/",
        appearance: "primary",
      },
    });
  });

  it("gives every node in a duplicated subtree a fresh identity", () => {
    const source: ComponentNode = {
      id: "stack-original",
      type: "Stack",
      props: { gap: "medium", align: "start" },
      children: [
        {
          id: "heading-original",
          type: "Heading",
          props: { text: "Original", level: 2 },
        },
        {
          id: "text-original",
          type: "Text",
          props: { text: "Supporting text" },
        },
      ],
    };
    let nextId = 0;

    const clone = cloneComponentNodeWithFreshIds(
      source,
      () => `clone-${++nextId}`,
    );

    expect(clone).toEqual({
      id: "clone-1",
      type: "Stack",
      props: { gap: "medium", align: "start" },
      children: [
        {
          id: "clone-2",
          type: "Heading",
          props: { text: "Original", level: 2 },
        },
        {
          id: "clone-3",
          type: "Text",
          props: { text: "Supporting text" },
        },
      ],
    });
    expect(clone).not.toBe(source);
    expect(clone.children?.[0]).not.toBe(source.children?.[0]);
  });
});
