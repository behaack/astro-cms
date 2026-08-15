import { randomUUID } from "node:crypto";
import {
  access,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import type { ComponentNode } from "./document-types";
import { assertReusableTemplate } from "./template-schema";
import type {
  CreateReusableTemplateInput,
  ReusableTemplate,
} from "./template-types";
import { validateComponentSubtree } from "./validation";

export interface LocalTemplateStoreOptions {
  templateDirectory?: string;
}

export class ReusableTemplateExistsError extends Error {}

function templateDirectory(options: LocalTemplateStoreOptions): string {
  return (
    options.templateDirectory ??
    path.join(process.cwd(), "content", "templates")
  );
}

function templatePath(id: string, options: LocalTemplateStoreOptions): string {
  return path.join(templateDirectory(options), `${id}.json`);
}

export function templateIdForName(name: string): string {
  const id = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");

  if (!id) {
    throw new Error("Template name must contain a letter or number.");
  }

  return id;
}

function assertTemplateRoot(input: unknown): ComponentNode {
  const issues = validateComponentSubtree(input);
  if (issues.length > 0) {
    throw new Error(issues.map((issue) => issue.message).join("\n"));
  }
  return input as ComponentNode;
}

export async function listReusableTemplates(
  options: LocalTemplateStoreOptions = {},
): Promise<ReusableTemplate[]> {
  const directory = templateDirectory(options);
  let files: string[];

  try {
    files = await readdir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const templates = await Promise.all(
    files
      .filter((file) => file.endsWith(".json"))
      .map(async (file) =>
        assertReusableTemplate(
          JSON.parse(await readFile(path.join(directory, file), "utf8")),
        ),
      ),
  );

  return templates.sort((left, right) => left.name.localeCompare(right.name));
}

export async function createReusableTemplate(
  input: CreateReusableTemplateInput,
  options: LocalTemplateStoreOptions = {},
): Promise<ReusableTemplate> {
  const name = input.name.trim();
  const id = templateIdForName(name);
  const root = assertTemplateRoot(input.root);
  const template = assertReusableTemplate({
    schemaVersion: 1,
    id,
    name,
    root,
  });
  const destination = templatePath(id, options);
  const directory = path.dirname(destination);

  try {
    await access(destination);
    throw new ReusableTemplateExistsError(
      `A reusable template named ${name} already exists.`,
    );
  } catch (error) {
    if (error instanceof ReusableTemplateExistsError) throw error;
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const temporaryPath = path.join(
    directory,
    `.${path.basename(destination)}.${randomUUID()}.tmp`,
  );
  await mkdir(directory, { recursive: true });

  try {
    await writeFile(temporaryPath, `${JSON.stringify(template, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    await rename(temporaryPath, destination);
  } finally {
    await rm(temporaryPath, { force: true });
  }

  return template;
}
