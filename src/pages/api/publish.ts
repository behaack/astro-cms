import type { APIRoute } from "astro";

import {
  AstroBuildError,
  publishLocalProject,
  type LocalPublishResult,
} from "../../cms/local-publisher";
import { validatePageDocument } from "../../cms/validation";

const MAX_REQUEST_BYTES = 512 * 1024;
let activePublication: Promise<LocalPublishResult> | undefined;

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  if (activePublication) {
    return Response.json(
      { ok: false, message: "A production build is already running." },
      { status: 409 },
    );
  }

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

  if (!body || typeof body !== "object" || !("document" in body)) {
    return Response.json(
      { ok: false, message: "Request must include a document." },
      { status: 400 },
    );
  }

  const issues = validatePageDocument(body.document);
  if (issues.length > 0) {
    return Response.json({ ok: false, issues }, { status: 422 });
  }

  try {
    activePublication = publishLocalProject(body.document);
    const result = await activePublication;
    return Response.json({
      ok: true,
      document: result.document,
      message: "Publishable Astro production build created in dist/.",
    });
  } catch (error) {
    const message =
      error instanceof AstroBuildError
        ? error.message
        : "The page could not be published.";
    return Response.json({ ok: false, message }, { status: 500 });
  } finally {
    activePublication = undefined;
  }
};
