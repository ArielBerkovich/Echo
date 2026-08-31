import { useEffect, useLayoutEffect, useRef, useState } from "react";

type TooltipState = {
  target: HTMLElement;
  text: string;
  left: number;
  top: number;
  placement: "above" | "below" | "left" | "right";
};

const TOOLTIP_DELAY = 420;
const TOOLTIP_EDGE = 12;
const TOOLTIP_MAX_WIDTH = 280;

function tooltipTarget(node: EventTarget | null) {
  if (!(node instanceof Element)) return null;
  const target = node.closest<HTMLElement>("[title]");
  const text = target?.getAttribute("title")?.trim();
  return target && text ? { target, text } : null;
}

function tooltipPlacementOrder(target: HTMLElement) {
  if (target.closest(".sidebar-actions")) return ["below", "above", "left", "right"] as const;
  if (target.closest(".rail")) return ["right", "above", "below", "left"] as const;
  // Above is the stable Echo convention. The measured collision pass below
  // changes this only when the actual rendered tooltip cannot fit there.
  return ["above", "below", "left", "right"] as const;
}

function tooltipPosition(target: HTMLElement, placement: TooltipState["placement"], width = 0, height = 0) {
  const rect = target.getBoundingClientRect();
  const halfWidth = (width || TOOLTIP_MAX_WIDTH) / 2;
  const minLeft = Math.min(TOOLTIP_EDGE + halfWidth, window.innerWidth / 2);
  const maxLeft = Math.max(window.innerWidth - TOOLTIP_EDGE - halfWidth, window.innerWidth / 2);
  const rightAligned = target.matches("[data-testid='composer-send-options'], [data-testid='channel-members'], .timeline-jump-button, .message-more-action, .header-action.leave") && placement === "above";
  const centeredLeft = rightAligned
    ? rect.right - halfWidth
    : Math.min(
      Math.max(rect.left + rect.width / 2, minLeft),
      maxLeft,
    );
  if (placement === "right") return { left: rect.right + 10, top: rect.top + rect.height / 2, placement };
  if (placement === "left") return { left: rect.left - 10, top: rect.top + rect.height / 2, placement };
  return { left: centeredLeft, top: placement === "above" ? rect.top - 10 : rect.bottom + 10, placement };
}

function tooltipBox(position: ReturnType<typeof tooltipPosition>, placement: TooltipState["placement"], width: number, height: number) {
  if (placement === "above") return { left: position.left - width / 2, top: position.top - height, right: position.left + width / 2, bottom: position.top };
  if (placement === "below") return { left: position.left - width / 2, top: position.top, right: position.left + width / 2, bottom: position.top + height };
  if (placement === "left") return { left: position.left - width, top: position.top - height / 2, right: position.left, bottom: position.top + height / 2 };
  return { left: position.left, top: position.top - height / 2, right: position.left + width, bottom: position.top + height / 2 };
}

function overlapsControl(box: ReturnType<typeof tooltipBox>, target: HTMLElement) {
  return Array.from(document.querySelectorAll<HTMLElement>("button, [role='button'], a, input, select, textarea")).some((control) => {
    if (control === target || control.contains(target) || target.contains(control)) return false;
    const rect = control.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    return box.left < rect.right && box.right > rect.left && box.top < rect.bottom && box.bottom > rect.top;
  });
}

