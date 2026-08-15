import type { ComponentNode, PageDocument } from "./document-types";

export function requireNodeByType(
  document: PageDocument,
  type: ComponentNode["type"],
): ComponentNode {
  const visit = (nodes: ComponentNode[]): ComponentNode | undefined => {
    for (const node of nodes) {
      if (node.type === type) return node;
      const descendant = node.children ? visit(node.children) : undefined;
      if (descendant) return descendant;
    }
    return undefined;
  };

  const node = visit(document.content);
  if (!node) throw new Error(`Expected fixture component ${type}.`);
  return node;
}
