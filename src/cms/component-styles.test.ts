import { describe, expect, it } from "vitest";
import home from "../../content/pages/home.json";
import {
  cleanStyles,
  cssIssue,
  localStylesCss,
  setDeclaration,
  styleImagePaths,
} from "./component-styles";
import { assertPageDocument } from "./validation";
import { serializePageDocument } from "./local-page-store";
import { assertReusableTemplate } from "./template-schema";
import { cloneComponentNodeWithFreshIds } from "./composition";
import { referencedPageImagePaths } from "./asset-references";

describe("component styles", () => {
  it("preserves styles and global stylesheet references through saving and templates", () => {
    const page = assertPageDocument(home);
    page.stylesheets = [
      "/styles/brand.css",
      "https://example.com/theme.css?v=2",
    ];
    const section = page.content[0];
    section.styles = {
      classes: ["campaign-panel"],
      tailwind: ["rounded-xl", "md:p-8"],
      css: "padding: 2rem;",
      phoneCss: "padding: 1rem;",
    };
    const saved = assertPageDocument(JSON.parse(serializePageDocument(page)));
    expect(saved.stylesheets).toEqual(page.stylesheets);
    expect(saved.content[0].styles).toEqual(section.styles);
    const template = assertReusableTemplate({
      schemaVersion: 1,
      id: "styled-section",
      name: "Styled section",
      root: section,
    });
    const copy = cloneComponentNodeWithFreshIds(template.root);
    expect(copy.id).not.toBe(section.id);
    expect(copy.styles).toEqual(section.styles);
    copy.styles!.classes!.push("another-class");
    expect(section.styles.classes).toEqual(["campaign-panel"]);
  });

  it("scopes overrides by node identity and outputs smaller sizes after larger ones", () => {
    const page = assertPageDocument(home);
    page.content[0].styles = {
      css: "padding: 4rem",
      tabletCss: "padding: 2rem",
      phoneCss: "padding: 1rem",
    };
    const css = localStylesCss(page.content);
    expect(css).toContain(`[data-cms-style="${page.content[0].id}"]`);
    expect(css.indexOf("padding:4rem")).toBeLessThan(
      css.indexOf("max-width: 1023px"),
    );
    expect(css.indexOf("max-width: 1023px")).toBeLessThan(
      css.indexOf("max-width: 639px"),
    );
    const copy = cloneComponentNodeWithFreshIds(page.content[0]);
    expect(localStylesCss([copy])).not.toContain(page.content[0].id);
  });

  it("rejects invalid declarations, selectors, imports, and unsafe resource URLs", () => {
    for (const source of [
      "font-size: bananas;",
      "body { color: red; }",
      "@import 'evil.css';",
      "color: red; } body {display:none}",
      "background: url(javascript:alert)",
      "background: url(\\6a avascript:alert)",
    ]) {
      expect(cssIssue(source), source).toBeTruthy();
    }
    expect(
      cssIssue(
        "--brand: #173c30; color: var(--brand); width: calc(100% - 2rem);",
      ),
    ).toBeUndefined();
    expect(
      cssIssue("background-image: url('/uploads/hero.png');"),
    ).toBeUndefined();
    expect(() =>
      assertPageDocument({ ...home, stylesheets: ["javascript:alert(1)"] }),
    ).toThrow();
  });

  it("keeps CSS image references in asset usage and publication discovery", () => {
    const page = assertPageDocument(home);
    page.content[0].styles = {
      css: "background-image: url('/uploads/banner.png');",
      tailwind: ["bg-[url('/uploads/texture.png')]"],
    };
    expect(styleImagePaths(page.content[0].styles)).toEqual(
      expect.arrayContaining(["/uploads/banner.png", "/uploads/texture.png"]),
    );
    expect(referencedPageImagePaths(page)).toEqual(
      expect.arrayContaining(["/uploads/banner.png", "/uploads/texture.png"]),
    );
  });

  it("updates one declaration while preserving other CSS, and removes empty overrides", () => {
    expect(
      setDeclaration("color: red; padding: 1rem;", "padding", "2rem"),
    ).toBe("color:red;\npadding: 2rem;");
    expect(
      cleanStyles({ css: " ", classes: [], tailwind: [] }),
    ).toBeUndefined();
  });
});
