import {
  generate,
  lexer,
  parse,
  walk,
  type CssNode,
  type Declaration,
} from "css-tree";
import type { ComponentNode, ComponentStyles } from "./document-types";

export const styleScopes = ["css", "tabletCss", "phoneCss"] as const;
export type StyleScope = (typeof styleScopes)[number];

export function splitClasses(source: string): string[] {
  return [...new Set(source.trim().split(/\s+/).filter(Boolean))];
}

export function isSafeStyleUrl(value: string): boolean {
  if (value.startsWith("#")) return true;
  if (value.startsWith("/") && !value.startsWith("//") && !value.includes("\\"))
    return true;
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

export function isStylesheetUrl(value: string): boolean {
  return (
    isSafeStyleUrl(value) &&
    !value.startsWith("#") &&
    /\.css(?:[?#]|$)/i.test(value)
  );
}

export function parseDeclarations(source: string): Declaration[] {
  const ast = parse(source, {
    context: "declarationList",
    parseCustomProperty: true,
    onParseError(error) {
      throw error;
    },
  });
  if (ast.type !== "DeclarationList")
    throw new Error("Enter CSS declarations such as color: red;");
  return ast.children.toArray().map((node) => {
    if (node.type !== "Declaration")
      throw new Error("Use declarations only, without selectors or @rules.");
    return node;
  });
}

export function validateStyleUrls(ast: CssNode): void {
  walk(ast, (node) => {
    if (node.type === "Url" && !isSafeStyleUrl(node.value)) {
      throw new Error("CSS image URLs must use a site path, HTTP, or HTTPS.");
    }
  });
}

export function cssIssue(source: string): string | undefined {
  if (!source.trim()) return undefined;
  try {
    for (const declaration of parseDeclarations(source)) {
      validateStyleUrls(declaration);
      let variable = false;
      walk(declaration.value, (node) => {
        if (
          node.type === "Function" &&
          ["var", "env"].includes(node.name.toLowerCase())
        )
          variable = true;
      });
      if (!declaration.property.startsWith("--") && !variable) {
        const result = lexer.matchProperty(
          declaration.property,
          declaration.value,
        );
        if (result.error) return `Check the value for ${declaration.property}.`;
      }
    }
  } catch (error) {
    return error instanceof Error ? error.message : "Check the CSS syntax.";
  }
  return undefined;
}

export function declarationValue(source: string, property: string): string {
  try {
    const declaration = parseDeclarations(source)
      .filter((item) => item.property === property)
      .at(-1);
    return declaration ? generate(declaration.value) : "";
  } catch {
    return "";
  }
}

export function setDeclaration(
  source: string,
  property: string,
  value: string,
): string {
  const declarations = parseDeclarations(source).filter(
    (item) => item.property !== property,
  );
  const lines = declarations.map((item) => `${generate(item)};`);
  if (value.trim()) lines.push(`${property}: ${value.trim()};`);
  return lines.join("\n");
}

export function cleanStyles(
  styles: ComponentStyles,
): ComponentStyles | undefined {
  const result: ComponentStyles = {};
  for (const field of ["classes", "tailwind"] as const) {
    if (styles[field]?.length) result[field] = [...new Set(styles[field])];
  }
  for (const scope of styleScopes) {
    if (styles[scope]?.trim()) result[scope] = styles[scope]!.trim();
  }
  const text = Object.fromEntries(
    Object.entries(styles.text ?? {}).filter(([, ranges]) => ranges.length),
  );
  if (Object.keys(text).length) result.text = structuredClone(text);
  return Object.keys(result).length ? result : undefined;
}

export function localStylesCss(nodes: ComponentNode[]): string {
  const rules: string[] = [];
  const visit = (node: ComponentNode) => {
    const selector = `[data-astro-cms-page] [data-cms-style=${JSON.stringify(node.id)}][data-cms-style]`;
    for (const scope of styleScopes) {
      const source = node.styles?.[scope];
      if (!source?.trim()) continue;
      const issue = cssIssue(source);
      if (issue) throw new Error(issue);
      const rule = `${selector}{${parseDeclarations(source)
        .map((declaration) => generate(declaration))
        .join(";")}}`;
      rules.push(
        scope === "css"
          ? rule
          : `@media (max-width: ${scope === "tabletCss" ? "1023" : "639"}px){${rule}}`,
      );
    }
    node.children?.forEach(visit);
  };
  nodes.forEach(visit);
  return rules.join("\n");
}

export function styleImagePaths(styles?: ComponentStyles): string[] {
  const paths = new Set<string>();
  for (const scope of styleScopes) {
    const source = styles?.[scope];
    if (!source) continue;
    for (const declaration of parseDeclarations(source)) {
      walk(declaration, (node) => {
        if (node.type === "Url") paths.add(node.value);
      });
    }
  }
  // Arbitrary Tailwind image utilities retain the URL in their class token.
  for (const candidate of styles?.tailwind ?? []) {
    for (const match of candidate.matchAll(/url\(['"]?([^'"()]+)['"]?\)/g))
      paths.add(match[1]);
  }
  return [...paths];
}
