import type { APIRoute } from "astro";

import {
  LocalAssetStoreError,
  MAX_LOCAL_IMAGE_UPLOAD_BYTES,
  saveLocalImageUpload,
} from "../../cms/local-asset-store";
import {
  LocalAssetInUseError,
  LocalAssetRemovalError,
  removeUnusedLocalImageAsset,
  type LocalAssetRemovalResult,
} from "../../cms/local-asset-publisher";
import { listLocalImageAssetsWithUsage } from "../../cms/local-asset-usage";
import {
  LocalPublicationInProgressError,
  withLocalPublicationLock,
} from "../../cms/local-publication-lock";
import { validatePageDocument } from "../../cms/validation";

export const prerender = false;

export const GET: APIRoute = async () => {
  try {
    const assets = await listLocalImageAssetsWithUsage();
    return Response.json(
      { ok: true, assets },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return Response.json(
      { ok: false, message: "Project images could not be read." },
      { status: 500 },
    );
  }
};

export const DELETE: APIRoute = async ({ request }) => {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 512 * 1024) {
    return Response.json(
      { ok: false, message: "Image removal details are too large." },
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
    !("publicPath" in body) ||
    typeof body.publicPath !== "string" ||
    !("document" in body)
  ) {
    return Response.json(
      {
        ok: false,
        message: "Image removal requires its public path and the active page.",
      },
      { status: 400 },
    );
  }
  const issues = validatePageDocument(body.document);
  if (issues.length > 0) {
    return Response.json({ ok: false, issues }, { status: 422 });
  }
  const publicPath = body.publicPath;
  const document = body.document;

  try {
    const result: LocalAssetRemovalResult = await withLocalPublicationLock(
      "Image removal",
      () => removeUnusedLocalImageAsset(publicPath, document),
    );
    return Response.json({
      ok: true,
      publicPath: result.publicPath,
      filePath: result.filePath,
      tracked: result.tracked,
      ...(result.commit
        ? { commit: result.commit, shortCommit: result.shortCommit }
        : {}),
      message: result.shortCommit
        ? `Removed the image in Git commit ${result.shortCommit}. Pushing and deployment are not connected.`
        : "Removed the unpublished image.",
    });
  } catch (error) {
    if (error instanceof LocalAssetInUseError) {
      return Response.json(
        { ok: false, message: error.message, usages: error.usages },
        { status: 409 },
      );
    }
    const message =
      error instanceof LocalAssetRemovalError ||
      error instanceof LocalPublicationInProgressError
        ? error.message
        : "The image could not be removed.";
    return Response.json({ ok: false, message }, { status: 409 });
  }
};

export const POST: APIRoute = async ({ request }) => {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_LOCAL_IMAGE_UPLOAD_BYTES + 64 * 1024) {
    return Response.json(
      { ok: false, message: "Images must be 8 MB or smaller." },
      { status: 413 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json(
      { ok: false, message: "Upload one image using multipart form data." },
      { status: 400 },
    );
  }
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return Response.json(
      { ok: false, message: "Choose an image to upload." },
      { status: 400 },
    );
  }
  if (file.size > MAX_LOCAL_IMAGE_UPLOAD_BYTES) {
    return Response.json(
      { ok: false, message: "Images must be 8 MB or smaller." },
      { status: 413 },
    );
  }

  try {
    const asset = await saveLocalImageUpload({
      fileName: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
    return Response.json(
      { ok: true, asset },
      { status: 201, headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    const message =
      error instanceof LocalAssetStoreError
        ? error.message
        : "The image could not be saved.";
    return Response.json({ ok: false, message }, { status: 422 });
  }
};
