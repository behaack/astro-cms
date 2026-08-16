import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import homeDocumentJson from "../../content/pages/home.json";
import { requireNodeByType } from "./document-test-helpers";
import { saveLocalImageUpload } from "./local-asset-store";
import { listLocalImageAssetsWithUsage } from "./local-asset-usage";
import { writeLocalPageDocument } from "./local-page-store";
import { createReusableTemplate } from "./local-template-store";
import { assertPageDocument } from "./validation";

const temporaryDirectories: string[] = [];
const validPng = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
]);

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("local image usage", () => {
  it("reports page and reusable-template usage for managed uploads", async () => {
    const projectDirectory = await mkdtemp(
      path.join(tmpdir(), "astro-cms-asset-usage-"),
    );
    temporaryDirectories.push(projectDirectory);
    const publicDirectory = path.join(projectDirectory, "public");
    const contentDirectory = path.join(projectDirectory, "content", "pages");
    const templateDirectory = path.join(
      projectDirectory,
      "content",
      "templates",
    );
    await Promise.all([
      mkdir(publicDirectory, { recursive: true }),
      mkdir(contentDirectory, { recursive: true }),
      mkdir(templateDirectory, { recursive: true }),
    ]);
    await writeFile(
      path.join(publicDirectory, "developer-logo.svg"),
      "<svg />",
      "utf8",
    );
    const asset = await saveLocalImageUpload(
      { fileName: "Campaign.png", bytes: validPng },
      { publicDirectory },
    );

    const page = structuredClone(assertPageDocument(homeDocumentJson));
    const stack = requireNodeByType(page, "Stack");
    stack.children ??= [];
    stack.children.push({
      id: "page-image",
      type: "Image",
      props: { src: asset.publicPath, alt: "Campaign", aspect: "landscape" },
    });
    await writeLocalPageDocument(page, { contentDirectory });
    await createReusableTemplate(
      {
        name: "Image block",
        root: {
          id: "template-image",
          type: "Image",
          props: {
            src: asset.publicPath,
            alt: "Campaign",
            aspect: "square",
          },
        },
      },
      { templateDirectory },
    );

    await expect(
      listLocalImageAssetsWithUsage({
        publicDirectory,
        contentDirectory,
        templateDirectory,
      }),
    ).resolves.toEqual([
      {
        publicPath: "/developer-logo.svg",
        fileName: "developer-logo.svg",
        extension: "svg",
        managedUpload: false,
        usages: [],
      },
      {
        publicPath: "/uploads/campaign.png",
        fileName: "campaign.png",
        extension: "png",
        managedUpload: true,
        usages: [
          { kind: "page", id: "/", label: page.title },
          { kind: "template", id: "image-block", label: "Image block" },
        ],
      },
    ]);
  });
});
