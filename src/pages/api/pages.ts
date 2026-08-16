import type { APIRoute } from "astro";

import {
  createLocalPageDocument,
  InvalidPageDetailsError,
  InvalidPageRouteError,
  listLocalPageDocuments,
  PageAlreadyExistsError,
} from "../../cms/local-page-store";

const MAX_REQUEST_BYTES = 32 * 1024;

export const prerender = false;

export const GET: APIRoute = async () => {
  try {
    const pages = await listLocalPageDocuments();
    return Response.json(
      { ok: true, pages },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return Response.json(
      { ok: false, message: "The project page list could not be read." },
      { status: 500 },
    );
  }
};

export const POST: APIRoute = async ({ request }) => {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_REQUEST_BYTES) {
    return Response.json(
      { ok: false, message: "Page details are too large." },
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
    !("route" in body) ||
    typeof body.route !== "string" ||
    !("title" in body) ||
    typeof body.title !== "string" ||
    ("description" in body && typeof body.description !== "string")
  ) {
    return Response.json(
      { ok: false, message: "Page path and title are required." },
      { status: 400 },
    );
  }
  try {
    const pageInput = body as {
      route: string;
      title: string;
      description?: string;
    };
    const document = await createLocalPageDocument({
      route: pageInput.route,
      title: pageInput.title,
      ...(typeof pageInput.description === "string"
        ? { description: pageInput.description }
        : {}),
    });
    return Response.json({ ok: true, document }, { status: 201 });
  } catch (error) {
    if (error instanceof PageAlreadyExistsError) {
      return Response.json(
        { ok: false, message: error.message },
        { status: 409 },
      );
    }
    if (
      error instanceof InvalidPageRouteError ||
      error instanceof InvalidPageDetailsError
    ) {
      return Response.json(
        { ok: false, message: error.message },
        { status: 422 },
      );
    }
    return Response.json(
      { ok: false, message: "The page could not be created." },
      { status: 500 },
    );
  }
};
