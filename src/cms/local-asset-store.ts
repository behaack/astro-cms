import { readdir } from "node:fs/promises";
import path from "node:path";

export interface LocalAssetStoreOptions {
  publicDirectory?: string;
}

export interface LocalImageAsset {
  publicPath: string;
  fileName: string;
  extension: string;
}

const IMAGE_EXTENSIONS = new Set([
  ".avif",
  ".gif",
  ".jpeg",
  ".jpg",
  ".png",
  ".svg",
  ".webp",
]);

function assetPublicDirectory(options: LocalAssetStoreOptions): string {
  return options.publicDirectory ?? path.join(process.cwd(), "public");
}

async function imageFiles(
  directory: string,
  relativeDirectory = "",
): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(path.join(directory, relativeDirectory), {
      withFileTypes: true,
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.isSymbolicLink()) continue;
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await imageFiles(directory, relativePath)));
    } else if (
      entry.isFile() &&
      IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
    ) {
      files.push(relativePath);
    }
  }
  return files;
}

function publicPathFor(relativeFile: string): string {
  const segments = relativeFile.replaceAll("\\", "/").split("/");
  return `/${segments.map((segment) => encodeURIComponent(segment)).join("/")}`;
}

export async function listLocalImageAssets(
  options: LocalAssetStoreOptions = {},
): Promise<LocalImageAsset[]> {
  const files = await imageFiles(assetPublicDirectory(options));
  return files
    .map((relativeFile) => ({
      publicPath: publicPathFor(relativeFile),
      fileName: path.basename(relativeFile),
      extension: path.extname(relativeFile).slice(1).toLowerCase(),
    }))
    .sort((left, right) => left.publicPath.localeCompare(right.publicPath));
}
