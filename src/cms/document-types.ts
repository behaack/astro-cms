import type {
  ComponentCategory,
  ComponentManifestEntry,
  PropertyValue,
} from "./component-contract";
import type { ManifestComponentType } from "astro-cms:manifest";

export { componentTypeValues } from "astro-cms:manifest";
export type {
  ComponentCategory,
  PropertyControlType,
  PropertyDefinition,
  PropertyValue,
} from "./component-contract";

export type ComponentType = ManifestComponentType;

export interface ComponentNode {
  id: string;
  type: ComponentType;
  props: Record<string, PropertyValue>;
  children?: ComponentNode[];
}

export type PageSearchVisibility = "public" | "noindex";

export interface PageSeoMetadata {
  schemaVersion: 1;
  title?: string;
  description?: string;
  socialImage?: string;
  socialImageAlt?: string;
  searchVisibility?: PageSearchVisibility;
}

export interface PageDocument {
  schemaVersion: 1;
  route: string;
  title: string;
  description?: string;
  seo?: PageSeoMetadata;
  content: ComponentNode[];
}

export interface ComponentDefinition extends Omit<
  ComponentManifestEntry,
  "allowedParents"
> {
  type: ComponentType;
  category: ComponentCategory;
  allowedParents: readonly ComponentType[];
  allowedChildren: readonly ComponentType[];
}
