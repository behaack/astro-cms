import { describe, expect, it } from "vitest";

import { componentDefinitions } from "./component-definitions";
import { componentManifest, componentTypeValues } from "astro-cms:manifest";

describe("component manifest", () => {
  it("derives every editor definition from the single manifest", () => {
    expect(Object.keys(componentDefinitions)).toEqual(componentTypeValues);
    expect(Object.keys(componentDefinitions)).toEqual(
      Object.keys(componentManifest),
    );
  });

  it("derives parent child relationships from the child registration", () => {
    expect(componentDefinitions.Callout.allowedParents).toEqual([
      "Section",
      "Stack",
    ]);
    expect(componentDefinitions.Section.allowedChildren).toContain("Callout");
    expect(componentDefinitions.Stack.allowedChildren).toContain("Callout");
    expect(componentDefinitions.Callout.allowedChildren).toEqual([]);
    expect(componentDefinitions.Image.properties.src.type).toBe("image");
  });
});
