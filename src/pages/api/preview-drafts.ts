import type { APIRoute } from "astro";

import { saveLivePreviewDraft } from "../../cms/live-preview-store";

const MAX_REQUEST_BYTES = 512 * 1024;

export const POST: APIRoute = async ({ request }) => {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_REQUEST_BYTES) {
    return Response.json(
      { ok: false, message: "Preview document is too large." },
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

  const draftId =
    "draftId" in body && typeof body.draftId === "string"
      ? body.draftId
      : undefined;
  const result = saveLivePreviewDraft(body.document, draftId);

  if (!result.ok) {
    return Response.json({ ok: false, issues: result.issues }, { status: 422 });
  }

  return Response.json(
    {
      ok: true,
      draftId: result.draft.id,
      revision: result.draft.revision,
      previewUrl: `/preview/live/${result.draft.id}`,
    },
    {
      status: draftId ? 200 : 201,
      headers: {
        "cache-control": "no-store",
      },
    },
  );
};
