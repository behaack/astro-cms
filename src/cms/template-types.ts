import type { ComponentNode } from "./document-types";

/** A copy-based reusable composition. Insertion always creates fresh node IDs. */
export interface ReusableTemplate {
  schemaVersion: 1;
  id: string;
  name: string;
  root: ComponentNode;
}

export interface CreateReusableTemplateInput {
  name: string;
  root: ComponentNode;
}
