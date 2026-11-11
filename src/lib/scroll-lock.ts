/**
 * One page-scroll lock for every overlay: dialogs, the phone menu and the search
 * palette. Each caller takes a lock and gets back its release; the page scrolls
 * again only when every lock is released, in whatever order that happens.
 *
 * Before this, each overlay saved `body.style.overflow`, set it to hidden and
 * put the saved value back on close. Two overlays that overlapped and closed in
 * the order they opened left the second one restoring "hidden", and the page
 * could not be scrolled again until it was reloaded.
 */
let locks = 0;
let saved = "";

export function lockPageScroll(): () => void {
  if (typeof document === "undefined") return () => {};
  if (locks === 0) {
    saved = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  locks += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    locks -= 1;
    if (locks === 0) document.body.style.overflow = saved;
  };
}
