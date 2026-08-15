import type { Component, ComponentDefinition } from "grapesjs";

import { componentDefinitions } from "../cms/component-definitions";
import type {
  ComponentNode,
  ComponentType,
  PageDocument,
  PropertyValue,
} from "../cms/document-types";

export const editorTypeFor = (type: ComponentType): string =>
  `astro-cms-${type.toLowerCase()}`;

export function nodeToEditorComponent(node: ComponentNode): ComponentDefinition {
  return {
    type: editorTypeFor(node.type),
    cmsId: node.id,
    cmsType: node.type,
    ...node.props,
    attributes: {
      class: "astro-cms-canvas-node",
      "data-cms-label": componentDefinitions[node.type].label,
      "data-cms-id": node.id,
      "data-cms-type": node.type,
    },
    components: node.children?.map(nodeToEditorComponent) ?? [],
  };
}

export function editorComponentToNode(
  component: Component,
): ComponentNode | null {
  const type = component.get("cmsType") as ComponentType | undefined;
  if (!type || !(type in componentDefinitions)) {
    return null;
  }

  const definition = componentDefinitions[type];
  const props: Record<string, PropertyValue> = {};

  for (const propertyName of Object.keys(definition.properties)) {
    const value = component.get(propertyName) as PropertyValue | undefined;
    if (value !== undefined) {
      props[propertyName] = value;
    }
  }

  const children = (component.components().models as Component[])
    .map(editorComponentToNode)
    .filter((child): child is ComponentNode => child !== null);

  return {
    id: String(component.get("cmsId")),
    type,
    props,
    ...(children.length > 0 ? { children } : {}),
  };
}

export function editorRootToDocument(
  rootComponents: Component[],
  source: PageDocument,
): PageDocument {
  const content = rootComponents
    .map(editorComponentToNode)
    .filter((node): node is ComponentNode => node !== null);

  return {
    ...source,
    content,
  };
}
