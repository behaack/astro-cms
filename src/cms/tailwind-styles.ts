import { compile } from "tailwindcss";
import theme from "tailwindcss/theme.css?raw";
import { generate, ident, parse, walk } from "css-tree";
import { validateStyleUrls } from "./component-styles";
import type { ComponentNode } from "./document-types";

const cache = new Map<string, Promise<string>>();

export function pageTailwindClasses(nodes: ComponentNode[]): string[] {
  const classes = new Set<string>();
  const visit = (node: ComponentNode) => {
    node.styles?.tailwind?.forEach((value) => classes.add(value));
    node.children?.forEach(visit);
  };
  nodes.forEach(visit);
  return [...classes].sort();
}

async function buildUtilities(candidates: string[]): Promise<string> {
  // Compile only utilities and their theme variables; never add Tailwind's reset.
  const compiler = await compile(`${theme}\n@tailwind utilities;`);
  const ast = parse(compiler.build(candidates));
  const recognized = new Set<string>();
  walk(ast, (node) => {
    if (node.type === "ClassSelector") recognized.add(ident.decode(node.name));
  });
  const unknown = candidates.filter(
    (value) =>
      !recognized.has(value) &&
      !/^(?:group|peer)(?:\/[\w-]+)?$/.test(value) &&
      value !== "dark",
  );
  if (unknown.length)
    throw new Error(
      `Unknown Tailwind ${unknown.length === 1 ? "class" : "classes"}: ${unknown.join(", ")}`,
    );
  validateStyleUrls(ast);
  walk(ast, {
    visit: "Rule",
    enter(rule) {
      if (
        this.atrule?.name.endsWith("keyframes") ||
        rule.prelude.type !== "SelectorList"
      )
        return;
      if ([":root,:host", ":root"].includes(generate(rule.prelude))) {
        const scope = parse("[data-astro-cms-page]", {
          context: "selectorList",
        });
        if (scope.type === "SelectorList") rule.prelude = scope;
        return;
      }
      rule.prelude.children.forEach((selector) => {
        if (selector.type !== "Selector") return;
        const prefix = parse("[data-astro-cms-page] ", { context: "selector" });
        if (prefix.type !== "Selector") return;
        selector.children.prependData({ type: "Combinator", name: " " });
        selector.children.prependList(prefix.children);
      });
    },
  });
  return generate(ast);
}

export function tailwindStyles(candidates: string[]): Promise<string> {
  if (!candidates.length) return Promise.resolve("");
  const ordered = [...new Set(candidates)].sort();
  const key = ordered.join(" ");
  let result = cache.get(key);
  if (!result) {
    result = buildUtilities(ordered);
    cache.set(key, result);
    if (cache.size > 50) cache.delete(cache.keys().next().value!);
  }
  return result;
}

export function cssForHtml(css: string): string {
  // CSS is rendered in a style element, so HTML end tags must remain CSS text.
  return css.replaceAll("<", "\\3c ");
}
