import { z } from "zod";

import { componentTypeValues } from "./document-types";
import type { ComponentNode, PageDocument } from "./document-types";

const propertyValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

export const componentNodeSchema: z.ZodType<ComponentNode> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    type: z.enum(componentTypeValues),
    props: z.record(z.string(), propertyValueSchema),
    children: z.array(componentNodeSchema).optional(),
  }),
);

export const pageDocumentSchema: z.ZodType<PageDocument> = z.object({
  schemaVersion: z.literal(1),
  route: z.string().startsWith("/"),
  title: z.string().min(1),
  description: z.string().optional(),
  content: z.array(componentNodeSchema),
});

export function parsePageDocument(input: unknown): PageDocument {
  return pageDocumentSchema.parse(input);
}
