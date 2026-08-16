import type { APIRoute } from "astro";

import {
  GitPublishingError,
  reviewLocalPageDocument,
} from "../../cms/git-publisher";
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
  if (!body || typeof body !== "object" || !("document" in body)) {
    return Response.json(
      { ok: false, message: "Request must include a document." },
      { status: 400 },
    );
  }

  const document = body.document;
  const issues = validatePageDocument(document);
  if (issues.length > 0) {
    return Response.json({ ok: false, issues }, { status: 422 });
  }

  try {
    const review = await reviewLocalPageDocument(document);
    return Response.json(
      { ok: true, review },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    const message =
      error instanceof GitPublishingError
        ? error.message
        : "The Git change review could not be created.";
    return Response.json({ ok: false, message }, { status: 409 });
  }
};
