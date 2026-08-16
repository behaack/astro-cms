import { componentDefinitions } from "./component-definitions";
import { rootAllowedChildren } from "./composition";
import { componentNodeSchema, pageDocumentSchema } from "./document-schema";
import type {
  ComponentNode,
  PageDocument,
  PropertyDefinition,
  PropertyValue,
} from "./document-types";

export interface ValidationIssue {
  nodeId?: string;
  message: string;
}

function isSafeUrl(value: string): boolean {
  if (value.startsWith("/") || value.startsWith("#")) return true;

  try {
    const url = new URL(value);
    return ["http:", "https:", "mailto:", "tel:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function isSafeImageSource(value: string): boolean {
  if (value.startsWith("/") && !value.startsWith("//")) return true;

  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function propertyIssue(
  property: PropertyDefinition,
  value: PropertyValue,
): string | undefined {
  if (property.type === "boolean") {
    return typeof value === "boolean" ? undefined : "must be true or false";
  }

  if (property.type === "select") {
    const allowed = property.options?.some((option) =>
      Object.is(option.id, value),
    );
    return allowed ? undefined : "must use an approved option";
  }

  if (typeof value !== "string") return "must be text";
  if (property.type === "url" && !isSafeUrl(value)) {
    return "must be a safe relative, HTTP, HTTPS, mail, or telephone URL";
  }
  if (property.type === "image" && !isSafeImageSource(value)) {
    return "must be a safe relative, HTTP, or HTTPS image path";
  }

  return undefined;
}

function validateComponentNodes(
  content: ComponentNode[],
  enforcePageRoot: boolean,
): ValidationIssue[] {
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
        continue;
      }

      if (value !== undefined) {
        const issue = propertyIssue(property, value);
        if (issue) {
          issues.push({
            nodeId: node.id,
            message: `${definition.label}.${propertyName} ${issue}.`,
          });
        }
      }
    }

    for (const propertyName of Object.keys(node.props)) {
      if (!(propertyName in definition.properties)) {
        issues.push({
          nodeId: node.id,
          message: `${definition.label}.${propertyName} is not an approved property.`,
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

  content.forEach((node) => {
    if (enforcePageRoot && !rootAllowedChildren.includes(node.type)) {
      issues.push({
        nodeId: node.id,
        message: `${node.type} is not allowed at the page root.`,
      });
    }
    visit(node);
  });

  return issues;
}

export function validateComponentSubtree(input: unknown): ValidationIssue[] {
  const parsed = componentNodeSchema.safeParse(input);

  if (!parsed.success) {
    return parsed.error.issues.map((issue) => ({
      message: `${issue.path.join(".") || "component"}: ${issue.message}`,
    }));
  }

  return validateComponentNodes([parsed.data], false);
}

export function validatePageDocument(input: unknown): ValidationIssue[] {
  const parsed = pageDocumentSchema.safeParse(input);

  if (!parsed.success) {
    return parsed.error.issues.map((issue) => ({
      message: `${issue.path.join(".") || "document"}: ${issue.message}`,
    }));
  }

  return validateComponentNodes(parsed.data.content, true);
}

export function assertPageDocument(input: unknown): PageDocument {
  const parsed = pageDocumentSchema.parse(input);
  const issues = validatePageDocument(parsed);

  if (issues.length > 0) {
    throw new Error(issues.map((issue) => issue.message).join("\n"));
  }

  return parsed;
}
