import {
  referencedImagePaths,
  referencedPageImagePaths,
} from "./asset-references";
import type { PageDocument } from "./document-types";
import {
  listLocalImageAssets,
  resolveLocalUploadedImagePath,
  type LocalAssetStoreOptions,
  type LocalImageAsset,
} from "./local-asset-store";
import {
  readAllLocalPageDocuments,
  type LocalPageStoreOptions,
} from "./local-page-store";
import {
  listReusableTemplates,
  type LocalTemplateStoreOptions,
} from "./local-template-store";

export interface LocalImageUsage {
  kind: "page" | "template" | "draft";
  id: string;
  label: string;
}

export interface LocalImageAssetWithUsage extends LocalImageAsset {
  managedUpload: boolean;
  usages: LocalImageUsage[];
}

export interface LocalAssetUsageOptions
  extends
    LocalAssetStoreOptions,
    LocalPageStoreOptions,
    LocalTemplateStoreOptions {}

interface ImageReferenceOwner {
  usage: LocalImageUsage;
  paths: string[];
}

async function referenceOwners(
  options: LocalAssetUsageOptions,
  draft?: PageDocument,
): Promise<ImageReferenceOwner[]> {
  const [pages, templates] = await Promise.all([
    readAllLocalPageDocuments(options),
    listReusableTemplates(options),
  ]);
  const owners: ImageReferenceOwner[] = [
    ...pages.map((page) => ({
      usage: {
        kind: "page" as const,
        id: page.route,
        label: page.title,
      },
      paths: referencedPageImagePaths(page),
    })),
    ...templates.map((template) => ({
      usage: {
        kind: "template" as const,
        id: template.id,
        label: template.name,
      },
      paths: referencedImagePaths([template.root]),
    })),
  ];
  if (draft) {
    const savedOwner = owners.find(
      ({ usage }) => usage.kind === "page" && usage.id === draft.route,
    );
    const draftPaths = referencedPageImagePaths(draft).filter(
      (publicPath) => !savedOwner?.paths.includes(publicPath),
    );
    if (draftPaths.length > 0) {
      owners.push({
        usage: {
          kind: "draft",
          id: draft.route,
          label: draft.title,
        },
        paths: draftPaths,
      });
    }
  }
  return owners;
}

export async function findLocalImageUsages(
  publicPath: string,
  options: LocalAssetUsageOptions = {},
  draft?: PageDocument,
): Promise<LocalImageUsage[]> {
  const owners = await referenceOwners(options, draft);
  return owners
    .filter((owner) => owner.paths.includes(publicPath))
    .map((owner) => owner.usage);
}

export async function listLocalImageAssetsWithUsage(
  options: LocalAssetUsageOptions = {},
): Promise<LocalImageAssetWithUsage[]> {
  const [assets, owners] = await Promise.all([
    listLocalImageAssets(options),
    referenceOwners(options),
  ]);
  return assets.map((asset) => ({
    ...asset,
    managedUpload:
      resolveLocalUploadedImagePath(asset.publicPath, options) !== undefined,
    usages: owners
      .filter((owner) => owner.paths.includes(asset.publicPath))
      .map((owner) => owner.usage),
  }));
}
