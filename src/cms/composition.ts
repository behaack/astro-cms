import { componentDefinitions } from "./component-definitions";
import type {
  ComponentNode,
  ComponentType,
  PropertyValue,
} from "./document-types";

export const rootAllowedChildren: readonly ComponentType[] = ["Section"];

export function canContainComponent(
  parentType: ComponentType | null,
  childType: ComponentType,
): boolean {
  if (parentType === null) {
    return rootAllowedChildren.includes(childType);
  }

  return componentDefinitions[parentType].allowedChildren.includes(childType);
}

export function createComponentNode(
  type: ComponentType,
  createId: () => string = () => crypto.randomUUID(),
): ComponentNode {
  const definition = componentDefinitions[type];
  const props: Record<string, PropertyValue> = {};

  for (const [name, property] of Object.entries(definition.properties)) {
    if (property.defaultValue !== undefined) {
      props[name] = property.defaultValue;
    }
  }

  return {
    id: createId(),
    type,
    props,
  };
}

export function cloneComponentNodeWithFreshIds(
  node: ComponentNode,
  createId: () => string = () => crypto.randomUUID(),
): ComponentNode {
  return {
    id: createId(),
    type: node.type,
    props: structuredClone(node.props),
    ...(node.children
      ? {
          children: node.children.map((child) =>
            cloneComponentNodeWithFreshIds(child, createId),
          ),
        }
      : {}),
  };
}
