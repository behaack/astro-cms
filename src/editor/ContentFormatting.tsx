import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ComponentStyles, TextFormat } from "../cms/document-types";
import {
  changeTextMark,
  formattedTextHtml,
  hasTextMark,
  replaceFormattedText,
  textMarksAt,
  textMarks,
  type TextMark,
  type TextMarks,
} from "../cms/text-formatting";
import {
  cleanStyles,
  declarationValue,
  parseDeclarations,
  setDeclaration,
} from "../cms/component-styles";
import { componentStylesSchema } from "../cms/document-schema";
import {
  STYLE_APPLY,
  STYLE_REQUEST,
  STYLE_SELECTION,
  TEXT_APPLY,
  TEXT_FOCUS,
  type StyleSelection,
} from "./style-events";
import {
  readFormattedText,
  readTextSelection,
  restoreTextSelection,
  type TextSelection,
} from "./rich-text-dom";
import ToolbarAction from "./ToolbarAction";

const textCss = [
  "font-weight",
  "font-style",
  "text-decoration",
  "text-decoration-line",
  "text-align",
  "line-height",
  "letter-spacing",
];
const editorHtml = (text: string, formats: TextFormat[]) =>
  formattedTextHtml(text, formats).replace(/<br>/g, "\n") +
  (text.endsWith("\n") ? '<br data-cms-caret="">' : "");

