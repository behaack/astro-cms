import type { ComponentManifestEntry } from "./component-contract";
import { componentManifest, componentTypeValues } from "astro-cms:manifest";
import type { ComponentDefinition, ComponentType } from "./document-types";

const componentTypeSet = new Set<string>(componentTypeValues);

function isComponentType(value: string): value is ComponentType {
  return componentTypeSet.has(value);
}

function buildDefinition(type: ComponentType): ComponentDefinition {
  const manifestEntry: ComponentManifestEntry = componentManifest[type];
  const unknownParents = manifestEntry.allowedParents.filter(
    (parent) => !isComponentType(parent),
  );

  if (unknownParents.length > 0) {
    throw new Error(
      `${type} declares unknown parent types: ${unknownParents.join(", ")}`,
    );
  }

  const allowedParents = manifestEntry.allowedParents.filter(isComponentType);
  const allowedChildren = componentTypeValues.filter((childType) => {
    const child: ComponentManifestEntry = componentManifest[childType];
    return child.allowedParents.includes(type);
  });

  if (!manifestEntry.acceptsChildren && allowedChildren.length > 0) {
    throw new Error(
      `${type} is a leaf but other components declare it as an allowed parent.`,
    );
  }

  return {
    ...manifestEntry,
    type,
    allowedParents,
    allowedChildren,
  };
}

export const componentDefinitions = Object.fromEntries(
  componentTypeValues.map((type) => [type, buildDefinition(type)]),
) as Record<ComponentType, ComponentDefinition>;
