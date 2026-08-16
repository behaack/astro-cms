import { readAllLocalPageDocuments } from "./local-page-store";
import { referencedInternalPageRoutes } from "./page-references";
import {
  listReusableTemplates,
  type LocalTemplateStoreOptions,
} from "./local-template-store";
import type { LocalPageStoreOptions } from "./local-page-store";

export interface LocalPageRouteUsage {
  kind: "page" | "template";
  id: string;
  label: string;
}

export interface LocalPageUsageOptions
  extends LocalPageStoreOptions, LocalTemplateStoreOptions {}

export async function findLocalPageRouteUsages(
  route: string,
  options: LocalPageUsageOptions = {},
): Promise<LocalPageRouteUsage[]> {
  const [pages, templates] = await Promise.all([
    readAllLocalPageDocuments(options),
    listReusableTemplates(options),
  ]);
  return [
    ...pages
      .filter(
        (page) =>
          page.route !== route &&
          referencedInternalPageRoutes(page.content).includes(route),
      )
      .map((page) => ({
        kind: "page" as const,
        id: page.route,
        label: page.title,
      })),
    ...templates
      .filter((template) =>
        referencedInternalPageRoutes([template.root]).includes(route),
      )
      .map((template) => ({
        kind: "template" as const,
        id: template.id,
        label: template.name,
      })),
  ];
}
