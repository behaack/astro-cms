import type { PageDocument } from "./document-types";
import { assertPageDocument, validatePageDocument } from "./validation";

const DRAFT_LIFETIME_MS = 30 * 60 * 1000;

export interface LivePreviewDraft {
  id: string;
  document: PageDocument;
  revision: number;
  updatedAt: number;
}

export type SaveLivePreviewResult =
  | { ok: true; draft: LivePreviewDraft }
  | {
      ok: false;
      issues: ReturnType<typeof validatePageDocument>;
    };

const drafts = new Map<string, LivePreviewDraft>();

function cloneDraft(draft: LivePreviewDraft): LivePreviewDraft {
  return structuredClone(draft);
}

function removeExpiredDrafts(now: number): void {
  for (const [id, draft] of drafts) {
    if (now - draft.updatedAt > DRAFT_LIFETIME_MS) {
      drafts.delete(id);
    }
  }
}

export function saveLivePreviewDraft(
  input: unknown,
  existingId?: string,
  now = Date.now(),
): SaveLivePreviewResult {
  const issues = validatePageDocument(input);
  if (issues.length > 0) {
    return { ok: false, issues };
  }

  removeExpiredDrafts(now);

  const document = assertPageDocument(input);
  const existingDraft = existingId ? drafts.get(existingId) : undefined;
  const id = existingDraft?.id ?? crypto.randomUUID();
  const draft: LivePreviewDraft = {
    id,
    document: structuredClone(document),
    revision: (existingDraft?.revision ?? 0) + 1,
    updatedAt: now,
  };

  drafts.set(id, draft);
  return { ok: true, draft: cloneDraft(draft) };
}

export function getLivePreviewDraft(
  id: string,
  now = Date.now(),
): LivePreviewDraft | undefined {
  const draft = drafts.get(id);
  if (!draft) return undefined;

  if (now - draft.updatedAt > DRAFT_LIFETIME_MS) {
    drafts.delete(id);
    return undefined;
  }

  return cloneDraft(draft);
}

export function clearLivePreviewDrafts(): void {
  drafts.clear();
}
