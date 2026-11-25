"use client";

import { useCallback, useRef } from "react";

interface HorizontalSwipeOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  /** A swipe is ignored below this horizontal travel distance. */
  threshold?: number;
  /** Horizontal travel must exceed vertical travel by this multiplier. */
  axisRatio?: number;
  enabled?: boolean;
  /** Useful for pausing autoplay while a finger is down. */
  onActiveChange?: (active: boolean) => void;
}

interface GestureState {
  pointerId: number;
  startX: number;
  startY: number;
  cancelled: boolean;
}

const INTERACTIVE_SELECTOR = [
  "a",
  "button",
  "input",
  "textarea",
  "select",
  "option",
  "[contenteditable='true']",
  "[role='button']",
  "[role='link']",
  "[data-swipe-ignore]",
  "[data-native-scroll]",
].join(",");

/**
 * Guarded horizontal swipe recognition for discrete carousel navigation.
 *
 * It intentionally handles touch and pen only; mouse dragging is surprising on image
 * links and competes with text selection. Consumers should pair the returned handlers
 * with `touch-pan-y`, allowing ordinary vertical page scrolling while declaring that
 * horizontal movement belongs to the carousel.
 */
export function useHorizontalSwipe({
  onSwipeLeft,
  onSwipeRight,
  threshold = 48,
  axisRatio = 1.2,
  enabled = true,
  onActiveChange,
}: HorizontalSwipeOptions) {
  const gesture = useRef<GestureState | null>(null);

  const reset = useCallback(() => {
    if (gesture.current) onActiveChange?.(false);
    gesture.current = null;
  }, [onActiveChange]);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (!enabled || event.pointerType === "mouse" || !event.isPrimary) return;

      const target = event.target;
      if (target instanceof Element && target.closest(INTERACTIVE_SELECTOR)) return;

      gesture.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        cancelled: false,
      };
      onActiveChange?.(true);

      // Keep receiving the end/cancel event if the finger leaves the image bounds.
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    [enabled, onActiveChange],
  );

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId || current.cancelled) return;

    const deltaX = Math.abs(event.clientX - current.startX);
    const deltaY = Math.abs(event.clientY - current.startY);

    // As soon as vertical intent is clear, this gesture can no longer navigate.
    if (deltaY > 12 && deltaY > deltaX) current.cancelled = true;
  }, []);

  const onPointerUp = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const current = gesture.current;
      if (!current || current.pointerId !== event.pointerId) return;

      const deltaX = event.clientX - current.startX;
      const deltaY = event.clientY - current.startY;
      const horizontal = Math.abs(deltaX);
      const vertical = Math.abs(deltaY);
      const qualifies =
        !current.cancelled && horizontal >= threshold && horizontal > vertical * axisRatio;

      reset();

      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture?.(event.pointerId);
      }

      if (!qualifies) return;
      if (deltaX < 0) onSwipeLeft?.();
      else onSwipeRight?.();
    },
    [axisRatio, onSwipeLeft, onSwipeRight, reset, threshold],
  );

  const onPointerCancel = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (gesture.current?.pointerId === event.pointerId) reset();
    },
    [reset],
  );

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onLostPointerCapture: onPointerCancel,
  };
}
