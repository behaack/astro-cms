import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { PageDocument } from "./document-types";
import { assertPageDocument } from "./validation";

const PAGE_FILES: Readonly<Record<string, string>> = {
  "/": "home.json",
};

export interface LocalPageStoreOptions {
  contentDirectory?: string;
}

function contentDirectory(options: LocalPageStoreOptions): string {
  return (
    options.contentDirectory ?? path.join(process.cwd(), "content", "pages")
  );
}

function pagePath(route: string, options: LocalPageStoreOptions): string {
  const fileName = PAGE_FILES[route];
  if (!fileName) {
    throw new Error(`No local page file is registered for route ${route}.`);
  }

  return path.join(contentDirectory(options), fileName);
}

export async function readLocalPageDocument(
  route = "/",
  options: LocalPageStoreOptions = {},
): Promise<PageDocument> {
  const serialized = await readFile(pagePath(route, options), "utf8");
  return assertPageDocument(JSON.parse(serialized));
}

export async function writeLocalPageDocument(
  input: unknown,
  options: LocalPageStoreOptions = {},
): Promise<PageDocument> {
  const document = assertPageDocument(input);
  const destination = pagePath(document.route, options);
  const directory = path.dirname(destination);
  const temporaryPath = path.join(
    directory,
    `.${path.basename(destination)}.${randomUUID()}.tmp`,
  );

  await mkdir(directory, { recursive: true });

  try {
    await writeFile(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    await rename(temporaryPath, destination);
  } finally {
    await rm(temporaryPath, { force: true });
  }

  return document;
}
