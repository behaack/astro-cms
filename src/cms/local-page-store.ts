import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import type { PageDocument } from "./document-types";
import { assertPageDocument } from "./validation";

export interface LocalPageStoreOptions {
  contentDirectory?: string;
}

export interface LocalPageSummary {
  route: string;
  title: string;
  description?: string;
}

export interface CreateLocalPageInput {
  route: string;
  title: string;
  description?: string;
}

export class InvalidPageRouteError extends Error {}
export class InvalidPageDetailsError extends Error {}
export class PageAlreadyExistsError extends Error {}

export interface LocalPageSnapshot {
  document: PageDocument;
  source: string;
  revision: string;
  filePath: string;
}

function contentDirectory(options: LocalPageStoreOptions): string {
  return (
    options.contentDirectory ?? path.join(process.cwd(), "content", "pages")
  );
}

export function normalizePageRoute(input: string): string {
  const trimmed = input.trim();
  if (trimmed === "/") return "/";
  const route = `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
  if (route.includes("?") || route.includes("#") || route.includes("%")) {
    throw new InvalidPageRouteError(
      "Page paths cannot contain a query, fragment, or encoded characters.",
    );
  }
  const segments = route.slice(1).split("/");
  if (
    segments.some(
      (segment) => !segment || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(segment),
    )
  ) {
    throw new InvalidPageRouteError(
      "Page paths must use lowercase letters, numbers, and single hyphens.",
    );
  }
  return route;
}

export function localPageFilePath(
  route: string,
  options: LocalPageStoreOptions = {},
): string {
  const normalizedRoute = normalizePageRoute(route);
  const relativeFile =
    normalizedRoute === "/"
      ? "home.json"
      : `${normalizedRoute.slice(1).replaceAll("/", path.sep)}.json`;
  const directory = contentDirectory(options);
  const filePath = path.resolve(directory, relativeFile);
  const relative = path.relative(path.resolve(directory), filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new InvalidPageRouteError(
      "The page path is outside the content directory.",
    );
  }
  return filePath;
}

function routeForRelativePageFile(relativeFile: string): string {
  const normalized = relativeFile.replaceAll("\\", "/");
  if (normalized === "home.json") return "/";
  return normalizePageRoute(`/${normalized.replace(/\.json$/, "")}`);
}

async function pageFiles(
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
    if (entry.name.startsWith(".")) continue;
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await pageFiles(directory, relativePath)));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(relativePath);
    }
  }
  return files;
}

function orderedNode(
  node: PageDocument["content"][number],
): PageDocument["content"][number] {
  const props = Object.fromEntries(
    Object.entries(node.props).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
  return {
    id: node.id,
    type: node.type,
    props,
    ...(node.children
      ? { children: node.children.map((child) => orderedNode(child)) }
      : {}),
  };
}

export function serializePageDocument(input: unknown): string {
  const document = assertPageDocument(input);
  const orderedDocument = {
    schemaVersion: document.schemaVersion,
    route: document.route,
    title: document.title,
    ...(document.description === undefined
      ? {}
      : { description: document.description }),
    content: document.content.map((node) => orderedNode(node)),
  };
  return `${JSON.stringify(orderedDocument, null, 2)}\n`;
}

export function pageSourceRevision(source: string): string {
  return createHash("sha256").update(source, "utf8").digest("hex");
}

async function writePageSource(
  route: string,
  source: string,
  options: LocalPageStoreOptions,
): Promise<void> {
  const destination = localPageFilePath(route, options);
  const directory = path.dirname(destination);
  const temporaryPath = path.join(
    directory,
    `.${path.basename(destination)}.${randomUUID()}.tmp`,
  );

  await mkdir(directory, { recursive: true });

  try {
    await writeFile(temporaryPath, source, {
      encoding: "utf8",
      flag: "wx",
    });
    await rename(temporaryPath, destination);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

export async function restoreLocalPageSource(
  route: string,
  source: string,
  options: LocalPageStoreOptions = {},
): Promise<void> {
  const document = assertPageDocument(JSON.parse(source));
  if (document.route !== route) {
    throw new Error(
      "The stored page source does not match the requested route.",
    );
  }
  await writePageSource(route, source, options);
}

export async function readLocalPageSnapshot(
  route = "/",
  options: LocalPageStoreOptions = {},
): Promise<LocalPageSnapshot> {
  const requestedRoute = normalizePageRoute(route);
  const filePath = localPageFilePath(requestedRoute, options);
  const source = await readFile(filePath, "utf8");
  const document = assertPageDocument(JSON.parse(source));
  if (document.route !== requestedRoute) {
    throw new Error(
      `Page route ${document.route} does not match requested route ${requestedRoute}.`,
    );
  }
  return {
    document,
    source,
    revision: pageSourceRevision(source),
    filePath,
  };
}

export async function readLocalPageDocument(
  route = "/",
  options: LocalPageStoreOptions = {},
): Promise<PageDocument> {
  return (await readLocalPageSnapshot(route, options)).document;
}

export async function listLocalPageDocuments(
  options: LocalPageStoreOptions = {},
): Promise<LocalPageSummary[]> {
  const documents = await readAllLocalPageDocuments(options);
  return documents
    .map((document) => ({
      route: document.route,
      title: document.title,
      ...(document.description === undefined
        ? {}
        : { description: document.description }),
    }))
    .sort((left, right) => {
      if (left.route === "/") return -1;
      if (right.route === "/") return 1;
      return left.route.localeCompare(right.route);
    });
}

export async function readAllLocalPageSnapshots(
  options: LocalPageStoreOptions = {},
): Promise<LocalPageSnapshot[]> {
  const directory = contentDirectory(options);
  const files = await pageFiles(directory);
  const snapshots = await Promise.all(
    files.map(async (relativeFile) => {
      const expectedRoute = routeForRelativePageFile(relativeFile);
      const filePath = path.join(directory, relativeFile);
      const source = await readFile(filePath, "utf8");
      const document = assertPageDocument(JSON.parse(source));
      if (document.route !== expectedRoute) {
        throw new Error(
          `Page route ${document.route} does not match ${relativeFile.replaceAll("\\", "/")}.`,
        );
      }
      return {
        document,
        source,
        revision: pageSourceRevision(source),
        filePath,
      };
    }),
  );
  return snapshots.sort((left, right) => {
    if (left.document.route === "/") return -1;
    if (right.document.route === "/") return 1;
    return left.document.route.localeCompare(right.document.route);
  });
}

export async function readAllLocalPageDocuments(
  options: LocalPageStoreOptions = {},
): Promise<PageDocument[]> {
  return (await readAllLocalPageSnapshots(options)).map(
    (snapshot) => snapshot.document,
  );
}

export async function createLocalPageDocument(
  input: CreateLocalPageInput,
  options: LocalPageStoreOptions = {},
): Promise<PageDocument> {
  const route = normalizePageRoute(input.route);
  const title = input.title.trim();
  if (!title) throw new InvalidPageDetailsError("Page title is required.");
  let document: PageDocument;
  try {
    document = assertPageDocument({
      schemaVersion: 1,
      route,
      title,
      ...(input.description?.trim()
        ? { description: input.description.trim() }
        : {}),
      content: [],
    });
  } catch (error) {
    throw new InvalidPageDetailsError(
      error instanceof Error ? error.message : "Page details are invalid.",
    );
  }
  const destination = localPageFilePath(route, options);
  await mkdir(path.dirname(destination), { recursive: true });
  try {
    await writeFile(destination, serializePageDocument(document), {
      encoding: "utf8",
      flag: "wx",
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new PageAlreadyExistsError(`A page already exists at ${route}.`);
    }
    throw error;
  }
  return document;
}

export async function writeLocalPageDocument(
  input: unknown,
  options: LocalPageStoreOptions = {},
): Promise<PageDocument> {
  const document = assertPageDocument(input);
  await writePageSource(
    document.route,
    serializePageDocument(document),
    options,
  );

  return document;
}
