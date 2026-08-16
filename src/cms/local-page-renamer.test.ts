import { spawn } from "node:child_process";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import homeDocumentJson from "../../content/pages/home.json";
import type { PageDocument } from "./document-types";
import {
  createLocalPageDocument,
  localPageFilePath,
  readLocalPageDocument,
  writeLocalPageDocument,
} from "./local-page-store";
import {
  HomePageRenameError,
  PageRenameDestinationError,
  renameLocalPage,
} from "./local-page-renamer";
import {
  createReusableTemplate,
  listReusableTemplates,
} from "./local-template-store";
import { assertPageDocument } from "./validation";

const temporaryDirectories: string[] = [];
const initialDocument = assertPageDocument(homeDocumentJson);

async function runGit(args: string[], directory: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      cwd: directory,
      shell: false,
      windowsHide: true,
    });
    let output = "";
    let error = "";
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      error += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(error || `git exited with ${code}`));
    });
  });
}

async function createGitProject() {
  const projectDirectory = await mkdtemp(
    path.join(tmpdir(), "astro-cms-page-rename-"),
  );
  temporaryDirectories.push(projectDirectory);
  const contentDirectory = path.join(projectDirectory, "content", "pages");
  const templateDirectory = path.join(projectDirectory, "content", "templates");
  await Promise.all([
    mkdir(contentDirectory, { recursive: true }),
    mkdir(templateDirectory, { recursive: true }),
  ]);
  await writeLocalPageDocument(initialDocument, { contentDirectory });
  await runGit(["init"], projectDirectory);
  await runGit(["config", "user.name", "Astro-CMS Test"], projectDirectory);
  await runGit(
    ["config", "user.email", "astro-cms@example.invalid"],
    projectDirectory,
  );
  await runGit(["add", "content/pages/home.json"], projectDirectory);
  await runGit(["commit", "-m", "initial website"], projectDirectory);
  return { projectDirectory, contentDirectory, templateDirectory };
}

function renameOptions(project: Awaited<ReturnType<typeof createGitProject>>) {
  return {
    ...project,
    build: vi.fn(async () => ({ output: "build complete" })),
  };
}

