import type { TraitProperties } from "grapesjs";
import type { PropertyDefinition } from "../cms/document-types";

export function traitFor(
  name: string,
  property: PropertyDefinition,
): TraitProperties {
  if (property.type === "select") {
    return {
      type: "select",
      name,
      label: property.label,
      changeProp: true,
      options: property.options?.map((option) => ({
        id: String(option.id),
        label: option.label,
      })),
      // Native selects use strings; the document retains the manifest's type.
      getValue: ({ component }) => String(component.get(name) ?? ""),
      setValue: ({ component, value, partial, options }) => {
        const option = property.options?.find(
          (option) => String(option.id) === String(value),
        );
        if (option) {
          component.set(
            { [name]: option.id, __p: partial ? null : undefined },
            { ...options, avoidStore: partial },
          );
        }
      },
    };
  }

  return {
    type: property.type === "boolean" ? "checkbox" : "text",
    name,
    label: property.label,
    changeProp: true,
  };
}
