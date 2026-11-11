import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

globalThis.document = { body: { style: { overflow: "" } } };
const { lockPageScroll } = await import("../src/lib/scroll-lock.ts");
const overflow = () => document.body.style.overflow;

test("overlapping overlays closed in the order they opened leave the page scrollable", () => {
  // The order that used to leave the page locked until a reload.
  const first = lockPageScroll();
  const second = lockPageScroll();
  assert.equal(overflow(), "hidden");
  first();
  assert.equal(overflow(), "hidden", "still locked while the second is open");
  second();
  assert.equal(overflow(), "");
});

test("closed in reverse order, and released twice, the page is still scrollable", () => {
  const first = lockPageScroll();
  const second = lockPageScroll();
  second();
  second();
  assert.equal(overflow(), "hidden");
  first();
  assert.equal(overflow(), "");
});

test("no overlay writes body overflow itself; all go through the shared lock", () => {
  for (const file of ["src/components/ui/modal.tsx", "src/components/app-shell.tsx", "src/components/command-palette.tsx"]) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /body\.style\.overflow/, file);
    assert.match(source, /lockPageScroll\(\)/, file);
  }
});

test("dialogs and the search palette render into the body, out of any transformed ancestor", () => {
  for (const file of ["src/components/ui/modal.tsx", "src/components/command-palette.tsx"]) {
    assert.match(readFileSync(file, "utf8"), /createPortal\([\s\S]*document\.body/, file);
  }
});

test("entrance animations never keep a transform once they have played", () => {
  const css = readFileSync("src/app/globals.css", "utf8");
  for (const name of ["fade-up", "sheet-up", "pop-in"]) {
    for (const [, rule] of css.matchAll(new RegExp(`animation:\\s*${name}\\b([^;]*);`, "g"))) {
      assert.doesNotMatch(rule, /\b(both|forwards)\b/, `${name}: ${rule}`);
    }
  }
});