function withButton(
  document: PageDocument,
  id: string,
  href: string,
): PageDocument {
  return {
    ...document,
    content: [
      {
        id: `${id}-section`,
        type: "Section",
        props: { tone: "plain", width: "wide" },
        children: [
          {
            id: `${id}-button`,
            type: "Button",
            props: { label: "Open", href, appearance: "primary" },
          },
        ],
      },
    ],
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("local page rename publishing", () => {
  it("renames an unpublished page and updates saved page and template links", async () => {
    const project = await createGitProject();
    const options = renameOptions(project);
    const draft = await createLocalPageDocument(
      { route: "/draft", title: "Draft" },
      project,
    );
    await writeLocalPageDocument(
      withButton(draft, "self", "/draft?source=self#details"),
      project,
    );
    const landing = await createLocalPageDocument(
      { route: "/landing", title: "Landing" },
      project,
    );
    await writeLocalPageDocument(
      withButton(landing, "landing", "/draft#details"),
      project,
    );
    await createReusableTemplate(
      {
        name: "Draft CTA",
        root: withButton(draft, "template", "/draft?source=template")
          .content[0],
      },
      project,
    );

    const result = await renameLocalPage("/draft", "/campaigns/draft", options);

    expect(result).toMatchObject({
      fromRoute: "/draft",
      toRoute: "/campaigns/draft",
      tracked: false,
      updatedLinks: 3,
      updatedDocuments: 2,
    });
    expect(options.build).not.toHaveBeenCalled();
    await expect(
      access(localPageFilePath("/draft", project)),
    ).rejects.toThrow();
    const renamed = await readLocalPageDocument("/campaigns/draft", project);
    expect(renamed.content[0].children?.[0].props.href).toBe(
      "/campaigns/draft?source=self#details",
    );
    expect(
      (await readLocalPageDocument("/landing", project)).content[0]
        .children?.[0].props.href,
    ).toBe("/campaigns/draft#details");
    expect(
      (await listReusableTemplates(project))[0].root.children?.[0].props.href,
    ).toBe("/campaigns/draft?source=template");
  });

  it("builds and commits a tracked rename while preserving unrelated staging", async () => {
    const project = await createGitProject();
    const options = renameOptions(project);
    const campaign = await createLocalPageDocument(
      { route: "/campaigns/summer", title: "Summer" },
      project,
    );
    await writeLocalPageDocument(
      withButton(initialDocument, "home", "/campaigns/summer?from=home"),
      project,
    );
    await runGit(
      ["add", "content/pages/home.json", "content/pages/campaigns/summer.json"],
      project.projectDirectory,
    );
    await runGit(["commit", "-m", "publish summer"], project.projectDirectory);
    await writeFile(
      path.join(project.projectDirectory, "unrelated.txt"),
      "keep staged\n",
      "utf8",
    );
    await runGit(["add", "unrelated.txt"], project.projectDirectory);

    const result = await renameLocalPage(
      campaign.route,
      "/campaigns/autumn",
      options,
    );

    expect(result.tracked).toBe(true);
    expect(result.shortCommit).toHaveLength(7);
    expect(result.updatedLinks).toBe(1);
    expect(options.build).toHaveBeenCalledOnce();
    const committedFiles = await runGit(
      ["show", "--pretty=format:", "--name-status", "HEAD"],
      project.projectDirectory,
    );
    expect(committedFiles).toContain("content/pages/campaigns/summer.json");
    expect(committedFiles).toContain("content/pages/campaigns/autumn.json");
    expect(committedFiles).toContain("content/pages/home.json");
    await expect(
      runGit(["diff", "--cached", "--name-only"], project.projectDirectory),
    ).resolves.toContain("unrelated.txt");
    expect(
      (await readLocalPageDocument("/", project)).content[0].children?.[0].props
        .href,
    ).toBe("/campaigns/autumn?from=home");
  });

  it("never renames the homepage or replaces another page", async () => {
    const project = await createGitProject();
    await createLocalPageDocument(
      { route: "/existing", title: "Existing" },
      project,
    );
    await createLocalPageDocument({ route: "/draft", title: "Draft" }, project);

    await expect(
      renameLocalPage("/", "/new-home", project),
    ).rejects.toBeInstanceOf(HomePageRenameError);
    await expect(
      renameLocalPage("/draft", "/existing", project),
    ).rejects.toBeInstanceOf(PageRenameDestinationError);
  });

  it("restores every changed document when the production build fails", async () => {
    const project = await createGitProject();
    const target = await createLocalPageDocument(
      { route: "/target", title: "Target" },
      project,
    );
    const source = await createLocalPageDocument(
      { route: "/source", title: "Source" },
      project,
    );
    await writeLocalPageDocument(
      withButton(source, "source", "/target#cta"),
      project,
    );
    await createReusableTemplate(
      {
        name: "Target CTA",
        root: withButton(target, "template", "/target?from=template")
          .content[0],
      },
      project,
    );
    await runGit(["add", "content"], project.projectDirectory);
    await runGit(["commit", "-m", "publish target"], project.projectDirectory);
    const sourceBefore = await readFile(
      localPageFilePath("/source", project),
      "utf8",
    );
    const templatePath = path.join(
      project.templateDirectory,
      "target-cta.json",
    );
    const templateBefore = await readFile(templatePath, "utf8");
    const options = {
      ...project,
      build: vi.fn(async () => {
        throw new Error("build failed");
      }),
    };

    await expect(
      renameLocalPage("/target", "/renamed", options),
    ).rejects.toThrow("build failed");

    await expect(
      readLocalPageDocument("/target", project),
    ).resolves.toMatchObject({
      route: "/target",
      title: "Target",
    });
    await expect(
      access(localPageFilePath("/renamed", project)),
    ).rejects.toThrow();
    await expect(
      readFile(localPageFilePath("/source", project), "utf8"),
    ).resolves.toBe(sourceBefore);
    await expect(readFile(templatePath, "utf8")).resolves.toBe(templateBefore);
    await expect(
      runGit(["log", "-1", "--pretty=%s"], project.projectDirectory),
    ).resolves.toBe("publish target\n");
  });

  it("refuses to rewrite a file that already has staged changes", async () => {
    const project = await createGitProject();
    await createLocalPageDocument(
      { route: "/target", title: "Target" },
      project,
    );
    const source = await createLocalPageDocument(
      { route: "/source", title: "Source" },
      project,
    );
    await writeLocalPageDocument(
      withButton(source, "source", "/target"),
      project,
    );
    await runGit(["add", "content"], project.projectDirectory);
    await runGit(["commit", "-m", "publish pages"], project.projectDirectory);
    await writeLocalPageDocument(
      withButton(source, "source", "/target#staged"),
      project,
    );
    await runGit(
      ["add", "content/pages/source.json"],
      project.projectDirectory,
    );

    await expect(
      renameLocalPage("/target", "/renamed", project),
    ).rejects.toThrow("already has staged Git changes");
    await expect(
      readLocalPageDocument("/target", project),
    ).resolves.toMatchObject({
      route: "/target",
    });
  });
});
