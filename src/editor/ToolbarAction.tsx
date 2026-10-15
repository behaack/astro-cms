import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEventHandler,
} from "react";
import { createPortal } from "react-dom";

const iconPaths = {
  bold: ["M6 4h7a4 4 0 0 1 0 8H6Z", "M6 12h8a4 4 0 0 1 0 8H6Z"],
  italic: ["M10 4h10M4 20h10M15 4 9 20"],
  underline: ["M6 3v8a6 6 0 0 0 12 0V3M4 21h16"],
  alignLeft: ["M3 5h18M3 10h12M3 15h18M3 20h12"],
  alignCenter: ["M3 5h18M6 10h12M3 15h18M6 20h12"],
  alignRight: ["M3 5h18M9 10h12M3 15h18M9 20h12"],
  phone: [
    "M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z",
    "M11 18h2",
  ],
  tablet: [
    "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z",
    "M11 17h2",
  ],
  desktop: [
    "M3 3h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z",
    "M12 17v4m-4 0h8",
  ],
  create: [
    "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z",
    "M14 2v6h6",
    "M12 12v6m-3-3h6",
  ],
  rename: ["M12 20H4V4h8", "m14 4 3-3 4 4-3 3-9 9H5v-4Z", "m14 4 4 4"],
  remove: ["M3 6h18M9 6V3h6v3", "m5 6 1 15h12l1-15", "M10 10v7m4-7v7"],
  save: [
    "m19 21-14 0a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12l4 4v12a2 2 0 0 1-2 2Z",
    "M7 3v6h10V3M7 21v-8h10v8",
  ],
  search: [
    "M15 3H5v18h14V7Z",
    "M14 3v5h5",
    "M12 12a3 3 0 1 0 0 6 3 3 0 0 0 0-6m2 5 3 3",
  ],
  publish: ["M9 5H5v16h14V5h-4", "M9 3h6v4H9Z", "m8 14 3 3 5-5"],
  undo: ["m9 5-6 6 6 6", "M3 11h11a7 7 0 0 1 7 7v2"],
  redo: ["m15 5 6 6-6 6", "M21 11H10a7 7 0 0 0-7 7v2"],
  clear: [
    "m7 21-4.3-4.3a2.4 2.4 0 0 1 0-3.4l9.6-9.6a2.4 2.4 0 0 1 3.4 0l5.6 5.6a2.4 2.4 0 0 1 0 3.4L13 21",
    "M22 21H7M5 11l9 9",
  ],
  restore: ["M3 11a9 9 0 1 1 2.6 7.4", "M3 4v7h7", "M12 7v5l3 2"],
  reload: [
    "M20 7a9 9 0 0 0-15-2L2 8",
    "M2 2v6h6",
    "M4 17a9 9 0 0 0 15 2l3-3",
    "M16 16h6v6",
  ],
  open: ["M15 3h6v6m0-6L10 14", "M10 3H3v18h18v-7"],
  more: [
    "M5 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2M12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2M19 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2",
  ],
} as const;

interface ToolbarActionProps {
  id: string;
  label: string;
  icon: keyof typeof iconPaths;
  tooltip?: string;
  disabled?: boolean;
  primary?: boolean;
  href?: string;
  className?: string;
  onClick?: () => void;
  onPointerDown?: PointerEventHandler<HTMLButtonElement>;
  expanded?: boolean;
  controls?: string;
  previewWidth?: string;
  pressed?: boolean;
  hidden?: boolean;
}

export default function ToolbarAction({
  id,
  label,
  icon,
  tooltip = label,
  disabled = false,
  primary = false,
  href,
  className,
  onClick,
  onPointerDown,
  expanded,
  controls,
  previewWidth,
  pressed,
  hidden,
}: ToolbarActionProps) {
  const [tooltipDismissed, setTooltipDismissed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const actionRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const tooltipOpen = (hovered || focused) && !tooltipDismissed && !expanded;
  const tooltipId = `${id}-tooltip`;
  const accessibleDescription = tooltip !== label ? tooltipId : undefined;

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  useLayoutEffect(() => {
    if (!tooltipOpen || !actionRef.current || !tooltipRef.current) return;
    const control = actionRef.current.getBoundingClientRect();
    const tooltipWidth = tooltipRef.current.getBoundingClientRect().width;
    setPosition({
      top: control.bottom + 8,
      left: Math.max(
        16,
        Math.min(
          control.left + control.width / 2 - tooltipWidth / 2,
          window.innerWidth - tooltipWidth - 16,
        ),
      ),
    });

    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setTooltipDismissed(true);
    };
    const dismiss = () => setTooltipDismissed(true);
    window.addEventListener("keydown", dismissOnEscape);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      window.removeEventListener("keydown", dismissOnEscape);
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [tooltipOpen]);

  const canShowTooltip = () =>
    disabled ||
    !(
      actionRef.current?.closest(".toolbar-secondary-actions") &&
      window.matchMedia("(max-width: 1100px)").matches
    );
  const enterTooltip = () => {
    if (!canShowTooltip()) return;
    clearTimeout(closeTimer.current);
    setHovered(true);
    setTooltipDismissed(false);
  };
  const leaveTooltip = () => {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setHovered(false), 100);
  };
  const graphic = (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {iconPaths[icon].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );

  return (
    <span
      ref={actionRef}
      className={`toolbar-action${className ? ` ${className}` : ""}`}
      onPointerEnter={enterTooltip}
      onPointerLeave={leaveTooltip}
      onFocus={() => {
        setFocused(canShowTooltip());
        setTooltipDismissed(false);
      }}
      onBlur={() => setFocused(false)}
    >
      {href ? (
        <a
          id={id}
          className="toolbar-action__control"
          href={href}
          target="_blank"
          rel="noreferrer"
          hidden={hidden}
          aria-label={label}
          aria-describedby={accessibleDescription}
        >
          {graphic}
          <span className="toolbar-action__menu-label">{label}</span>
        </a>
      ) : (
        <button
          id={id}
          className="toolbar-action__control"
          type="button"
          disabled={disabled}
          hidden={hidden}
          data-primary={primary ? "" : undefined}
          data-preview-width={previewWidth}
          data-active={pressed ? "" : undefined}
          aria-label={label}
          aria-describedby={accessibleDescription}
          aria-expanded={expanded}
          aria-controls={controls}
          aria-pressed={pressed}
          onClick={onClick}
          onPointerDown={onPointerDown}
        >
          {graphic}
          <span className="toolbar-action__menu-label">{label}</span>
        </button>
      )}
      {typeof document !== "undefined" &&
        createPortal(
          <span
            ref={tooltipRef}
            id={tooltipId}
            role="tooltip"
            className="toolbar-action__tooltip"
            hidden={!tooltipOpen}
            style={position}
            onPointerEnter={enterTooltip}
            onPointerLeave={leaveTooltip}
          >
            {tooltip}
          </span>,
          document.body,
        )}
    </span>
  );
}
