import { mkdir, readdir, realpath, writeFile } from "node:fs/promises";
import path from "node:path";

export interface LocalAssetStoreOptions {
  publicDirectory?: string;
}

export interface LocalImageAsset {
  publicPath: string;
  fileName: string;
  extension: string;
}

export interface LocalImageUpload {
  fileName: string;
  bytes: Uint8Array;
}

export const MAX_LOCAL_IMAGE_UPLOAD_BYTES = 8 * 1024 * 1024;
export const LOCAL_IMAGE_UPLOAD_DIRECTORY = "uploads";

export class LocalAssetStoreError extends Error {}

const IMAGE_EXTENSIONS = new Set([
  ".avif",
  ".gif",
  ".jpeg",
  ".jpg",
  ".png",
  ".svg",
  ".webp",
]);

const UPLOAD_IMAGE_EXTENSIONS = new Set([
  ".avif",
  ".gif",
  ".jpeg",
  ".jpg",
  ".png",
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

function isWithinDirectory(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function hasBytes(
  bytes: Uint8Array,
  offset: number,
  expected: number[],
): boolean {
  return expected.every((value, index) => bytes[offset + index] === value);
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

function detectedImageExtension(bytes: Uint8Array): string | undefined {
  if (hasBytes(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return ".png";
  }
  if (hasBytes(bytes, 0, [0xff, 0xd8, 0xff])) return ".jpeg";
  if (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a") {
    return ".gif";
  }
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    return ".webp";
  }
  if (ascii(bytes, 4, 4) === "ftyp") {
    for (
      let offset = 8;
      offset + 4 <= Math.min(bytes.length, 40);
      offset += 4
    ) {
      const brand = ascii(bytes, offset, 4);
      if (brand === "avif" || brand === "avis") return ".avif";
    }
  }
  return undefined;
}

function safeUploadBaseName(fileName: string): string {
  if (
    !fileName.trim() ||
    fileName !== path.basename(fileName) ||
    fileName.includes("/") ||
    fileName.includes("\\")
  ) {
    throw new LocalAssetStoreError("The image filename is not safe.");
  }
  const extension = path.extname(fileName);
  const baseName = fileName.slice(0, -extension.length);
  return (
    baseName
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "image"
  );
}

export function resolveLocalUploadedImagePath(
  publicPath: string,
  options: LocalAssetStoreOptions = {},
): string | undefined {
  if (!publicPath.startsWith(`/${LOCAL_IMAGE_UPLOAD_DIRECTORY}/`)) {
    return undefined;
  }
  if (publicPath.includes("?") || publicPath.includes("#")) {
    throw new LocalAssetStoreError(
      "Uploaded image paths cannot contain a query or fragment.",
    );
  }

  let segments: string[];
  try {
    segments = publicPath.slice(1).split("/").map(decodeURIComponent);
  } catch {
    throw new LocalAssetStoreError("The uploaded image path is invalid.");
  }
  if (
    segments.length !== 2 ||
    segments[0] !== LOCAL_IMAGE_UPLOAD_DIRECTORY ||
    !segments[1] ||
    segments[1] === "." ||
    segments[1] === ".." ||
    segments[1].includes("/") ||
    segments[1].includes("\\") ||
    !UPLOAD_IMAGE_EXTENSIONS.has(path.extname(segments[1]).toLowerCase())
  ) {
    throw new LocalAssetStoreError("The uploaded image path is invalid.");
  }

  const publicDirectory = path.resolve(assetPublicDirectory(options));
  const candidate = path.resolve(publicDirectory, ...segments);
  if (
    !isWithinDirectory(
      path.join(publicDirectory, LOCAL_IMAGE_UPLOAD_DIRECTORY),
      candidate,
    )
  ) {
    throw new LocalAssetStoreError(
      "The uploaded image path is outside the upload directory.",
    );
  }
  return candidate;
}

export async function saveLocalImageUpload(
  upload: LocalImageUpload,
  options: LocalAssetStoreOptions = {},
): Promise<LocalImageAsset> {
  if (upload.bytes.byteLength === 0) {
    throw new LocalAssetStoreError("Choose a non-empty image file.");
  }
  if (upload.bytes.byteLength > MAX_LOCAL_IMAGE_UPLOAD_BYTES) {
    throw new LocalAssetStoreError("Images must be 8 MB or smaller.");
  }

  const requestedExtension = path.extname(upload.fileName).toLowerCase();
  if (!UPLOAD_IMAGE_EXTENSIONS.has(requestedExtension)) {
    throw new LocalAssetStoreError(
      "Upload a PNG, JPEG, GIF, WebP, or AVIF image.",
    );
  }
  const detectedExtension = detectedImageExtension(upload.bytes);
  const requestedFamily =
    requestedExtension === ".jpg" ? ".jpeg" : requestedExtension;
  if (!detectedExtension || detectedExtension !== requestedFamily) {
    throw new LocalAssetStoreError(
      "The file contents do not match its image extension.",
    );
  }

  const publicDirectory = path.resolve(assetPublicDirectory(options));
  const uploadDirectory = path.join(
    publicDirectory,
    LOCAL_IMAGE_UPLOAD_DIRECTORY,
  );
  await mkdir(uploadDirectory, { recursive: true });
  const [realPublicDirectory, realUploadDirectory] = await Promise.all([
    realpath(publicDirectory),
    realpath(uploadDirectory),
  ]);
  if (!isWithinDirectory(realPublicDirectory, realUploadDirectory)) {
    throw new LocalAssetStoreError(
      "The upload directory is outside the public folder.",
    );
  }

  const baseName = safeUploadBaseName(upload.fileName);
  for (let suffix = 1; suffix <= 10_000; suffix += 1) {
    const fileName = `${baseName}${suffix === 1 ? "" : `-${suffix}`}${requestedExtension}`;
    const filePath = path.join(realUploadDirectory, fileName);
    try {
      await writeFile(filePath, upload.bytes, { flag: "wx" });
      return {
        publicPath: publicPathFor(
          path.join(LOCAL_IMAGE_UPLOAD_DIRECTORY, fileName),
        ),
        fileName,
        extension: requestedExtension.slice(1),
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") continue;
      throw error;
    }
  }
  throw new LocalAssetStoreError(
    "A unique filename could not be created for this image.",
  );
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
