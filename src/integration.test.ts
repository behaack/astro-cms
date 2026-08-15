import { describe, expect, it } from "vitest";

import { shouldInjectEditorRoutes } from "./integration";

describe("Astro-CMS route injection", () => {
  it("keeps dev-only editor routes out of production builds", () => {
    expect(shouldInjectEditorRoutes("dev-only", "dev")).toBe(true);
    expect(shouldInjectEditorRoutes("dev-only", "sync")).toBe(true);
    expect(shouldInjectEditorRoutes("dev-only", "build")).toBe(false);
  });

  it("supports explicit always-on and disabled route modes", () => {
    expect(shouldInjectEditorRoutes(true, "build")).toBe(true);
    expect(shouldInjectEditorRoutes(false, "dev")).toBe(false);
    expect(shouldInjectEditorRoutes(undefined, "dev")).toBe(false);
  });
});
