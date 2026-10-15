import { useEffect, useRef, useState } from "react";
import type { ComponentStyles } from "../cms/document-types";
import {
  cleanStyles,
  declarationValue,
  isStylesheetUrl,
  setDeclaration,
  splitClasses,
  type StyleScope,
} from "../cms/component-styles";
import { componentStylesSchema } from "../cms/document-schema";
import {
  STYLE_APPLY,
  STYLE_REQUEST,
  STYLE_SELECTION,
  STYLESHEETS_APPLY,
  type StyleSelection,
} from "./style-events";

const quickStyles = [
  ["font-size", "Font size", "2rem"],
  ["font-weight", "Font weight", "600"],
  ["line-height", "Line height", "1.2"],
  ["color", "Text color", "#173c30"],
  ["background-color", "Background", "#ffffff"],
  ["padding", "Padding", "1rem"],
  ["margin", "Margin", "0 auto"],
  ["gap", "Gap", "1rem"],
  ["width", "Width", "100%"],
  ["max-width", "Max width", "60rem"],
  ["border-radius", "Corners", "0.5rem"],
  ["text-align", "Text alignment", "center"],
] as const;

export default function StylesPanel() {
  const [selection, setSelection] = useState<StyleSelection>({
    label: "Page",
    stylesheets: [],
    availableClasses: [],
  });
  const [styles, setStyles] = useState<ComponentStyles>({});
  const [classes, setClasses] = useState("");
  const [utilities, setUtilities] = useState("");
  const [sheets, setSheets] = useState("");
  const [scope, setScope] = useState<StyleScope>("css");
  const [status, setStatus] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const request = useRef(0);
  const selectedId = useRef<string | undefined>(undefined);

  useEffect(() => {
    const receive = (event: Event) =>
      setSelection((event as CustomEvent<StyleSelection>).detail);
    window.addEventListener(STYLE_SELECTION, receive);
    window.dispatchEvent(new Event(STYLE_REQUEST));
    return () => {
      request.current++;
      window.removeEventListener(STYLE_SELECTION, receive);
    };
  }, []);

  const styleSource = JSON.stringify(selection.styles ?? {});
  const sheetSource = selection.stylesheets.join("\n");
  useEffect(() => {
    request.current++;
    selectedId.current = selection.nodeId;
    setStyles(JSON.parse(styleSource) as ComponentStyles);
    setClasses(selection.styles?.classes?.join(" ") ?? "");
    setUtilities(selection.styles?.tailwind?.join(" ") ?? "");
    setBusy(false);
  }, [selection.nodeId, styleSource]);
  useEffect(() => {
    setStatus("");
    setError(false);
  }, [selection.nodeId]);
  useEffect(() => setSheets(sheetSource), [sheetSource]);

  const report = (message: string, failed = false) => {
    setStatus(message);
    setError(failed);
  };
  const updateQuickStyle = (property: string, value: string) => {
    try {
      setStyles({
        ...styles,
        [scope]: setDeclaration(styles[scope] ?? "", property, value),
      });
    } catch {
      report("Fix the Local CSS syntax before using the quick controls.", true);
    }
  };
  const apply = async () => {
    if (!selection.nodeId) return;
    const nodeId = selection.nodeId;
    const sequence = ++request.current;
    const draft = cleanStyles({
      ...styles,
      classes: splitClasses(classes),
      tailwind: splitClasses(utilities),
    });
    const result = componentStylesSchema.safeParse(draft ?? {});
    if (!result.success) {
      report(result.error.issues.map((issue) => issue.message).join(" "), true);
      return;
    }
    setBusy(true);
    try {
      const { tailwindStyles } = await import("../cms/tailwind-styles");
      await tailwindStyles(draft?.tailwind ?? []);
      if (sequence !== request.current || selectedId.current !== nodeId) return;
      window.dispatchEvent(
        new CustomEvent(STYLE_APPLY, { detail: { nodeId, styles: draft } }),
      );
      report("Styles applied to the draft. Save changes to keep them.");
    } catch (error) {
      if (sequence === request.current)
        report(
          error instanceof Error
            ? error.message
            : "Styles could not be applied.",
          true,
        );
    } finally {
      if (sequence === request.current) setBusy(false);
    }
  };

  return (
    <div className="styles-panel">
      <p className="styles-panel__selection">{selection.label}</p>
      {!selection.nodeId && (
        <p className="sidebar-help">
          Select a component in the preview to style it.
        </p>
      )}
      <fieldset disabled={!selection.nodeId || busy}>
        <label htmlFor="style-global-classes">Global CSS classes</label>
        <input
          id="style-global-classes"
          value={classes}
          onChange={(event) => setClasses(event.target.value)}
          placeholder="campaign-title featured"
          spellCheck={false}
        />
        <p className="styles-panel__help">
          Space-separated names from the site's stylesheets.
        </p>
        {selection.availableClasses.length > 0 && (
          <select
            aria-label="Add an existing CSS class"
            value=""
            onChange={(event) =>
              setClasses((current) =>
                splitClasses(`${current} ${event.target.value}`).join(" "),
              )
            }
          >
            <option value="">Add an existing class…</option>
            {selection.availableClasses.map((name) => (
              <option value={name} key={name}>
                {name}
              </option>
            ))}
          </select>
        )}

        <label htmlFor="style-tailwind">Tailwind classes</label>
        <textarea
          id="style-tailwind"
          rows={3}
          value={utilities}
          onChange={(event) => setUtilities(event.target.value)}
          placeholder="text-3xl md:text-5xl font-bold"
          spellCheck={false}
        />
        <p className="styles-panel__help">
          Standard Tailwind utilities, including responsive and hover variants.
        </p>

        <label htmlFor="style-local-scope">Local styles for</label>
        <select
          id="style-local-scope"
          value={scope}
          onChange={(event) => setScope(event.target.value as StyleScope)}
        >
          <option value="css">All sizes</option>
          <option value="tabletCss">Tablet and smaller (≤1023px)</option>
          <option value="phoneCss">Phone (≤639px)</option>
        </select>
        <p className="styles-panel__help">
          Blank values inherit the site or larger-size styles. Local styles
          override classes.
        </p>
        <details>
          <summary>Quick styles</summary>
          <div className="styles-panel__quick">
            {quickStyles.map(([property, label, placeholder]) => (
              <label key={`${scope}-${property}`}>
                {label}
                <input
                  aria-label={`${label} (${scope === "css" ? "all sizes" : scope === "tabletCss" ? "tablet" : "phone"})`}
                  value={declarationValue(styles[scope] ?? "", property)}
                  onChange={(event) =>
                    updateQuickStyle(property, event.target.value)
                  }
                  placeholder={placeholder}
                />
              </label>
            ))}
          </div>
        </details>
        <label htmlFor="style-local-css">Local CSS</label>
        <textarea
          id="style-local-css"
          rows={6}
          value={styles[scope] ?? ""}
          onChange={(event) =>
            setStyles((current) => ({
              ...current,
              [scope]: event.target.value,
            }))
          }
          placeholder={"font-size: 2rem;\ncolor: #173c30;"}
          spellCheck={false}
        />
        <p className="styles-panel__help">
          CSS declarations for this component. Use the size selector for
          responsive overrides.
        </p>
        <div className="styles-panel__actions">
          <button type="button" onClick={() => void apply()} data-primary="">
            {busy ? "Applying…" : "Apply styles"}
          </button>
          <button
            type="button"
            onClick={() => {
              setStyles({});
              setClasses("");
              setUtilities("");
              window.dispatchEvent(
                new CustomEvent(STYLE_APPLY, {
                  detail: { nodeId: selection.nodeId },
                }),
              );
              report("Component reset to the site's default styles.");
            }}
          >
            Reset styles
          </button>
        </div>
      </fieldset>
      <p
        className="styles-panel__status"
        role="status"
        data-error={error || undefined}
      >
        {status}
      </p>
      <details className="styles-panel__sheets">
        <summary>Page stylesheets</summary>
        <label htmlFor="style-stylesheets">Global stylesheet URLs</label>
        <textarea
          id="style-stylesheets"
          rows={3}
          value={sheets}
          onChange={(event) => setSheets(event.target.value)}
          placeholder="/styles/brand.css"
          spellCheck={false}
        />
        <p className="styles-panel__help">
          One CSS URL per line. Stylesheets already loaded by the site are
          available automatically.
        </p>
        <button
          type="button"
          onClick={() => {
            const urls = [
              ...new Set(
                sheets
                  .split(/\r?\n/)
                  .map((line) => line.trim())
                  .filter(Boolean),
              ),
            ];
            if (urls.length > 10 || urls.some((url) => !isStylesheetUrl(url))) {
              report(
                "Use up to 10 site-relative or HTTP(S) URLs ending in .css.",
                true,
              );
              return;
            }
            window.dispatchEvent(
              new CustomEvent(STYLESHEETS_APPLY, { detail: urls }),
            );
            report("Page stylesheets applied to the draft.");
          }}
        >
          Apply stylesheets
        </button>
      </details>
    </div>
  );
}
