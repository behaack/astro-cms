import { describe, expect, it } from "vitest";

import type { ComponentNode } from "./document-types";
import {
  referencedInternalPageRoutes,
  rewriteInternalPageRouteReferences,
} from "./page-references";

function sectionWithButtons(): ComponentNode[] {
  return [
    {
      id: "reference-section",
      type: "Section",
      props: { tone: "plain", width: "wide" },
      children: [
        {
          id: "exact-button",
          type: "Button",
          props: {
            label: "Exact",
            href: "/campaigns/summer",
            appearance: "primary",
          },
        },
        {
          id: "suffix-button",
          type: "Button",
          props: {
            label: "Suffix",
            href: "/campaigns/summer?source=home#details",
            appearance: "secondary",
          },
        },
        {
          id: "child-button",
          type: "Button",
          props: {
            label: "Child",
            href: "/campaigns/summer/archive",
            appearance: "secondary",
          },
        },
        {
          id: "external-button",
          type: "Button",
          props: {
            label: "External",
            href: "https://example.com/campaigns/summer",
            appearance: "secondary",
          },
        },
      ],
    },
  ];
}

describe("page reference rewriting", () => {
  it("rewrites only exact approved internal URL properties", () => {
    const original = sectionWithButtons();
    const result = rewriteInternalPageRouteReferences(
      original,
      "/campaigns/summer",
      "/campaigns/autumn",
    );
    const buttons = result.nodes[0].children!;

    expect(result.replacements).toBe(2);
    expect(buttons.map((button) => button.props.href)).toEqual([
      "/campaigns/autumn",
      "/campaigns/autumn?source=home#details",
      "/campaigns/summer/archive",
      "https://example.com/campaigns/summer",
    ]);
    expect(referencedInternalPageRoutes(result.nodes)).toEqual([
      "/campaigns/autumn",
      "/campaigns/summer/archive",
    ]);
    expect(original[0].children?.[0].props.href).toBe("/campaigns/summer");
  });
});
