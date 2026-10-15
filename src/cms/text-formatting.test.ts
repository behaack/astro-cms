import { describe, expect, it } from "vitest";
import home from "../../content/pages/home.json";
import {
  changeTextMark,
  formattedTextHtml,
  hasTextMark,
  normalizeTextFormats,
  replaceFormattedText,
  textMarksAt,
} from "./text-formatting";
import { cleanStyles, setDeclaration } from "./component-styles";
import { assertPageDocument, validatePageDocument } from "./validation";
import { serializePageDocument } from "./local-page-store";
import { cloneComponentNodeWithFreshIds } from "./composition";
import { requireNodeByType } from "./document-test-helpers";
import { assertReusableTemplate } from "./template-schema";
import { componentStylesSchema } from "./document-schema";

describe("word formatting", () => {
  it("formats existing text when a toolbar command has no selected words", () => {
    const text = "Existing text";
    const bold = changeTextMark(text, [], 0, 0, "bold");
    expect(formattedTextHtml(text, bold)).toBe(
      "<strong>Existing text</strong>",
    );
    const italic = changeTextMark(text, bold, 4, 4, "italic");
    expect(formattedTextHtml(text, italic)).toBe(
      "<strong><em>Existing text</em></strong>",
    );
    const underlined = changeTextMark(
      text,
      italic,
      text.length,
      text.length,
      "underline",
    );
    expect(formattedTextHtml(text, underlined)).toBe(
      "<strong><em><u>Existing text</u></em></strong>",
    );
    const toggled = changeTextMark(text, underlined, 2, 2, "bold");
    expect(formattedTextHtml(text, toggled)).toBe(
      "<em><u>Existing text</u></em>",
    );
    expect(changeTextMark("", [], 0, 0, "bold")).toEqual([]);
  });
  it("applies typing marks at a cursor and moves later ranges with edits", () => {
    const original = [{ start: 6, end: 11, italic: true as const }];
    const inserted = replaceFormattedText(
      "Alpha bravo",
      original,
      6,
      6,
      "new ",
      { bold: true },
    );
    expect(inserted.text).toBe("Alpha new bravo");
    expect(inserted.formats).toEqual([
      { start: 6, end: 10, bold: true },
      { start: 10, end: 15, italic: true },
    ]);
    const replaced = replaceFormattedText(
      inserted.text,
      inserted.formats,
      6,
      15,
      "plain",
      {},
    );
    expect(replaced).toEqual({ text: "Alpha plain", formats: [] });
    expect(textMarksAt(inserted.formats, 8)).toEqual({ bold: true });
    expect(textMarksAt(inserted.formats, 12)).toEqual({ italic: true });
  });
  it("combines overlapping marks and toggles only selected words", () => {
    const text = "Alpha bravo charlie";
    let formats = changeTextMark(text, [], 0, 11, "bold");
    formats = changeTextMark(text, formats, 6, 19, "italic");
    expect(formats).toEqual([
      { start: 0, end: 6, bold: true },
      { start: 6, end: 11, bold: true, italic: true },
      { start: 11, end: 19, italic: true },
    ]);
    expect(hasTextMark(formats, 0, 11, "bold")).toBe(true);
    expect(hasTextMark(formats, 0, 19, "bold")).toBe(false);
    formats = changeTextMark(text, formats, 6, 11, "bold");
    expect(formattedTextHtml(text, formats)).toBe(
      "<strong>Alpha </strong><em>bravo charlie</em>",
    );
    formats = changeTextMark(text, formats, 6, 11);
    expect(formattedTextHtml(text, formats)).toBe(
      "<strong>Alpha </strong>bravo<em> charlie</em>",
    );
  });

  it("escapes HTML and permits only semantic inline markup", () => {
    const text = '<img src=x onerror="alert(1)"> & text\nnext';
    const html = formattedTextHtml(text, [
      { start: 0, end: text.length, bold: true, italic: true, underline: true },
    ]);
    expect(html).toBe(
      "<strong><em><u>&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; text<br>next</u></em></strong>",
    );
    expect(html).not.toContain("<img");
  });

  it("uses the same string offsets for Unicode text as browser selections", () => {
    const text = "😀 brave café";
    expect(
      formattedTextHtml(text, changeTextMark(text, [], 3, 8, "underline")),
    ).toBe("😀 <u>brave</u> café");
    expect(
      normalizeTextFormats(3, [
        { start: -1, end: 2, bold: true },
        { start: 0, end: 9, italic: true },
      ]),
    ).toEqual([]);
  });

  it("preserves formatting through save, editor styles, copy and reusable templates", () => {
    const page = assertPageDocument(home);
    const heading = requireNodeByType(page, "Heading");
    heading.styles = {
      text: { text: [{ start: 0, end: 5, bold: true }] },
      css: "line-height: 1.5; letter-spacing: 0.02em; text-align: center;",
    };
    heading.styles = cleanStyles({
      ...heading.styles,
      css: setDeclaration(heading.styles.css!, "color", "#123456"),
    });
    const saved = assertPageDocument(JSON.parse(serializePageDocument(page)));
    const restored = requireNodeByType(saved, "Heading");
    expect(restored.styles).toEqual(heading.styles);
    const template = assertReusableTemplate({
      schemaVersion: 1,
      id: "formatted-section",
      name: "Formatted section",
      root: page.content[0],
    });
    const copied = cloneComponentNodeWithFreshIds(template.root);
    const find = requireNodeByType({ ...page, content: [copied] }, "Heading");
    expect(find.styles?.text).toEqual(heading.styles!.text);
    find.styles!.text!.text[0].end = 3;
    expect(heading.styles!.text!.text[0].end).toBe(5);
  });

  it("rejects formatting outside text, on unapproved properties, or with arbitrary tags", () => {
    const page = assertPageDocument(home);
    const heading = requireNodeByType(page, "Heading");
    heading.styles = { text: { text: [{ start: 0, end: 9999, bold: true }] } };
    expect(
      validatePageDocument(page).some((issue) =>
        issue.message.includes("invalid text formatting"),
      ),
    ).toBe(true);
    heading.styles = { text: { level: [{ start: 0, end: 1, bold: true }] } };
    expect(
      validatePageDocument(page).some((issue) =>
        issue.message.includes("invalid text formatting"),
      ),
    ).toBe(true);
    expect(
      componentStylesSchema.safeParse({
        text: { text: [{ start: 0, end: 1, script: true }] },
      }).success,
    ).toBe(false);
  });
});
