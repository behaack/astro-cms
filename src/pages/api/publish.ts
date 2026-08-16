import type { APIRoute } from "astro";

import {
  GitPublishingError,
  NoPageChangesError,
  publishGitProject,
  StalePageRevisionError,
  type GitPublishResult,
} from "../../cms/git-publisher";
import {
  LocalPublicationInProgressError,
  withLocalPublicationLock,
} from "../../cms/local-publication-lock";
import { validatePageDocument } from "../../cms/validation";

const MAX_REQUEST_BYTES = 512 * 1024;

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_REQUEST_BYTES) {
    return Response.json(
      { ok: false, message: "Page document is too large." },
      { status: 413 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { ok: false, message: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  if (
    !body ||
    typeof body !== "object" ||
    !("document" in body) ||
    !("baseRevision" in body) ||
    typeof body.baseRevision !== "string"
  ) {
    return Response.json(
      {
        ok: false,
        message: "Request must include a document and its reviewed revision.",
      },
      { status: 400 },
    );
  }

  const issues = validatePageDocument(body.document);
  if (issues.length > 0) {
    return Response.json({ ok: false, issues }, { status: 422 });
  }
  const document = body.document;
  const baseRevision = body.baseRevision;

  try {
    const result: GitPublishResult = await withLocalPublicationLock(
      "Page publishing",
      () => publishGitProject(document, baseRevision),
    );
    return Response.json({
      ok: true,
      document: result.document,
      commit: result.commit,
      shortCommit: result.shortCommit,
      filePath: result.filePath,
      assetFiles: result.assetFiles,
      message: `Published as Git commit ${result.shortCommit}. The production build is ready; pushing and deployment are not connected.`,
    });
  } catch (error) {
    const message =
      error instanceof GitPublishingError ||
      error instanceof LocalPublicationInProgressError
        ? error.message
        : "The page could not be published.";
    const status =
      error instanceof StalePageRevisionError ||
      error instanceof LocalPublicationInProgressError
        ? 409
        : error instanceof NoPageChangesError
          ? 422
          : 500;
    return Response.json({ ok: false, message }, { status });
  }
};
