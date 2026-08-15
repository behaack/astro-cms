export const componentTypeValues = [
  "Section",
  "Stack",
  "Heading",
  "Text",
  "Image",
  "Button",
] as const;

export type ComponentType = (typeof componentTypeValues)[number];

export type PropertyValue = string | number | boolean | null;

export interface ComponentNode {
  id: string;
  type: ComponentType;
  props: Record<string, PropertyValue>;
  children?: ComponentNode[];
}

export interface PageDocument {
  schemaVersion: 1;
  route: string;
  title: string;
  description?: string;
  content: ComponentNode[];
}

export type PropertyControlType = "text" | "url" | "boolean" | "select";

export interface PropertyDefinition {
  type: PropertyControlType;
  label: string;
  required?: boolean;
  defaultValue?: PropertyValue;
  options?: ReadonlyArray<{ id: string | number; label: string }>;
}

export interface ComponentDefinition {
  type: ComponentType;
  label: string;
  category: "Layout" | "Content" | "Action";
  acceptsChildren: boolean;
  allowedChildren: readonly ComponentType[];
  properties: Record<string, PropertyDefinition>;
}
