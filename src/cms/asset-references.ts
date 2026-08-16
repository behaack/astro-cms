import { componentDefinitions } from "./component-definitions";
import type { ComponentNode, PageDocument } from "./document-types";

export function referencedImagePaths(nodes: ComponentNode[]): string[] {
  const paths = new Set<string>();
  const visit = (node: ComponentNode): void => {
    const definition = componentDefinitions[node.type];
    for (const [propertyName, property] of Object.entries(
      definition.properties,
    )) {
      const value = node.props[propertyName];
      if (property.type === "image" && typeof value === "string") {
        paths.add(value);
      }
    }
    node.children?.forEach(visit);
  };
  nodes.forEach(visit);
  return [...paths].sort();
}

export function referencesImage(
  nodes: ComponentNode[],
  publicPath: string,
): boolean {
  return referencedImagePaths(nodes).includes(publicPath);
}

export function referencedPageImagePaths(document: PageDocument): string[] {
  return [
    ...new Set([
      ...referencedImagePaths(document.content),
      ...(document.seo?.socialImage ? [document.seo.socialImage] : []),
    ]),
  ].sort();
}
