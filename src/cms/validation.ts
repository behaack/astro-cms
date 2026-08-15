import { componentDefinitions } from "./component-definitions";
import { rootAllowedChildren } from "./composition";
import { pageDocumentSchema } from "./document-schema";
import type { ComponentNode, PageDocument } from "./document-types";

export interface ValidationIssue {
  nodeId?: string;
  message: string;
}

export function validatePageDocument(input: unknown): ValidationIssue[] {
  const parsed = pageDocumentSchema.safeParse(input);

  if (!parsed.success) {
    return parsed.error.issues.map((issue) => ({
      message: `${issue.path.join(".") || "document"}: ${issue.message}`,
    }));
  }

  const issues: ValidationIssue[] = [];
  const seenIds = new Set<string>();

  const visit = (node: ComponentNode, parent?: ComponentNode): void => {
    const definition = componentDefinitions[node.type];

    if (seenIds.has(node.id)) {
      issues.push({
        nodeId: node.id,
        message: `Duplicate node id: ${node.id}`,
      });
    }
    seenIds.add(node.id);

    if (parent) {
      const parentDefinition = componentDefinitions[parent.type];
      const allowedChildren: readonly ComponentNode["type"][] =
        parentDefinition.allowedChildren;
      if (!allowedChildren.includes(node.type)) {
        issues.push({
          nodeId: node.id,
          message: `${node.type} is not allowed inside ${parent.type}.`,
        });
      }
    }

    for (const [propertyName, property] of Object.entries(
      definition.properties,
    )) {
      const value = node.props[propertyName];
      if (property.required && (value === undefined || value === "")) {
        issues.push({
          nodeId: node.id,
          message: `${definition.label}.${propertyName} is required.`,
        });
      }
    }

    const children = node.children ?? [];
    if (!definition.acceptsChildren && children.length > 0) {
      issues.push({
        nodeId: node.id,
        message: `${definition.label} cannot contain child components.`,
      });
    }

    children.forEach((child) => visit(child, node));
  };

  parsed.data.content.forEach((node) => {
    if (!rootAllowedChildren.includes(node.type)) {
      issues.push({
        nodeId: node.id,
        message: `${node.type} is not allowed at the page root.`,
      });
    }
    visit(node);
  });
  return issues;
}

export function assertPageDocument(input: unknown): PageDocument {
  const parsed = pageDocumentSchema.parse(input);
  const issues = validatePageDocument(parsed);

  if (issues.length > 0) {
    throw new Error(issues.map((issue) => issue.message).join("\n"));
  }

  return parsed;
}
