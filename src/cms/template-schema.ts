import { z } from "zod";

import { componentNodeSchema } from "./document-schema";
import type { ReusableTemplate } from "./template-types";
import { validateComponentSubtree } from "./validation";

export const reusableTemplateSchema: z.ZodType<ReusableTemplate> = z.object({
  schemaVersion: z.literal(1),
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().trim().min(1).max(80),
  root: componentNodeSchema,
});

export function assertReusableTemplate(input: unknown): ReusableTemplate {
  const template = reusableTemplateSchema.parse(input);
  const issues = validateComponentSubtree(template.root);

  if (issues.length > 0) {
    throw new Error(issues.map((issue) => issue.message).join("\n"));
  }

  return template;
}
