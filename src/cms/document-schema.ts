import { z } from "zod";

import { componentTypeValues } from "./document-types";
import { cssIssue, isStylesheetUrl } from "./component-styles";
import type {
  ComponentNode,
  PageDocument,
  PageSeoMetadata,
} from "./document-types";

export function isSafeImageSource(value: string): boolean {
  if (value.startsWith("/") && !value.startsWith("//")) return true;

  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

const propertyValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

const cssDeclarationsSchema = z
  .string()
  .max(8000)
  .superRefine((source, context) => {
    const message = cssIssue(source);
    if (message) context.addIssue({ code: "custom", message });
  });
const classesSchema = z
  .array(z.string().min(1).max(256).regex(/^\S+$/))
  .max(100);
export const componentStylesSchema = z
  .object({
    classes: classesSchema.optional(),
    tailwind: classesSchema.optional(),
    css: cssDeclarationsSchema.optional(),
    tabletCss: cssDeclarationsSchema.optional(),
    phoneCss: cssDeclarationsSchema.optional(),
    text: z
      .record(
        z.string().min(1).max(100),
        z
          .array(
            z
              .object({
                start: z.number().int().min(0),
                end: z.number().int().min(1),
                bold: z.literal(true).optional(),
                italic: z.literal(true).optional(),
                underline: z.literal(true).optional(),
              })
              .strict()
              .refine(
                (range) =>
                  range.end > range.start &&
                  !!(range.bold || range.italic || range.underline),
                "Use a nonempty text range with supported formatting",
              ),
          )
          .max(1000),
      )
      .optional(),
  })
  .strict();

export const componentNodeSchema: z.ZodType<ComponentNode> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    type: z.enum(componentTypeValues),
    props: z.record(z.string(), propertyValueSchema),
    styles: componentStylesSchema.optional(),
    children: z.array(componentNodeSchema).optional(),
  }),
);

export const pageSeoMetadataSchema: z.ZodType<PageSeoMetadata> = z
  .object({
    schemaVersion: z.literal(1),
    title: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().min(1).max(320).optional(),
    socialImage: z
      .string()
      .trim()
      .min(1)
      .max(2_048)
      .refine(isSafeImageSource, {
        message: "must be a safe relative, HTTP, or HTTPS image path",
      })
      .optional(),
    socialImageAlt: z.string().trim().min(1).max(300).optional(),
    searchVisibility: z.enum(["public", "noindex"]).optional(),
  })
  .superRefine((seo, context) => {
    if (seo.socialImage && !seo.socialImageAlt) {
      context.addIssue({
        code: "custom",
        path: ["socialImageAlt"],
        message: "is required when a social image is set",
      });
    }
    if (seo.socialImageAlt && !seo.socialImage) {
      context.addIssue({
        code: "custom",
        path: ["socialImage"],
        message: "is required when social image alternative text is set",
      });
    }
  });

export const pageDocumentSchema: z.ZodType<PageDocument> = z.object({
  schemaVersion: z.literal(1),
  route: z.string().startsWith("/"),
  title: z.string().min(1),
  description: z.string().optional(),
  seo: pageSeoMetadataSchema.optional(),
  stylesheets: z
    .array(
      z.string().max(2048).refine(isStylesheetUrl, {
        message: "must be a site-relative or HTTP(S) CSS stylesheet URL",
      }),
    )
    .max(10)
    .optional(),
  content: z.array(componentNodeSchema),
});

export function parsePageDocument(input: unknown): PageDocument {
  return pageDocumentSchema.parse(input);
}
