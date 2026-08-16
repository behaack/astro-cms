import { componentDefinitions } from "./component-definitions";
import type { ComponentNode } from "./document-types";
import { normalizePageRoute } from "./local-page-store";

function internalPageRoute(value: string): string | undefined {
  if (!value.startsWith("/") || value.startsWith("//")) return undefined;
  const pathOnly = value.split(/[?#]/, 1)[0];
  try {
    return normalizePageRoute(pathOnly);
  } catch {
    return undefined;
  }
}

function rewrittenInternalPageRoute(
  value: string,
  fromRoute: string,
  toRoute: string,
): string | undefined {
  if (internalPageRoute(value) !== fromRoute) return undefined;
  const suffixIndex = value.search(/[?#]/);
  const suffix = suffixIndex === -1 ? "" : value.slice(suffixIndex);
  return `${toRoute}${suffix}`;
}

export function referencedInternalPageRoutes(nodes: ComponentNode[]): string[] {
  const routes = new Set<string>();
  const visit = (node: ComponentNode): void => {
    const definition = componentDefinitions[node.type];
    for (const [propertyName, property] of Object.entries(
      definition.properties,
    )) {
      const value = node.props[propertyName];
      if (property.type !== "url" || typeof value !== "string") continue;
      const route = internalPageRoute(value);
      if (route) routes.add(route);
    }
    node.children?.forEach(visit);
  };
  nodes.forEach(visit);
  return [...routes].sort();
}

export interface RewrittenPageReferences {
  nodes: ComponentNode[];
  replacements: number;
}

export function rewriteInternalPageRouteReferences(
  nodes: ComponentNode[],
  fromRouteInput: string,
  toRouteInput: string,
): RewrittenPageReferences {
  const fromRoute = normalizePageRoute(fromRouteInput);
  const toRoute = normalizePageRoute(toRouteInput);
  let replacements = 0;
  const rewrite = (node: ComponentNode): ComponentNode => {
    const definition = componentDefinitions[node.type];
    const props = { ...node.props };
    for (const [propertyName, property] of Object.entries(
      definition.properties,
    )) {
      const value = props[propertyName];
      if (property.type !== "url" || typeof value !== "string") continue;
      const rewritten = rewrittenInternalPageRoute(value, fromRoute, toRoute);
      if (rewritten === undefined) continue;
      props[propertyName] = rewritten;
      replacements += 1;
    }
    return {
      ...node,
      props,
      ...(node.children
        ? { children: node.children.map((child) => rewrite(child)) }
        : {}),
    };
  };

  return { nodes: nodes.map((node) => rewrite(node)), replacements };
}
