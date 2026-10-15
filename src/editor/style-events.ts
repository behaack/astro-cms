import type { ComponentStyles, TextFormat } from "../cms/document-types";

export const STYLE_SELECTION = "astro-cms:style-selection";
export const STYLE_REQUEST = "astro-cms:style-request";
export const STYLE_APPLY = "astro-cms:style-apply";
export const STYLESHEETS_APPLY = "astro-cms:stylesheets-apply";
export const TEXT_APPLY = "astro-cms:text-apply";
export const TEXT_FOCUS = "astro-cms:text-focus";

export interface PreviewTextSelection {
  nodeId: string;
  name: string;
  start: number;
  end: number;
}

export interface StyleSelection {
  nodeId?: string;
  label: string;
  styles?: ComponentStyles;
  stylesheets: string[];
  availableClasses: string[];
  textProperties?: { name: string; label: string; text: string }[];
  textSelection?: PreviewTextSelection;
}
export interface TextApply {
  nodeId: string;
  name: string;
  text: string;
  formats: TextFormat[];
  previewSelection?: PreviewTextSelection;
}
export interface StyleApply {
  nodeId: string;
  styles?: ComponentStyles;
}
