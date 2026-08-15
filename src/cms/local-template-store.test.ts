import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { cloneComponentNodeWithFreshIds } from "./composition";
import {
  createReusableTemplate,
  listReusableTemplates,
  ReusableTemplateExistsError,
  templateIdForName,
} from "./local-template-store";
import type { ComponentNode } from "./document-types";
import { validateComponentSubtree } from "./validation";

const temporaryDirectories: string[] = [];

async function createTemporaryTemplateDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "astro-cms-templates-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

const campaignCta: ComponentNode = {
  id: "template-section",
  type: "Section",
  props: { tone: "brand", width: "wide" },
  children: [
    {
      id: "template-stack",
      type: "Stack",
      props: { gap: "medium", align: "center" },
      children: [
        {
          id: "template-heading",
          type: "Heading",
          props: { text: "Ready to begin?", level: 2 },
        },
        {
          id: "template-button",
          type: "Button",
          props: {
            label: "Contact us",
            href: "/contact",
            appearance: "secondary",
          },
        },
      ],
    },
  ],
};

describe("local reusable template store", () => {
  it("creates and lists a readable copy-based template", async () => {
    const templateDirectory = await createTemporaryTemplateDirectory();

    const created = await createReusableTemplate(
      { name: "Campaign CTA", root: campaignCta },
      { templateDirectory },
    );

    expect(created.id).toBe("campaign-cta");
    expect(await listReusableTemplates({ templateDirectory })).toEqual([
      created,
    ]);
    expect(
      await readFile(path.join(templateDirectory, "campaign-cta.json"), "utf8"),
    ).toContain('"name": "Campaign CTA"');
  });

  it("prevents an accidental overwrite of an existing template", async () => {
    const templateDirectory = await createTemporaryTemplateDirectory();
    await createReusableTemplate(
      { name: "Campaign CTA", root: campaignCta },
      { templateDirectory },
    );

    await expect(
      createReusableTemplate(
        { name: "Campaign CTA", root: campaignCta },
        { templateDirectory },
      ),
    ).rejects.toBeInstanceOf(ReusableTemplateExistsError);
  });

  it("inserts copies with fresh identities and unchanged structure", () => {
    let nextId = 0;
    const inserted = cloneComponentNodeWithFreshIds(
      campaignCta,
      () => `inserted-${++nextId}`,
    );

    expect(inserted.id).toBe("inserted-1");
    expect(inserted.children?.[0].id).toBe("inserted-2");
    expect(inserted.children?.[0].children?.[0].id).toBe("inserted-3");
    expect(inserted.props).toEqual(campaignCta.props);
    expect(validateComponentSubtree(inserted)).toEqual([]);
  });

  it("accepts a valid non-page-root subtree and rejects invalid descendants", async () => {
    const templateDirectory = await createTemporaryTemplateDirectory();
    const stack = campaignCta.children![0];

    await expect(
      createReusableTemplate(
        { name: "Centered CTA contents", root: stack },
        { templateDirectory },
      ),
    ).resolves.toMatchObject({ id: "centered-cta-contents", root: stack });

    const invalid = structuredClone(stack);
    invalid.children![0].children = [
      { id: "invalid-child", type: "Text", props: { text: "No" } },
    ];
    await expect(
      createReusableTemplate(
        { name: "Invalid", root: invalid },
        { templateDirectory },
      ),
    ).rejects.toThrow("Heading cannot contain child components.");
  });

  it("creates stable Git-safe identifiers from names", () => {
    expect(templateIdForName("  Crème brûlée CTA!  ")).toBe("creme-brulee-cta");
  });
});