/** Replaces browser-native title bubbles with a theme-aware, accessible visual. */
export default function ThemedTooltipLayer() {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const targetRef = useRef<HTMLElement | null>(null);
  const titleRef = useRef<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const focusedRef = useRef<HTMLElement | null>(null);
  const tooltipNodeRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const clearTimer = () => {
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const restoreTitle = () => {
      const target = targetRef.current;
      if (target?.isConnected && titleRef.current != null && !target.hasAttribute("title")) {
        target.setAttribute("title", titleRef.current);
      }
      targetRef.current = null;
      titleRef.current = null;
    };

    const hide = () => {
      clearTimer();
      restoreTitle();
      setTooltip(null);
    };

    const show = (event: Event) => {
      const match = tooltipTarget(event.target);
      if (!match) return;
      const { target, text } = match;
      if (target === targetRef.current) return;

      clearTimer();
      restoreTitle();
      targetRef.current = target;
      titleRef.current = target.getAttribute("title");
      // Prevent the browser's native bubble from appearing alongside Echo's.
      target.removeAttribute("title");
      timerRef.current = window.setTimeout(() => {
        if (!target.isConnected) return hide();
        setTooltip({ target, text, ...tooltipPosition(target, tooltipPlacementOrder(target)[0]) });
      }, TOOLTIP_DELAY);
    };

    const onPointerOver = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const match = tooltipTarget(event.target);
      if (!match || (event.relatedTarget instanceof Node && match.target.contains(event.relatedTarget))) return;
      show(event);
    };

    const onPointerOut = (event: PointerEvent) => {
      const target = targetRef.current;
      if (!target || (event.relatedTarget instanceof Node && target.contains(event.relatedTarget))) return;
      if (focusedRef.current !== target) hide();
    };

    const onFocusIn = (event: FocusEvent) => {
      const match = tooltipTarget(event.target);
      if (!match) return;
      focusedRef.current = match.target;
      show(event);
    };

    const onFocusOut = (event: FocusEvent) => {
      if (focusedRef.current === event.target) focusedRef.current = null;
      if (!(event.relatedTarget instanceof Node) || !targetRef.current?.contains(event.relatedTarget)) hide();
    };
    const onClick = () => hide();

    document.addEventListener("pointerover", onPointerOver, true);
    document.addEventListener("pointerout", onPointerOut, true);
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("focusout", onFocusOut, true);
    document.addEventListener("click", onClick, true);
    window.addEventListener("resize", hide);
    window.addEventListener("scroll", hide, true);
    return () => {
      document.removeEventListener("pointerover", onPointerOver, true);
      document.removeEventListener("pointerout", onPointerOut, true);
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("focusout", onFocusOut, true);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("resize", hide);
      window.removeEventListener("scroll", hide, true);
      hide();
    };
  }, []);

  useLayoutEffect(() => {
    if (!tooltip || !tooltipNodeRef.current) return;
    const { width, height } = tooltipNodeRef.current.getBoundingClientRect();
    const placement = tooltipPlacementOrder(tooltip.target).find((candidate) => {
      const position = tooltipPosition(tooltip.target, candidate, width, height);
      const box = tooltipBox(position, candidate, width, height);
      const rightAnchored = tooltip.target.matches("[data-testid='composer-send-options'], [data-testid='channel-members'], .timeline-jump-button, .message-more-action, .header-action.leave");
      const viewportEdge = rightAnchored ? 4 : TOOLTIP_EDGE;
      const fitsViewport = box.left >= viewportEdge && box.right <= window.innerWidth - viewportEdge
        && box.top >= TOOLTIP_EDGE && box.bottom <= window.innerHeight - TOOLTIP_EDGE;
      // Above is the consistent Echo placement. Only fallback placements need
      // to avoid neighboring controls; the target itself is always below it.
      const railPlacement = candidate === "right" && tooltip.target.closest(".rail");
      return fitsViewport && (candidate === "above" || railPlacement || !overlapsControl(box, tooltip.target));
    }) || tooltip.placement;
    const position = tooltipPosition(tooltip.target, placement, width, height);
    if (position.left !== tooltip.left || position.top !== tooltip.top || placement !== tooltip.placement) {
      setTooltip((current) => current && current.target === tooltip.target ? { ...current, ...position } : current);
    }
  }, [tooltip]);

  if (!tooltip) return null;
  const rightAnchored = tooltip.target.matches("[data-testid='composer-send-options'], [data-testid='channel-members'], .timeline-jump-button, .message-more-action, .header-action.leave");
  return (
    <div
      ref={tooltipNodeRef}
      className={`echo-tooltip echo-tooltip-${tooltip.placement}${rightAnchored ? " echo-tooltip-right-anchor" : ""}`}
      role="tooltip"
      aria-hidden="true"
      style={{ left: tooltip.left, top: tooltip.top }}
    >
      {tooltip.text}
    </div>
  );
}
