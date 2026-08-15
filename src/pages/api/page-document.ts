import type { APIRoute } from "astro";

import {
  readLocalPageDocument,
  writeLocalPageDocument,
} from "../../cms/local-page-store";
import { validatePageDocument } from "../../cms/validation";

const MAX_REQUEST_BYTES = 512 * 1024;

export const prerender = false;

export const GET: APIRoute = async () => {
  try {
    const document = await readLocalPageDocument("/");
    return Response.json(
      { ok: true, document },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return Response.json(
      { ok: false, message: "The project page file could not be read." },
      { status: 500 },
    );
  }
};

export const PUT: APIRoute = async ({ request }) => {
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
    const document = await writeLocalPageDocument(body.document);
    return Response.json(
      { ok: true, document },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return Response.json(
      { ok: false, message: "The project page file could not be saved." },
      { status: 500 },
    );
  }
};
