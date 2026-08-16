import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import homeDocumentJson from "../../content/pages/home.json";
import type { PageDocument } from "./document-types";
import {
  createLocalPageDocument,
  writeLocalPageDocument,
} from "./local-page-store";
import { findLocalPageRouteUsages } from "./local-page-usage";
import { createReusableTemplate } from "./local-template-store";
import { assertPageDocument } from "./validation";

const temporaryDirectories: string[] = [];
const initialDocument = assertPageDocument(homeDocumentJson);

function pageWithButton(
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
            props: { label: "Continue", href, appearance: "primary" },
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

describe("local page route usage", () => {
  it("reports incoming links from pages and reusable templates", async () => {
    const projectDirectory = await mkdtemp(
      path.join(tmpdir(), "astro-cms-page-usage-"),
    );
    temporaryDirectories.push(projectDirectory);
    const contentDirectory = path.join(projectDirectory, "content", "pages");
    const templateDirectory = path.join(
      projectDirectory,
      "content",
      "templates",
    );
    await Promise.all([
      mkdir(contentDirectory, { recursive: true }),
      mkdir(templateDirectory, { recursive: true }),
    ]);
    await writeLocalPageDocument(initialDocument, { contentDirectory });
    const target = await createLocalPageDocument(
      { route: "/campaigns/target", title: "Target" },
      { contentDirectory },
    );
    await writeLocalPageDocument(
      pageWithButton(target, "self", "/campaigns/target"),
      { contentDirectory },
    );
    const source = await createLocalPageDocument(
      { route: "/campaigns/source", title: "Source" },
      { contentDirectory },
    );
    await writeLocalPageDocument(
      pageWithButton(
        source,
        "source",
        "/campaigns/target?campaign=summer#details",
      ),
      { contentDirectory },
    );
    await createReusableTemplate(
      {
        name: "Target CTA",
        root: {
          id: "template-button",
          type: "Button",
          props: {
            label: "Target",
            href: "/campaigns/target",
            appearance: "secondary",
          },
        },
      },
      { templateDirectory },
    );

    await expect(
      findLocalPageRouteUsages("/campaigns/target", {
        contentDirectory,
        templateDirectory,
      }),
    ).resolves.toEqual([
      { kind: "page", id: "/campaigns/source", label: "Source" },
      { kind: "template", id: "target-cta", label: "Target CTA" },
    ]);
  });
});
