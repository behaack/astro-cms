import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";

import { componentDefinitions } from "./component-definitions";
import { referencedPageImagePaths } from "./asset-references";
import type {
  ComponentNode,
  PageDocument,
  PropertyValue,
} from "./document-types";
import {
  readLocalPageSnapshot,
  restoreLocalPageSource,
  serializePageDocument,
  writeLocalPageDocument,
  type LocalPageStoreOptions,
} from "./local-page-store";
import {
  LocalAssetStoreError,
  resolveLocalUploadedImagePath,
  type LocalAssetStoreOptions,
} from "./local-asset-store";
import { buildAstroProject, type LocalBuildResult } from "./local-publisher";
import { assertPageDocument } from "./validation";

const MAX_GIT_OUTPUT = 128 * 1024;
const MAX_DIFF_LINES = 400;

interface GitCommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

interface GitPageContext {
  repositoryRoot: string;
  relativeFilePath: string;
  baselineSource?: string;
  tracked: boolean;
}

interface GitAssetContext {
  publicPath: string;
  relativeFilePath: string;
  revision: string;
  tracked: boolean;
}

export interface PageChange {
  kind: "page" | "asset" | "added" | "removed" | "changed" | "moved";
  summary: string;
}

export interface LocalPageChangeReview {
  baseRevision: string;
  filePath: string;
  assetFiles: string[];
  hasChanges: boolean;
  changes: PageChange[];
  diff: string;
}

export interface GitPublishResult {
  document: PageDocument;
  build: LocalBuildResult;
  commit: string;
  shortCommit: string;
  filePath: string;
  assetFiles: string[];
}

export interface GitPublishOptions
  extends LocalPageStoreOptions, LocalAssetStoreOptions {
  projectDirectory?: string;
  build?: () => Promise<LocalBuildResult>;
}

export class GitPublishingError extends Error {}
export class StalePageRevisionError extends GitPublishingError {}
export class NoPageChangesError extends GitPublishingError {}

