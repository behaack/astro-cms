import { spawn } from "node:child_process";
import {
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import {
  localPageFilePath,
  normalizePageRoute,
  readAllLocalPageSnapshots,
  readLocalPageSnapshot,
  serializePageDocument,
  type LocalPageStoreOptions,
} from "./local-page-store";
import { buildAstroProject, type LocalBuildResult } from "./local-publisher";
import {
  listReusableTemplateSnapshots,
  serializeReusableTemplate,
  type LocalTemplateStoreOptions,
} from "./local-template-store";
import { rewriteInternalPageRouteReferences } from "./page-references";

const MAX_GIT_OUTPUT = 128 * 1024;

interface GitCommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

interface FileRewrite {
  kind: "page" | "template";
  id: string;
  label: string;
  filePath: string;
  source: string;
  nextSource: string;
  replacements: number;
  relativeFilePath: string;
  tracked: boolean;
}

export interface LocalPageRenameOptions
  extends LocalPageStoreOptions, LocalTemplateStoreOptions {
  projectDirectory?: string;
  build?: () => Promise<LocalBuildResult>;
}

export interface LocalPageRenameResult {
  fromRoute: string;
  toRoute: string;
  title: string;
  tracked: boolean;
  updatedLinks: number;
  updatedDocuments: number;
  commit?: string;
  shortCommit?: string;
  build?: LocalBuildResult;
}

export class LocalPageRenameError extends Error {}
export class HomePageRenameError extends LocalPageRenameError {}
export class PageRenameDestinationError extends LocalPageRenameError {}

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
        new LocalPageRenameError(
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
): LocalPageRenameError {
  const detail = result.stderr.trim() || result.stdout.trim();
  return new LocalPageRenameError(detail ? `${fallback} ${detail}` : fallback);
}

function isWithinDirectory(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await lstat(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function assertRegularRepositoryFile(
  filePath: string,
  repositoryRoot: string,
): Promise<void> {
  const fileInfo = await lstat(filePath);
  if (!fileInfo.isFile() || fileInfo.isSymbolicLink()) {
    throw new LocalPageRenameError(
      "Every page and template changed by a rename must be a regular file, not a link.",
    );
  }
  const realFilePath = await realpath(filePath);
  if (
    !isWithinDirectory(repositoryRoot, path.resolve(filePath)) ||
    !isWithinDirectory(repositoryRoot, realFilePath)
  ) {
    throw new LocalPageRenameError(
      "A page or template changed by this rename is outside the project's Git repository.",
    );
  }
}

async function assertDestinationWithinRepository(
  filePath: string,
  repositoryRoot: string,
): Promise<void> {
  let existingAncestor = path.dirname(filePath);
  while (!(await pathExists(existingAncestor))) {
    const parent = path.dirname(existingAncestor);
    if (parent === existingAncestor) break;
    existingAncestor = parent;
  }
  const realAncestor = await realpath(existingAncestor);
  if (!isWithinDirectory(repositoryRoot, realAncestor)) {
    throw new LocalPageRenameError(
      "The renamed page would be written through a directory outside this project's Git repository.",
    );
  }
}

async function replaceFileAtomically(
  filePath: string,
  source: string,
): Promise<void> {
  const directory = path.dirname(filePath);
  const temporaryPath = path.join(
    directory,
    `.${path.basename(filePath)}.${randomUUID()}.tmp`,
  );
  await mkdir(directory, { recursive: true });
  try {
    await writeFile(temporaryPath, source, { encoding: "utf8", flag: "wx" });
    await rename(temporaryPath, filePath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

async function createFileExclusively(
  filePath: string,
  source: string,
): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  try {
    await writeFile(filePath, source, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new PageRenameDestinationError(
        "A page already exists at the new path.",
      );
    }
    throw error;
  }
}

async function assertSourceUnchanged(rewrite: FileRewrite): Promise<void> {
  if ((await readFile(rewrite.filePath, "utf8")) !== rewrite.source) {
    throw new LocalPageRenameError(
      `${rewrite.kind === "page" ? "Page" : "Template"} “${rewrite.label}” changed while the rename was being checked. Try again.`,
    );
  }
}

async function rollbackRename(
  sourceFilePath: string,
  source: string,
  destinationFilePath: string,
  destinationSource: string,
  rewrites: FileRewrite[],
): Promise<string[]> {
  const conflicts: string[] = [];

  if (await pathExists(sourceFilePath)) {
    if ((await readFile(sourceFilePath, "utf8")) !== source) {
      conflicts.push(sourceFilePath);
    }
  } else {
    try {
      await createFileExclusively(sourceFilePath, source);
    } catch {
      conflicts.push(sourceFilePath);
    }
  }

  for (const rewrite of rewrites) {
    try {
      if ((await readFile(rewrite.filePath, "utf8")) === rewrite.nextSource) {
        await replaceFileAtomically(rewrite.filePath, rewrite.source);
      } else if (
        (await readFile(rewrite.filePath, "utf8")) !== rewrite.source
      ) {
        conflicts.push(rewrite.filePath);
      }
    } catch {
      conflicts.push(rewrite.filePath);
    }
  }

  if (await pathExists(destinationFilePath)) {
    try {
      if ((await readFile(destinationFilePath, "utf8")) === destinationSource) {
        await unlink(destinationFilePath);
      } else {
        conflicts.push(destinationFilePath);
      }
    } catch {
      conflicts.push(destinationFilePath);
    }
  }

  return [...new Set(conflicts)];
}

export async function renameLocalPage(
  fromRouteInput: string,
  toRouteInput: string,
  options: LocalPageRenameOptions = {},
): Promise<LocalPageRenameResult> {
  const fromRoute = normalizePageRoute(fromRouteInput);
  const toRoute = normalizePageRoute(toRouteInput);
  if (fromRoute === "/" || toRoute === "/") {
    throw new HomePageRenameError(
      "The homepage path cannot be renamed or replaced.",
    );
  }
  if (fromRoute === toRoute) {
    throw new LocalPageRenameError(
      "Choose a different path for the renamed page.",
    );
  }

  const sourceSnapshot = await readLocalPageSnapshot(fromRoute, options);
  const destinationFilePath = localPageFilePath(toRoute, options);
  if (await pathExists(destinationFilePath)) {
    throw new PageRenameDestinationError(
      `A page already exists at ${toRoute}. Choose another path.`,
    );
  }

  const projectDirectory = path.resolve(
    options.projectDirectory ?? process.cwd(),
  );
  const rootResult = await runGit(
    ["rev-parse", "--show-toplevel"],
    projectDirectory,
  );
  if (rootResult.code !== 0) {
    throw new LocalPageRenameError(
      "This project is not in a Git repository. Create an initial commit before managing pages.",
    );
  }
  const repositoryRoot = path.resolve(rootResult.stdout.trim());
  if (!isWithinDirectory(repositoryRoot, path.resolve(destinationFilePath))) {
    throw new LocalPageRenameError(
      "The renamed page would be outside this project's Git repository.",
    );
  }
  await assertDestinationWithinRepository(destinationFilePath, repositoryRoot);
  const headResult = await runGit(
    ["rev-parse", "--verify", "HEAD"],
    repositoryRoot,
  );
  if (headResult.code !== 0) {
    throw new LocalPageRenameError(
      "This repository has no initial commit. Commit the website once before managing pages.",
    );
  }

  const [pageSnapshots, templateSnapshots] = await Promise.all([
    readAllLocalPageSnapshots(options),
    listReusableTemplateSnapshots(options),
  ]);
  const sourcePage = pageSnapshots.find(
    (snapshot) => snapshot.document.route === fromRoute,
  );
  if (!sourcePage || sourcePage.source !== sourceSnapshot.source) {
    throw new LocalPageRenameError(
      "The page changed while the rename was being prepared. Try again.",
    );
  }

  const sourceRewrite = rewriteInternalPageRouteReferences(
    sourceSnapshot.document.content,
    fromRoute,
    toRoute,
  );
  const destinationSource = serializePageDocument({
    ...sourceSnapshot.document,
    route: toRoute,
    content: sourceRewrite.nodes,
  });
  const pendingRewrites = [
    ...pageSnapshots.flatMap((snapshot) => {
      if (snapshot.document.route === fromRoute) return [];
      const rewritten = rewriteInternalPageRouteReferences(
        snapshot.document.content,
        fromRoute,
        toRoute,
      );
      if (rewritten.replacements === 0) return [];
      return [
        {
          kind: "page" as const,
          id: snapshot.document.route,
          label: snapshot.document.title,
          filePath: snapshot.filePath,
          source: snapshot.source,
          nextSource: serializePageDocument({
            ...snapshot.document,
            content: rewritten.nodes,
          }),
          replacements: rewritten.replacements,
        },
      ];
    }),
    ...templateSnapshots.flatMap((snapshot) => {
      const rewritten = rewriteInternalPageRouteReferences(
        [snapshot.template.root],
        fromRoute,
        toRoute,
      );
      if (rewritten.replacements === 0) return [];
      return [
        {
          kind: "template" as const,
          id: snapshot.template.id,
          label: snapshot.template.name,
          filePath: snapshot.filePath,
          source: snapshot.source,
          nextSource: serializeReusableTemplate({
            ...snapshot.template,
            root: rewritten.nodes[0],
          }),
          replacements: rewritten.replacements,
        },
      ];
    }),
  ];

  const existingFilePaths = [
    sourceSnapshot.filePath,
    ...pendingRewrites.map((rewrite) => rewrite.filePath),
  ];
  await Promise.all(
    existingFilePaths.map((filePath) =>
      assertRegularRepositoryFile(filePath, repositoryRoot),
    ),
  );

  const destinationRelativePath = path
    .relative(repositoryRoot, destinationFilePath)
    .replaceAll("\\", "/");
  const sourceRelativePath = path
    .relative(repositoryRoot, sourceSnapshot.filePath)
    .replaceAll("\\", "/");
  const destinationTrackedResult = await runGit(
    ["ls-files", "--error-unmatch", "--", destinationRelativePath],
    repositoryRoot,
  );
  if (destinationTrackedResult.code === 0) {
    throw new PageRenameDestinationError(
      `Git already contains ${toRoute}, even though its file is missing. Restore or commit that change before renaming here.`,
    );
  }
  if (destinationTrackedResult.code !== 1) {
    throw gitFailure(
      destinationTrackedResult,
      "Git could not inspect the new page path.",
    );
  }

  const inspectedPaths = [
    sourceRelativePath,
    destinationRelativePath,
    ...pendingRewrites.map((rewrite) =>
      path.relative(repositoryRoot, rewrite.filePath).replaceAll("\\", "/"),
    ),
  ];
  for (const relativeFilePath of [...new Set(inspectedPaths)]) {
    const stagedResult = await runGit(
      ["diff", "--cached", "--quiet", "--", relativeFilePath],
      repositoryRoot,
    );
    if (stagedResult.code === 1) {
      throw new LocalPageRenameError(
        `The rename would change ${relativeFilePath}, which already has staged Git changes. Commit or unstage them first.`,
      );
    }
    if (stagedResult.code !== 0) {
      throw gitFailure(stagedResult, "Git could not inspect the rename files.");
    }
  }

  const trackedByPath = new Map<string, boolean>();
  for (const relativeFilePath of [
    sourceRelativePath,
    ...inspectedPaths.slice(2),
  ]) {
    if (trackedByPath.has(relativeFilePath)) continue;
    const trackedResult = await runGit(
      ["ls-files", "--error-unmatch", "--", relativeFilePath],
      repositoryRoot,
    );
    if (trackedResult.code !== 0 && trackedResult.code !== 1) {
      throw gitFailure(
        trackedResult,
        "Git could not inspect the rename files.",
      );
    }
    trackedByPath.set(relativeFilePath, trackedResult.code === 0);
  }
  const rewrites: FileRewrite[] = pendingRewrites.map((rewrite) => {
    const relativeFilePath = path
      .relative(repositoryRoot, rewrite.filePath)
      .replaceAll("\\", "/");
    return {
      ...rewrite,
      relativeFilePath,
      tracked: trackedByPath.get(relativeFilePath) ?? false,
    };
  });
  const tracked = [...trackedByPath.values()].some(Boolean);
  const updatedLinks =
    sourceRewrite.replacements +
    rewrites.reduce((total, rewrite) => total + rewrite.replacements, 0);

  await assertSourceUnchanged({
    kind: "page",
    id: fromRoute,
    label: sourceSnapshot.document.title,
    filePath: sourceSnapshot.filePath,
    source: sourceSnapshot.source,
    nextSource: destinationSource,
    replacements: sourceRewrite.replacements,
    relativeFilePath: sourceRelativePath,
    tracked: trackedByPath.get(sourceRelativePath) ?? false,
  });
  await Promise.all(rewrites.map((rewrite) => assertSourceUnchanged(rewrite)));
  if (await pathExists(destinationFilePath)) {
    throw new PageRenameDestinationError(
      `A page appeared at ${toRoute} while the rename was being checked. Nothing was changed.`,
    );
  }

  let mutated = false;
  let staged = false;
  let committed = false;
  try {
    for (const rewrite of rewrites) {
      await assertSourceUnchanged(rewrite);
      await replaceFileAtomically(rewrite.filePath, rewrite.nextSource);
      mutated = true;
    }
    await createFileExclusively(destinationFilePath, destinationSource);
    mutated = true;
    if (
      (await readFile(sourceSnapshot.filePath, "utf8")) !==
      sourceSnapshot.source
    ) {
      throw new LocalPageRenameError(
        "The page changed while the new path was being written. The rename was cancelled.",
      );
    }
    await unlink(sourceSnapshot.filePath);

    if (!tracked) {
      return {
        fromRoute,
        toRoute,
        title: sourceSnapshot.document.title,
        tracked: false,
        updatedLinks,
        updatedDocuments: rewrites.length,
      };
    }

    const build = await (
      options.build ?? (() => buildAstroProject(projectDirectory))
    )();
    if (await pathExists(sourceSnapshot.filePath)) {
      throw new LocalPageRenameError(
        "The old page path was recreated while the rename was being checked.",
      );
    }
    if ((await readFile(destinationFilePath, "utf8")) !== destinationSource) {
      throw new LocalPageRenameError(
        "The renamed page changed during the production build. The rename was not committed.",
      );
    }
    for (const rewrite of rewrites) {
      if ((await readFile(rewrite.filePath, "utf8")) !== rewrite.nextSource) {
        throw new LocalPageRenameError(
          `${rewrite.kind === "page" ? "Page" : "Template"} “${rewrite.label}” changed during the production build. The rename was not committed.`,
        );
      }
    }

    const commitPaths = [...new Set(inspectedPaths)];
    staged = true;
    const addResult = await runGit(
      ["add", "-A", "--", ...commitPaths],
      repositoryRoot,
    );
    if (addResult.code !== 0) {
      throw gitFailure(addResult, "Git could not prepare the page rename.");
    }
    const commitResult = await runGit(
      [
        "commit",
        "--only",
        "-m",
        `content: rename ${fromRoute} to ${toRoute}`,
        "--",
        ...commitPaths,
      ],
      repositoryRoot,
    );
    if (commitResult.code !== 0) {
      throw gitFailure(commitResult, "Git could not commit the page rename.");
    }
    committed = true;
    const newHeadResult = await runGit(["rev-parse", "HEAD"], repositoryRoot);
    if (newHeadResult.code !== 0) {
      throw gitFailure(newHeadResult, "Git could not read the new commit.");
    }
    const commit = newHeadResult.stdout.trim();
    return {
      fromRoute,
      toRoute,
      title: sourceSnapshot.document.title,
      tracked: true,
      updatedLinks,
      updatedDocuments: rewrites.length,
      commit,
      shortCommit: commit.slice(0, 7),
      build,
    };
  } catch (error) {
    let resetFailure: LocalPageRenameError | undefined;
    if (staged && !committed) {
      const resetResult = await runGit(
        ["reset", "--quiet", "HEAD", "--", ...[...new Set(inspectedPaths)]],
        repositoryRoot,
      );
      if (resetResult.code !== 0) {
        resetFailure = gitFailure(
          resetResult,
          "The rename failed and Git could not restore the affected index entries.",
        );
      }
    }
    if (mutated && !committed) {
      const conflicts = await rollbackRename(
        sourceSnapshot.filePath,
        sourceSnapshot.source,
        destinationFilePath,
        destinationSource,
        rewrites,
      );
      if (conflicts.length > 0) {
        throw new LocalPageRenameError(
          `The rename failed and concurrent changes prevented complete recovery of: ${conflicts
            .map((filePath) =>
              path.relative(repositoryRoot, filePath).replaceAll("\\", "/"),
            )
            .join(", ")}. Review those files before trying again.`,
        );
      }
    }
    if (resetFailure) throw resetFailure;
    throw error;
  }
}
