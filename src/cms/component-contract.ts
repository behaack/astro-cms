export type PropertyValue = string | number | boolean | null;

export type PropertyControlType = "text" | "url" | "boolean" | "select";

export type ComponentCategory = "Layout" | "Content" | "Action";

export interface PropertyDefinition {
  type: PropertyControlType;
  label: string;
  required?: boolean;
  defaultValue?: PropertyValue;
  options?: ReadonlyArray<{ id: string | number; label: string }>;
}

/**
 * The developer-authored, editor-independent registration contract.
 *
 * A primitive is exposed by adding its native `Type.astro` file and one entry
 * to the manifest. The editor controls, validation rules, placement policy,
 * and Astro registry are derived from this information.
 */
export interface ComponentManifestEntry {
  label: string;
  category: ComponentCategory;
  acceptsChildren: boolean;
  allowedAtRoot?: boolean;
  allowedParents: readonly string[];
  properties: Record<string, PropertyDefinition>;
}