function TextField({
  selection,
  property,
}: {
  selection: StyleSelection;
  property: { name: string; label: string; text: string };
}) {
  const root = useRef<HTMLDivElement>(null);
  const remembered = useRef<TextSelection>({ start: 0, end: 0 });
  const typing = useRef<{ offset: number; marks: TextMarks } | undefined>(
    undefined,
  );
  const beforeInput = useRef<(event: InputEvent) => void>(() => {});
  const previewSelection = useRef(false);
  const [range, setRange] = useState<TextSelection>({ start: 0, end: 0 });
  const [status, setStatus] = useState("");
  const formats = selection.styles?.text?.[property.name] ?? [];
  const formatsSource = JSON.stringify(formats);
  const fieldId = `content-${property.name}`;
  const selectedPreview =
    selection.textSelection?.name === property.name
      ? selection.textSelection
      : undefined;
  useEffect(() => {
    if (selectedPreview) {
      previewSelection.current = true;
      remembered.current = {
        start: selectedPreview.start,
        end: selectedPreview.end,
      };
      setRange(remembered.current);
    } else if (previewSelection.current) {
      previewSelection.current = false;
      remembered.current = {
        start: remembered.current.end,
        end: remembered.current.end,
      };
      setRange(remembered.current);
    }
  }, [selectedPreview?.start, selectedPreview?.end, selectedPreview?.nodeId]);

  const remember = () => {
    if (
      !root.current
        ?.closest(".content-text-field")
        ?.contains(document.activeElement)
    )
      return;
    const current = root.current && readTextSelection(root.current);
    if (current) {
      if (
        typing.current &&
        (current.start !== typing.current.offset ||
          current.end !== current.start)
      )
        typing.current = undefined;
      remembered.current = current;
      setRange((previous) =>
        previous.start === current.start && previous.end === current.end
          ? previous
          : current,
      );
    }
  };
  useEffect(() => {
    document.addEventListener("selectionchange", remember);
    const element = root.current;
    const receive = (event: InputEvent) => beforeInput.current(event);
    element?.addEventListener("beforeinput", receive);
    return () => {
      document.removeEventListener("selectionchange", remember);
      element?.removeEventListener("beforeinput", receive);
    };
  }, []);

  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const previous = readFormattedText(element);
    if (
      previous.text === property.text &&
      JSON.stringify(previous.formats) === formatsSource
    )
      return;
    const selected = readTextSelection(element);
    element.innerHTML = editorHtml(property.text, JSON.parse(formatsSource));
    if (selected)
      restoreTextSelection(element, {
        start: Math.min(selected.start, property.text.length),
        end: Math.min(selected.end, property.text.length),
      });
  }, [property.text, formatsSource]);

  const send = (text: string, next: TextFormat[]) =>
    window.dispatchEvent(
      new CustomEvent(TEXT_APPLY, {
        detail: {
          nodeId: selection.nodeId,
          name: property.name,
          text,
          formats: next,
          previewSelection: previewSelection.current
            ? selectedPreview
            : undefined,
        },
      }),
    );
  const commit = () => {
    if (!root.current) return;
    const current = readFormattedText(root.current);
    const selected = readTextSelection(root.current);
    const html = editorHtml(current.text, current.formats);
    if (root.current.innerHTML !== html) {
      root.current.innerHTML = html;
      if (selected) restoreTextSelection(root.current, selected);
    }
    remember();
    send(current.text, current.formats);
  };
  const insertText = (text: string) => {
    const element = root.current;
    if (!element) return;
    const current = readFormattedText(element);
    const selected = readTextSelection(element) ?? remembered.current;
    const marks =
      typing.current?.marks ?? textMarksAt(current.formats, selected.start);
    const next = replaceFormattedText(
      current.text,
      current.formats,
      selected.start,
      selected.end,
      text,
      marks,
    );
    const position = selected.start + text.length;
    element.innerHTML = editorHtml(next.text, next.formats);
    if (typing.current) typing.current = { offset: position, marks };
    element.focus();
    restoreTextSelection(element, { start: position, end: position });
    remember();
    send(next.text, next.formats);
  };
  beforeInput.current = (event: InputEvent) => {
    if (event.isComposing) return;
    if (["insertParagraph", "insertLineBreak"].includes(event.inputType)) {
      event.preventDefault();
      insertText("\n");
    } else if (
      typing.current &&
      ["insertText", "insertReplacementText"].includes(event.inputType) &&
      event.data
    ) {
      event.preventDefault();
      insertText(event.data);
    }
  };
  const applyMark = (mark?: TextMark) => {
    const element = root.current;
    if (!element) return;
    const current = readFormattedText(element);
    const selected = remembered.current;
    if (mark && selected.start === selected.end && !current.text.length) {
      const marks = {
        ...(typing.current?.marks ??
          textMarksAt(current.formats, selected.start)),
      };
      if (marks[mark]) delete marks[mark];
      else marks[mark] = true;
      typing.current = { offset: selected.start, marks };
      element.focus();
      restoreTextSelection(element, selected);
      setRange({ ...selected });
      setStatus(
        `${mark[0].toUpperCase() + mark.slice(1)} ${marks[mark] ? "on" : "off"} for new text.`,
      );
      return;
    }
    if (!mark && selected.start === selected.end) {
      typing.current = { offset: selected.start, marks: {} };
      const next = {
        ...selection.styles,
        text: { ...selection.styles?.text, [property.name]: [] },
      };
      next.css = textCss.reduce(
        (css, name) => setDeclaration(css, name, ""),
        next.css ?? "",
      );
      window.dispatchEvent(
        new CustomEvent(STYLE_APPLY, {
          detail: { nodeId: selection.nodeId, styles: cleanStyles(next) },
        }),
      );
      setStatus(
        "Text formatting, alignment and spacing cleared for this block.",
      );
      return;
    }
    if (mark) typing.current = undefined;
    const next = changeTextMark(
      current.text,
      current.formats,
      selected.start,
      selected.end,
      mark,
    );
    element.innerHTML = editorHtml(current.text, next);
    if (!previewSelection.current) {
      element.focus();
      restoreTextSelection(element, selected);
    }
    send(current.text, next);
    remember();
    setStatus(
      mark
        ? selected.start === selected.end
          ? "Text formatting updated for the whole block."
          : "Text formatting updated for the selected words."
        : "Formatting cleared from the selected words.",
    );
  };
  const applyAlignment = (value: string) =>
    window.dispatchEvent(
      new CustomEvent(STYLE_APPLY, {
        detail: {
          nodeId: selection.nodeId,
          styles: cleanStyles({
            ...selection.styles,
            css: setDeclaration(
              selection.styles?.css ?? "",
              "text-align",
              value,
            ),
          }),
        },
      }),
    );
  return (
    <section
      className="content-text-field"
      aria-labelledby={`${fieldId}-label`}
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return;
        const position = remembered.current.end;
        remembered.current = { start: position, end: position };
        typing.current = undefined;
        setRange({ start: position, end: position });
      }}
    >
      <label id={`${fieldId}-label`}>{property.label}</label>
      <div
        className="content-format-toolbar"
        role="group"
        aria-label={`${property.label} formatting`}
      >
        <div
          className="content-format-toolbar__group"
          role="group"
          aria-label="Word formatting"
        >
          {textMarks.map((mark) => (
            <ToolbarAction
              key={mark}
              id={`format-${property.name}-${mark}`}
              label={mark[0].toUpperCase() + mark.slice(1)}
              icon={mark}
              tooltip={`${mark[0].toUpperCase() + mark.slice(1)} selected words, or the whole text block if none are selected`}
              pressed={
                range.start === range.end && !property.text.length
                  ? !!(typing.current?.marks ??
                      textMarksAt(formats, range.start))[mark]
                  : hasTextMark(
                      formats,
                      range.start === range.end ? 0 : range.start,
                      range.start === range.end
                        ? property.text.length
                        : range.end,
                      mark,
                    )
              }
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => applyMark(mark)}
            />
          ))}
          <ToolbarAction
            id={`format-${property.name}-clear`}
            label="Clear formatting"
            icon="clear"
            tooltip="Clear selected words, or all text formatting if no words are selected"
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => applyMark()}
          />
        </div>
        <div
          className="content-format-toolbar__group"
          role="group"
          aria-label="Block alignment"
        >
          {(["left", "center", "right"] as const).map((value) => (
            <ToolbarAction
              key={value}
              id={`format-${property.name}-align-${value}`}
              label={`Align ${value}`}
              icon={
                value === "left"
                  ? "alignLeft"
                  : value === "right"
                    ? "alignRight"
                    : "alignCenter"
              }
              pressed={
                declarationValue(selection.styles?.css ?? "", "text-align") ===
                value
              }
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => applyAlignment(value)}
            />
          ))}
        </div>
      </div>
      <div
        ref={root}
        id={fieldId}
        className="content-text-input"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-labelledby={`${fieldId}-label`}
        aria-describedby={`${fieldId}-help`}
        spellCheck
        onInput={(event) => {
          if (!(event.nativeEvent as InputEvent).isComposing) commit();
        }}
        onCompositionEnd={commit}
        onFocus={() => {
          previewSelection.current = false;
          window.dispatchEvent(
            new CustomEvent(TEXT_FOCUS, {
              detail: { nodeId: selection.nodeId },
            }),
          );
          remember();
        }}
        onKeyUp={remember}
        onMouseUp={remember}
        onPaste={(event) => {
          event.preventDefault();
          insertText(event.clipboardData.getData("text/plain"));
        }}
        onDrop={(event) => event.preventDefault()}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Enter") {
            event.preventDefault();
            insertText("\n");
            return;
          }
          if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
          const key = event.key.toLowerCase();
          const mark = ({ b: "bold", i: "italic", u: "underline" } as const)[
            key as "b" | "i" | "u"
          ];
          if (mark) {
            event.preventDefault();
            event.stopPropagation();
            applyMark(mark);
          }
          if (key === "z" || key === "y") {
            event.preventDefault();
            event.stopPropagation();
            document
              .getElementById(
                key === "y" || event.shiftKey ? "redo-button" : "undo-button",
              )
              ?.click();
          }
        }}
      />
      <p id={`${fieldId}-help`} className="content-format-help">
        Highlight words here or in the page preview to format them. With no
        words selected, the icons format the whole text block.
      </p>
      <p className="content-format-status" role="status">
        {status}
      </p>
    </section>
  );
}

