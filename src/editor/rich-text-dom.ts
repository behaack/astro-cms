import { normalizeTextFormats } from "../cms/text-formatting";
import type { TextFormat } from "../cms/document-types";

export interface TextSelection {
  start: number;
  end: number;
}

export function readFormattedText(root: HTMLElement): {
  text: string;
  formats: TextFormat[];
} {
  if (
    root.isContentEditable &&
    root.childNodes.length === 1 &&
    root.firstChild?.nodeName === "BR"
  )
    return { text: "", formats: [] };
  let text = "";
  const formats: TextFormat[] = [];
  const visit = (
    node: Node,
    marks: Pick<TextFormat, "bold" | "italic" | "underline">,
  ) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const start = text.length;
      text += node.textContent ?? "";
      if (text.length > start && Object.keys(marks).length)
        formats.push({ start, end: text.length, ...marks });
      return;
    }
    if (node.nodeType !== 1) return;
    const element = node as HTMLElement;
    if (element.tagName === "BR") {
      if (element.hasAttribute("data-cms-caret")) return;
      text += "\n";
      return;
    }
    const next = { ...marks };
    if (["B", "STRONG"].includes(element.tagName)) next.bold = true;
    if (["I", "EM"].includes(element.tagName)) next.italic = true;
    if (element.tagName === "U") next.underline = true;
    if (
      node !== root &&
      ["DIV", "P"].includes(element.tagName) &&
      text &&
      !text.endsWith("\n")
    )
      text += "\n";
    node.childNodes.forEach((child) => visit(child, next));
  };
  visit(root, {});
  return { text, formats: normalizeTextFormats(text.length, formats) };
}

export function readTextSelection(
  root: HTMLElement,
): TextSelection | undefined {
  const selection = root.ownerDocument.getSelection();
  if (
    !selection?.rangeCount ||
    !root.contains(selection.anchorNode) ||
    !root.contains(selection.focusNode)
  )
    return;
  const range = selection.getRangeAt(0);
  const length = (node: Node): number => {
    if (node.nodeType === 3) return node.textContent?.length ?? 0;
    if (node.nodeName === "BR")
      return (node as Element).hasAttribute("data-cms-caret") ? 0 : 1;
    return [...node.childNodes].reduce(
      (total, child) => total + length(child),
      0,
    );
  };
  const offsetAt = (container: Node, offset: number): number => {
    let total =
      container.nodeType === 3
        ? offset
        : [...container.childNodes]
            .slice(0, offset)
            .reduce((sum, node) => sum + length(node), 0);
    let node: Node = container;
    while (node !== root && node.parentNode) {
      let previous = node.previousSibling;
      while (previous) {
        total += length(previous);
        previous = previous.previousSibling;
      }
      node = node.parentNode;
    }
    return total;
  };
  return {
    start: offsetAt(range.startContainer, range.startOffset),
    end: offsetAt(range.endContainer, range.endOffset),
  };
}

export function restoreTextSelection(
  root: HTMLElement,
  selection: TextSelection,
): void {
  const point = (offset: number): [Node, number] => {
    const walker = root.ownerDocument.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
    );
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const length = node.textContent?.length ?? 0;
      if (node.nodeType === 3) {
        if (offset <= length) return [node, offset];
        offset -= length;
      } else if (
        node.nodeName === "BR" &&
        !(node as Element).hasAttribute("data-cms-caret")
      ) {
        const parent = node.parentNode!;
        const index = [...parent.childNodes].indexOf(node as ChildNode);
        if (offset === 0) return [parent, index];
        offset--;
        if (offset === 0) return [parent, index + 1];
      }
    }
    return [root, root.childNodes.length];
  };
  const range = root.ownerDocument.createRange();
  range.setStart(...point(selection.start));
  range.setEnd(...point(selection.end));
  const target = root.ownerDocument.getSelection();
  target?.removeAllRanges();
  target?.addRange(range);
}
