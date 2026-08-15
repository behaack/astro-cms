import { componentTypeValues } from "./component-manifest";
import type { ComponentType } from "./document-types";

const primitiveModules = import.meta.glob("../components/primitives/*.astro", {
  eager: true,
  import: "default",
}) as Record<string, unknown>;

function componentFor(type: ComponentType): unknown {
  const modulePath = `../components/primitives/${type}.astro`;
  const component = primitiveModules[modulePath];

  if (!component) {
    throw new Error(
      `The component manifest registers ${type}, but ${modulePath} does not exist.`,
    );
  }

  return component;
}

/**
 * Statically expanded by Vite from the native primitive directory. The
 * manifest key/file-name convention removes the second hand-maintained
 * registry that previously existed here.
 */
export const componentRegistry = Object.fromEntries(
  componentTypeValues.map((type) => [type, componentFor(type)]),
) as Record<ComponentType, unknown>;
