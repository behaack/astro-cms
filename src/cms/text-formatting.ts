import type { TextFormat } from "./document-types";

export const textMarks = ["bold", "italic", "underline"] as const;
export type TextMark = (typeof textMarks)[number];
export type TextMarks = Pick<TextFormat, "bold" | "italic" | "underline">;

export function textMarksAt(
  formats: TextFormat[],
  position: number,
): TextMarks {
  const range =
    formats.find((range) => range.start < position && range.end >= position) ??
    formats.find((range) => range.start === position);
  return Object.fromEntries(
    textMarks.filter((mark) => range?.[mark]).map((mark) => [mark, true]),
  );
}

export function replaceFormattedText(
  text: string,
  formats: TextFormat[],
  start: number,
  end: number,
  insertion: string,
  marks: TextMarks,
) {
  start = Math.max(0, Math.min(text.length, start));
  end = Math.max(start, Math.min(text.length, end));
  const next = text.slice(0, start) + insertion + text.slice(end);
  const delta = insertion.length - (end - start);
  const ranges: TextFormat[] = [];
  for (const range of normalizeTextFormats(text.length, formats)) {
    if (range.start < start)
      ranges.push({ ...range, end: Math.min(range.end, start) });
    if (range.end > end)
      ranges.push({
        ...range,
        start: Math.max(range.start, end) + delta,
        end: range.end + delta,
      });
  }
  if (insertion.length)
    ranges.push({ start, end: start + insertion.length, ...marks });
  return { text: next, formats: normalizeTextFormats(next.length, ranges) };
}

/** Canonical, non-overlapping ranges; offsets use JavaScript string positions. */
export function normalizeTextFormats(
  length: number,
  formats: TextFormat[] = [],
): TextFormat[] {
  const valid = formats.filter(
    (range) =>
      Number.isInteger(range.start) &&
      Number.isInteger(range.end) &&
      range.start >= 0 &&
      range.end > range.start &&
      range.end <= length,
  );
  const points = [
    ...new Set(valid.flatMap((range) => [range.start, range.end])),
  ].sort((a, b) => a - b);
  const result: TextFormat[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i],
      end = points[i + 1];
    const marks = Object.fromEntries(
      textMarks
        .filter((mark) =>
          valid.some(
            (range) =>
              range.start <= start && range.end >= end && range[mark] === true,
          ),
        )
        .map((mark) => [mark, true]),
    );
    if (!Object.keys(marks).length) continue;
    const previous = result.at(-1);
    if (
      previous?.end === start &&
      textMarks.every((mark) => previous[mark] === marks[mark])
    )
      previous.end = end;
    else result.push({ start, end, ...marks });
  }
  return result;
}

export function hasTextMark(
  formats: TextFormat[],
  start: number,
  end: number,
  mark: TextMark,
): boolean {
  if (end <= start) return false;
  let covered = start;
  for (const range of formats) {
    if (range.end <= covered) continue;
    if (range.start > covered || !range[mark]) return false;
    covered = Math.max(covered, range.end);
    if (covered >= end) return true;
  }
  return false;
}

export function changeTextMark(
  text: string,
  formats: TextFormat[],
  start: number,
  end: number,
  mark?: TextMark,
): TextFormat[] {
  start = Math.max(0, Math.min(text.length, start));
  end = Math.max(start, Math.min(text.length, end));
  const current = normalizeTextFormats(text.length, formats);
  // A toolbar click without selected words formats the existing text block.
  if (mark && start === end && text.length) {
    start = 0;
    end = text.length;
  }
  if (start === end) return current;
  const remove = mark ? hasTextMark(current, start, end, mark) : true;
  const points = [
    ...new Set([
      0,
      text.length,
      start,
      end,
      ...current.flatMap((range) => [range.start, range.end]),
    ]),
  ].sort((a, b) => a - b);
  const result: TextFormat[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i],
      to = points[i + 1];
    const existing = current.find(
      (range) => range.start <= from && range.end >= to,
    );
    const next: TextFormat = { ...existing, start: from, end: to };
    if (from >= start && to <= end) {
      if (!mark) textMarks.forEach((key) => delete next[key]);
      else if (remove) delete next[mark];
      else next[mark] = true;
    }
    result.push(next);
  }
  return normalizeTextFormats(text.length, result);
}

function escapedText(text: string): string {
  return text
    .replace(
      /[&<>"']/g,
      (character) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[character]!,
    )
    .replace(/\n/g, "<br>");
}

/** Emits escaped text and only the three supported semantic inline tags. */
export function formattedTextHtml(
  text: string,
  formats?: TextFormat[],
): string {
  let cursor = 0;
  let html = "";
  for (const range of normalizeTextFormats(text.length, formats)) {
    html += escapedText(text.slice(cursor, range.start));
    let part = escapedText(text.slice(range.start, range.end));
    if (range.underline) part = `<u>${part}</u>`;
    if (range.italic) part = `<em>${part}</em>`;
    if (range.bold) part = `<strong>${part}</strong>`;
    html += part;
    cursor = range.end;
  }
  return html + escapedText(text.slice(cursor));
}
