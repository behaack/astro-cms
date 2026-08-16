import type { APIRoute } from "astro";

import {
  createLocalPageDocument,
  InvalidPageDetailsError,
  InvalidPageRouteError,
  listLocalPageDocuments,
  PageAlreadyExistsError,
} from "../../cms/local-page-store";
import {
  HomePageRemovalError,
  LocalPageInUseError,
  LocalPageRemovalError,
  removeLocalPage,
  type LocalPageRemovalResult,
} from "../../cms/local-page-publisher";
import {
  HomePageRenameError,
  LocalPageRenameError,
  PageRenameDestinationError,
  renameLocalPage,
  type LocalPageRenameResult,
} from "../../cms/local-page-renamer";
import {
  LocalPublicationInProgressError,
  withLocalPublicationLock,
} from "../../cms/local-publication-lock";

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

export const DELETE: APIRoute = async ({ request }) => {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_REQUEST_BYTES) {
    return Response.json(
      { ok: false, message: "Page removal details are too large." },
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
    typeof body.route !== "string"
  ) {
    return Response.json(
      { ok: false, message: "Choose a page to remove." },
      { status: 400 },
    );
  }
  const route = body.route;

  try {
    const result: LocalPageRemovalResult = await withLocalPublicationLock(
      "Page removal",
      () => removeLocalPage(route),
    );
    return Response.json({
      ok: true,
      route: result.route,
      title: result.title,
      filePath: result.filePath,
      tracked: result.tracked,
      ...(result.commit
        ? { commit: result.commit, shortCommit: result.shortCommit }
        : {}),
      message: result.shortCommit
        ? `Removed ${result.title} in Git commit ${result.shortCommit}. Pushing and deployment are not connected.`
        : `Removed the unpublished page ${result.title}.`,
    });
  } catch (error) {
    if (error instanceof LocalPageInUseError) {
      return Response.json(
        { ok: false, message: error.message, usages: error.usages },
        { status: 409 },
      );
    }
    const message =
      error instanceof LocalPageRemovalError ||
      error instanceof LocalPublicationInProgressError
        ? error.message
        : "The page could not be removed.";
    const status =
      error instanceof HomePageRemovalError
        ? 422
        : error instanceof LocalPageRemovalError ||
            error instanceof LocalPublicationInProgressError
          ? 409
          : 500;
    return Response.json({ ok: false, message }, { status });
  }
};

export const PATCH: APIRoute = async ({ request }) => {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_REQUEST_BYTES) {
    return Response.json(
      { ok: false, message: "Page rename details are too large." },
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
    !("newRoute" in body) ||
    typeof body.newRoute !== "string"
  ) {
    return Response.json(
      { ok: false, message: "Current and new page paths are required." },
      { status: 400 },
    );
  }
  const route = body.route;
  const newRoute = body.newRoute;

  try {
    const result: LocalPageRenameResult = await withLocalPublicationLock(
      "Page rename",
      () => renameLocalPage(route, newRoute),
    );
    const linkSummary = `${result.updatedLinks} internal ${result.updatedLinks === 1 ? "link" : "links"}`;
    return Response.json({
      ok: true,
      fromRoute: result.fromRoute,
      toRoute: result.toRoute,
      title: result.title,
      tracked: result.tracked,
      updatedLinks: result.updatedLinks,
      updatedDocuments: result.updatedDocuments,
      ...(result.commit
        ? { commit: result.commit, shortCommit: result.shortCommit }
        : {}),
      message: result.shortCommit
        ? `Renamed ${result.title} to ${result.toRoute} and updated ${linkSummary} in Git commit ${result.shortCommit}. Pushing and deployment are not connected.`
        : `Renamed the unpublished page ${result.title} to ${result.toRoute} and updated ${linkSummary}.`,
    });
  } catch (error) {
    const message =
      error instanceof InvalidPageRouteError ||
      error instanceof LocalPageRenameError ||
      error instanceof LocalPublicationInProgressError
        ? error.message
        : "The page could not be renamed.";
    const status =
      error instanceof InvalidPageRouteError ||
      error instanceof HomePageRenameError
        ? 422
        : error instanceof PageRenameDestinationError ||
            error instanceof LocalPageRenameError ||
            error instanceof LocalPublicationInProgressError
          ? 409
          : 500;
    return Response.json({ ok: false, message }, { status });
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
