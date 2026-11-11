"use client";

import { useSyncExternalStore } from "react";

/**
 * The part of the screen the person can actually see, as `{ height, top }` in
 * CSS pixels, or null before the browser can say (server render, or a browser
 * with no `visualViewport`).
 *
 * Most Android browsers do not shrink the page when the on-screen keyboard
 * opens: `100dvh` and a `position: fixed` overlay stay full height, and the
 * keyboard simply covers their lower part. A dialog sized from them hid its
 * footer, and with it the button that saves, behind the keyboard, with nothing
 * to scroll. The visual viewport is the one measure that does shrink, so a
 * dialog sized from it keeps its footer above the keyboard.
 */
function subscribe(onChange: () => void) {
  const vv = window.visualViewport;
  if (!vv) return () => {};
  vv.addEventListener("resize", onChange);
  vv.addEventListener("scroll", onChange);
  return () => {
    vv.removeEventListener("resize", onChange);
    vv.removeEventListener("scroll", onChange);
  };
}

// A primitive snapshot, so React sees no change unless a number changed.
function snapshot(): string {
  const vv = window.visualViewport;
  return vv ? `${Math.round(vv.height)}:${Math.round(vv.offsetTop)}` : "";
}

function serverSnapshot(): string {
  return "";
}

export function useVisibleHeight(): { height: number; top: number } | null {
  const value = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  if (!value) return null;
  const [height, top] = value.split(":").map(Number);
  return height > 0 ? { height, top } : null;
}
