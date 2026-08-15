import type { APIRoute } from "astro";

import {
  createReusableTemplate,
  listReusableTemplates,
  ReusableTemplateExistsError,
} from "../../cms/local-template-store";

const MAX_REQUEST_BYTES = 256 * 1024;

export const prerender = false;

export const GET: APIRoute = async () => {
  try {
    const templates = await listReusableTemplates();
    return Response.json(
      { ok: true, templates },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return Response.json(
      { ok: false, message: "Reusable templates could not be read." },
      { status: 500 },
    );
  }
};

export const POST: APIRoute = async ({ request }) => {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_REQUEST_BYTES) {
    return Response.json(
      { ok: false, message: "Reusable template is too large." },
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
    !("name" in body) ||
    !("root" in body) ||
    typeof body.name !== "string"
  ) {
    return Response.json(
      { ok: false, message: "Template name and root component are required." },
      { status: 400 },
    );
  }

  try {
    const template = await createReusableTemplate({
      name: body.name,
      root: body.root as never,
    });
    return Response.json({ ok: true, template }, { status: 201 });
  } catch (error) {
    if (error instanceof ReusableTemplateExistsError) {
      return Response.json(
        { ok: false, message: error.message },
        { status: 409 },
      );
    }

    const message =
      error instanceof Error ? error.message : "Reusable template is invalid.";
    return Response.json({ ok: false, message }, { status: 422 });
  }
};