function SpacingControls({ selection }: { selection: StyleSelection }) {
  const css = selection.styles?.css ?? "";
  const [line, setLine] = useState("");
  const [letters, setLetters] = useState("");
  const [status, setStatus] = useState("");
  useEffect(() => {
    setLine(declarationValue(css, "line-height"));
    setLetters(declarationValue(css, "letter-spacing"));
  }, [css]);
  const apply = (property: string, value: string) => {
    if (declarationValue(css, property) === value.trim()) return;
    try {
      if (
        value.trim() &&
        parseDeclarations(`${property}: ${value};`).length !== 1
      )
        throw new Error("Use one spacing value");
      const styles: ComponentStyles = {
        ...selection.styles,
        css: setDeclaration(css, property, value),
      };
      const parsed = componentStylesSchema.safeParse(styles);
      if (!parsed.success) {
        setStatus(
          "Use a line spacing such as 1.5, or letter spacing such as 0.02em.",
        );
        return;
      }
      window.dispatchEvent(
        new CustomEvent(STYLE_APPLY, {
          detail: { nodeId: selection.nodeId, styles: cleanStyles(styles) },
        }),
      );
      setStatus("Spacing applied to this block.");
    } catch {
      setStatus(
        "Use a line spacing such as 1.5, or letter spacing such as 0.02em.",
      );
    }
  };
  return (
    <div className="content-spacing">
      <label htmlFor="content-line-spacing">Line spacing</label>
      <input
        id="content-line-spacing"
        value={line}
        placeholder="Site default (e.g. 1.5)"
        onChange={(event) => setLine(event.target.value)}
        onBlur={() => apply("line-height", line)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
      <label htmlFor="content-letter-spacing">Letter spacing</label>
      <input
        id="content-letter-spacing"
        value={letters}
        placeholder="Site default (e.g. 0.02em)"
        onChange={(event) => setLetters(event.target.value)}
        onBlur={() => apply("letter-spacing", letters)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
      <button
        type="button"
        onClick={() => {
          setLine("");
          setLetters("");
          window.dispatchEvent(
            new CustomEvent(STYLE_APPLY, {
              detail: {
                nodeId: selection.nodeId,
                styles: cleanStyles({
                  ...selection.styles,
                  css: setDeclaration(
                    setDeclaration(css, "line-height", ""),
                    "letter-spacing",
                    "",
                  ),
                }),
              },
            }),
          );
          setStatus("Site spacing defaults restored.");
        }}
      >
        Reset spacing
      </button>
      <p className="content-format-status" role="status">
        {status}
      </p>
    </div>
  );
}

export default function ContentFormatting() {
  const [selection, setSelection] = useState<StyleSelection>({
    label: "Page",
    stylesheets: [],
    availableClasses: [],
  });
  useEffect(() => {
    const receive = (event: Event) =>
      setSelection((event as CustomEvent<StyleSelection>).detail);
    window.addEventListener(STYLE_SELECTION, receive);
    window.dispatchEvent(new Event(STYLE_REQUEST));
    return () => window.removeEventListener(STYLE_SELECTION, receive);
  }, []);
  if (!selection.nodeId || !selection.textProperties?.length) return null;
  return (
    <div className="content-formatting">
      {selection.textProperties.map((property) => (
        <TextField
          key={`${selection.nodeId}-${property.name}`}
          selection={selection}
          property={property}
        />
      ))}
      <SpacingControls key={selection.nodeId} selection={selection} />
    </div>
  );
}