async function runGit(
  args: string[],
  workingDirectory: string,
): Promise<GitCommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      cwd: workingDirectory,
      env: { ...process.env, NO_COLOR: "1" },
      shell: false,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    const capture = (current: string, chunk: Buffer): string =>
      `${current}${chunk.toString("utf8")}`.slice(-MAX_GIT_OUTPUT);
    child.stdout.on("data", (chunk: Buffer) => {
      stdout = capture(stdout, chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = capture(stderr, chunk);
    });
    child.on("error", (error) => {
      reject(
        new GitPublishingError(
          error.message.includes("ENOENT")
            ? "Git is not installed or is not available to Astro-CMS."
            : `Git could not start: ${error.message}`,
        ),
      );
    });
    child.on("close", (code) => {
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}

function gitFailure(
  result: GitCommandResult,
  fallback: string,
): GitPublishingError {
  const detail = result.stderr.trim() || result.stdout.trim();
  return new GitPublishingError(detail ? `${fallback} ${detail}` : fallback);
}

function isWithinDirectory(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

async function gitPageContext(
  filePath: string,
  projectDirectory: string,
): Promise<GitPageContext> {
  const rootResult = await runGit(
    ["rev-parse", "--show-toplevel"],
    projectDirectory,
  );
  if (rootResult.code !== 0) {
    throw new GitPublishingError(
      "This project is not in a Git repository. Create an initial commit before publishing.",
    );
  }
  const repositoryRoot = path.resolve(rootResult.stdout.trim());
  const resolvedFilePath = path.resolve(filePath);
  if (!isWithinDirectory(repositoryRoot, resolvedFilePath)) {
    throw new GitPublishingError(
      "The editable page file is outside this project's Git repository.",
    );
  }
  const relativeFilePath = path
    .relative(repositoryRoot, resolvedFilePath)
    .replaceAll("\\", "/");

  const headResult = await runGit(
    ["rev-parse", "--verify", "HEAD"],
    repositoryRoot,
  );
  if (headResult.code !== 0) {
    throw new GitPublishingError(
      "This repository has no initial commit. Commit the website once before publishing from Astro-CMS.",
    );
  }
  const stagedResult = await runGit(
    ["diff", "--cached", "--quiet", "--", relativeFilePath],
    repositoryRoot,
  );
  if (stagedResult.code === 1) {
    throw new GitPublishingError(
      "The page file already has staged Git changes. Commit or unstage them before publishing from Astro-CMS.",
    );
  }
  if (stagedResult.code !== 0) {
    throw gitFailure(
      stagedResult,
      "Git could not inspect the staged page file.",
    );
  }

  const trackedResult = await runGit(
    ["ls-files", "--error-unmatch", "--", relativeFilePath],
    repositoryRoot,
  );
  if (trackedResult.code !== 0 && trackedResult.code !== 1) {
    throw gitFailure(trackedResult, "Git could not inspect the page file.");
  }
  const tracked = trackedResult.code === 0;
  let baselineSource: string | undefined;
  if (tracked) {
    const baselineResult = await runGit(
      ["show", `HEAD:${relativeFilePath}`],
      repositoryRoot,
    );
    if (baselineResult.code !== 0) {
      throw gitFailure(
        baselineResult,
        "Git could not read the committed page.",
      );
    }
    try {
      assertPageDocument(JSON.parse(baselineResult.stdout));
    } catch {
      throw new GitPublishingError(
        "The committed page file is not a compatible Astro-CMS document.",
      );
    }
    baselineSource = baselineResult.stdout;
  }

  return {
    repositoryRoot,
    relativeFilePath,
    baselineSource,
    tracked,
  };
}

function displayValue(value: PropertyValue | undefined): string {
  if (value === undefined) return "not set";
  const serialized = typeof value === "string" ? value : String(value);
  const shortened =
    serialized.length > 70 ? `${serialized.slice(0, 67)}…` : serialized;
  return `“${shortened}”`;
}

function nodeName(node: ComponentNode): string {
  const label = componentDefinitions[node.type].label;
  const detail = node.props.text ?? node.props.label;
  return typeof detail === "string" && detail.trim()
    ? `${label} ${displayValue(detail.trim())}`
    : label;
}

interface FlatNode {
  node: ComponentNode;
  parentId: string;
  index: number;
}

function flattenNodes(document: PageDocument): Map<string, FlatNode> {
  const nodes = new Map<string, FlatNode>();
  const visit = (
    node: ComponentNode,
    parentId: string,
    index: number,
  ): void => {
    nodes.set(node.id, { node, parentId, index });
    node.children?.forEach((child, childIndex) =>
      visit(child, node.id, childIndex),
    );
  };
  document.content.forEach((node, index) => visit(node, "page", index));
  return nodes;
}

async function gitAssetContexts(
  document: PageDocument,
  repositoryRoot: string,
  projectDirectory: string,
  options: GitPublishOptions,
): Promise<GitAssetContext[]> {
  const contexts: GitAssetContext[] = [];
  const publicDirectory =
    options.publicDirectory ?? path.join(projectDirectory, "public");

  for (const publicPath of referencedPageImagePaths(document).filter(
    (candidate) => candidate.startsWith("/uploads/"),
  )) {
    let filePath: string | undefined;
    try {
      filePath = resolveLocalUploadedImagePath(publicPath, { publicDirectory });
    } catch (error) {
      if (error instanceof LocalAssetStoreError) {
        throw new GitPublishingError(error.message);
      }
      throw error;
    }
    if (!filePath || !isWithinDirectory(repositoryRoot, filePath)) {
      throw new GitPublishingError(
        `Uploaded image ${publicPath} is outside this project's Git repository.`,
      );
    }
    const relativeFilePath = path
      .relative(repositoryRoot, filePath)
      .replaceAll("\\", "/");
    let bytes: Buffer;
    try {
      const fileInfo = await lstat(filePath);
      if (!fileInfo.isFile() || fileInfo.isSymbolicLink()) {
        throw new GitPublishingError(
          `Uploaded image ${publicPath} must be a regular file, not a link.`,
        );
      }
      const realFilePath = await realpath(filePath);
      if (!isWithinDirectory(repositoryRoot, realFilePath)) {
        throw new GitPublishingError(
          `Uploaded image ${publicPath} resolves outside this project's Git repository.`,
        );
      }
      bytes = await readFile(filePath);
    } catch (error) {
      if (error instanceof GitPublishingError) throw error;
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new GitPublishingError(
          `Uploaded image ${publicPath} is missing. Choose or upload it again before publishing.`,
        );
      }
      throw error;
    }

    const stagedResult = await runGit(
      ["diff", "--cached", "--quiet", "--", relativeFilePath],
      repositoryRoot,
    );
    if (stagedResult.code === 1) {
      throw new GitPublishingError(
        `Uploaded image ${publicPath} already has staged Git changes. Commit or unstage them before publishing from Astro-CMS.`,
      );
    }
    if (stagedResult.code !== 0) {
      throw gitFailure(
        stagedResult,
        "Git could not inspect the uploaded image.",
      );
    }

    const trackedResult = await runGit(
      ["ls-files", "--error-unmatch", "--", relativeFilePath],
      repositoryRoot,
    );
    if (trackedResult.code !== 0 && trackedResult.code !== 1) {
      throw gitFailure(
        trackedResult,
        "Git could not inspect the uploaded image.",
      );
    }
    const tracked = trackedResult.code === 0;
    if (tracked) {
      const modifiedResult = await runGit(
        ["diff", "--quiet", "--", relativeFilePath],
        repositoryRoot,
      );
      if (modifiedResult.code === 1) {
        throw new GitPublishingError(
          `Uploaded image ${publicPath} has unpublished file changes outside this page review. Commit or restore them first.`,
        );
      }
      if (modifiedResult.code !== 0) {
        throw gitFailure(
          modifiedResult,
          "Git could not inspect the uploaded image.",
        );
      }
    } else {
      const ignoredResult = await runGit(
        ["check-ignore", "--quiet", "--", relativeFilePath],
        repositoryRoot,
      );
      if (ignoredResult.code === 0) {
        throw new GitPublishingError(
          `Uploaded image ${publicPath} is ignored by Git and cannot be published.`,
        );
      }
      if (ignoredResult.code !== 1) {
        throw gitFailure(
          ignoredResult,
          "Git could not inspect the uploaded image.",
        );
      }
    }

    contexts.push({
      publicPath,
      relativeFilePath,
      revision: createHash("sha256").update(bytes).digest("hex"),
      tracked,
    });
  }
  return contexts;
}

function publicationRevision(
  pageRevision: string,
  assets: GitAssetContext[],
): string {
  const hash = createHash("sha256").update(pageRevision);
  for (const asset of assets) {
    hash
      .update("\0")
      .update(asset.relativeFilePath)
      .update("\0")
      .update(asset.revision);
  }
  return hash.digest("hex");
}

function semanticChanges(
  before: PageDocument,
  after: PageDocument,
): PageChange[] {
  const changes: PageChange[] = [];
  if (before.title !== after.title) {
    changes.push({
      kind: "page",
      summary: `Changed the page title from ${displayValue(before.title)} to ${displayValue(after.title)}.`,
    });
  }
  if (before.description !== after.description) {
    changes.push({
      kind: "page",
      summary: `Changed the page description from ${displayValue(before.description)} to ${displayValue(after.description)}.`,
    });
  }
  const seoFields = [
    { key: "title", label: "search title" },
    { key: "description", label: "search description" },
    { key: "socialImage", label: "social image" },
    { key: "socialImageAlt", label: "social image alternative text" },
    { key: "searchVisibility", label: "search visibility" },
  ] as const;
  for (const field of seoFields) {
    const oldValue = before.seo?.[field.key];
    const newValue = after.seo?.[field.key];
    if (oldValue === newValue) continue;
    changes.push({
      kind: "page",
      summary: `Changed the ${field.label} from ${displayValue(oldValue)} to ${displayValue(newValue)}.`,
    });
  }

  const beforeNodes = flattenNodes(before);
  const afterNodes = flattenNodes(after);
  for (const [id, previous] of beforeNodes) {
    if (!afterNodes.has(id)) {
      changes.push({
        kind: "removed",
        summary: `Removed ${nodeName(previous.node)}.`,
      });
    }
  }
  for (const [id, current] of afterNodes) {
    const previous = beforeNodes.get(id);
    if (!previous) {
      changes.push({
        kind: "added",
        summary: `Added ${nodeName(current.node)}.`,
      });
      continue;
    }
    if (
      previous.parentId !== current.parentId ||
      previous.index !== current.index
    ) {
      changes.push({
        kind: "moved",
        summary: `Moved ${nodeName(current.node)}.`,
      });
    }
    const propertyNames = new Set([
      ...Object.keys(previous.node.props),
      ...Object.keys(current.node.props),
    ]);
    for (const propertyName of [...propertyNames].sort()) {
      const oldValue = previous.node.props[propertyName];
      const newValue = current.node.props[propertyName];
      if (Object.is(oldValue, newValue)) continue;
      const propertyLabel =
        componentDefinitions[current.node.type].properties[propertyName]
          ?.label ?? propertyName;
      changes.push({
        kind: "changed",
        summary: `Changed ${componentDefinitions[current.node.type].label} ${propertyLabel.toLowerCase()} from ${displayValue(oldValue)} to ${displayValue(newValue)}.`,
      });
    }
  }
  return changes;
}

function unifiedDiff(
  beforeSource: string,
  afterSource: string,
  filePath: string,
): string {
  if (beforeSource === afterSource) return "";
  const before = beforeSource.replace(/\n$/, "").split("\n");
  const after = afterSource.replace(/\n$/, "").split("\n");
  let prefix = 0;
  while (
    prefix < before.length &&
    prefix < after.length &&
    before[prefix] === after[prefix]
  ) {
    prefix += 1;
  }
  let suffix = 0;
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  const contextStart = Math.max(0, prefix - 3);
  const beforeEnd = Math.min(before.length, before.length - suffix + 3);
  const afterEnd = Math.min(after.length, after.length - suffix + 3);
  const removed = before.slice(prefix, before.length - suffix);
  const added = after.slice(prefix, after.length - suffix);
  const lines = [
    `--- a/${filePath}`,
    `+++ b/${filePath}`,
    `@@ -${contextStart + 1},${beforeEnd - contextStart} +${contextStart + 1},${afterEnd - contextStart} @@`,
    ...before.slice(contextStart, prefix).map((line) => ` ${line}`),
    ...removed.map((line) => `-${line}`),
    ...added.map((line) => `+${line}`),
    ...after.slice(after.length - suffix, afterEnd).map((line) => ` ${line}`),
  ];
  if (lines.length <= MAX_DIFF_LINES) return `${lines.join("\n")}\n`;
  return `${lines.slice(0, MAX_DIFF_LINES).join("\n")}\n… diff shortened …\n`;
}

export async function reviewLocalPageDocument(
  input: unknown,
  options: GitPublishOptions = {},
): Promise<LocalPageChangeReview> {
  const document = assertPageDocument(input);
  const projectDirectory = path.resolve(
    options.projectDirectory ?? process.cwd(),
  );
  const current = await readLocalPageSnapshot(document.route, options);
  const git = await gitPageContext(current.filePath, projectDirectory);
  const assets = await gitAssetContexts(
    document,
    git.repositoryRoot,
    projectDirectory,
    options,
  );
  const prospectiveSource = serializePageDocument(document);
  const changes: PageChange[] = git.baselineSource
    ? semanticChanges(
        assertPageDocument(JSON.parse(git.baselineSource)),
        document,
      )
    : [
        {
          kind: "added" as const,
          summary: `Added page ${displayValue(document.title)} at ${document.route}.`,
        },
      ];
  changes.push(
    ...assets
      .filter((asset) => !asset.tracked)
      .map((asset) => ({
        kind: "asset" as const,
        summary: `Added uploaded image ${asset.publicPath}.`,
      })),
  );
  const assetFiles = assets
    .filter((asset) => !asset.tracked)
    .map((asset) => asset.relativeFilePath);
  return {
    baseRevision: publicationRevision(current.revision, assets),
    filePath: git.relativeFilePath,
    assetFiles,
    hasChanges:
      git.baselineSource !== prospectiveSource || assetFiles.length > 0,
    changes,
    diff: unifiedDiff(
      git.baselineSource ?? "",
      prospectiveSource,
      git.relativeFilePath,
    ),
  };
}

export async function publishGitProject(
  input: unknown,
  baseRevision: string,
  options: GitPublishOptions = {},
): Promise<GitPublishResult> {
  const document = assertPageDocument(input);
  const projectDirectory = path.resolve(
    options.projectDirectory ?? process.cwd(),
  );
  const current = await readLocalPageSnapshot(document.route, options);
  const review = await reviewLocalPageDocument(document, options);
  if (review.baseRevision !== baseRevision) {
    throw new StalePageRevisionError(
      "The saved page changed after this review. Review the latest version before publishing.",
    );
  }
  if (!review.hasChanges) {
    throw new NoPageChangesError("There are no unpublished page changes.");
  }
  const git = await gitPageContext(current.filePath, projectDirectory);
  let committed = false;
  let attemptedToStagePublishFiles = false;
  const filesToStage = [
    ...(!git.tracked ? [git.relativeFilePath] : []),
    ...review.assetFiles,
  ];
  const filesToCommit = [git.relativeFilePath, ...review.assetFiles];
  try {
    await writeLocalPageDocument(document, options);
    const build = await (
      options.build ?? (() => buildAstroProject(projectDirectory))
    )();
    if (filesToStage.length > 0) {
      attemptedToStagePublishFiles = true;
      const addResult = await runGit(
        ["add", "--", ...filesToStage],
        git.repositoryRoot,
      );
      if (addResult.code !== 0) {
        throw gitFailure(
          addResult,
          "Git could not stage the page publication.",
        );
      }
    }
    const commitResult = await runGit(
      [
        "commit",
        "--only",
        "-m",
        `content: publish ${document.route}`,
        "--",
        ...filesToCommit,
      ],
      git.repositoryRoot,
    );
    if (commitResult.code !== 0) {
      throw gitFailure(commitResult, "Git could not commit the page.");
    }
    committed = true;
    const headResult = await runGit(["rev-parse", "HEAD"], git.repositoryRoot);
    if (headResult.code !== 0) {
      throw gitFailure(headResult, "Git could not read the new commit.");
    }
    const commit = headResult.stdout.trim();
    return {
      document,
      build,
      commit,
      shortCommit: commit.slice(0, 7),
      filePath: git.relativeFilePath,
      assetFiles: review.assetFiles,
    };
  } catch (error) {
    if (!committed) {
      if (attemptedToStagePublishFiles) {
        await runGit(
          ["reset", "--quiet", "--", ...filesToStage],
          git.repositoryRoot,
        );
      }
      await restoreLocalPageSource(document.route, current.source, options);
    }
    throw error;
  }
}
