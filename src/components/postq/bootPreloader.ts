/**
 * The boot preloader index.html puts over the page before the bundle loads
 * (postq design only). It stays while the app shows loaders and is lifted once
 * the cabinet has rendered real content: every PageLoader holds it while
 * mounted, and it goes away when nothing has held it for a short moment (so a
 * loader that hands over to the next one — auth → lazy route — doesn't let
 * the page flash through in between).
 */

const ID = 'boot-preloader';
const SETTLE_MS = 150;

let holds = 0;
let timer: ReturnType<typeof setTimeout> | undefined;

function element(): (HTMLElement & { __anim?: { destroy: () => void } }) | null {
  return document.getElementById(ID);
}

/** Whether the boot preloader is still on screen. */
export function hasBootPreloader(): boolean {
  return element() !== null;
}

function hide() {
  const el = element();
  if (!el) return;
  const remove = () => {
    el.__anim?.destroy();
    el.remove();
  };
  // Still inside the 300 ms fade-in delay: nothing was seen, drop it outright.
  if (Number(getComputedStyle(el).opacity) < 0.05) return remove();
  el.style.pointerEvents = 'none';
  el.style.transition = 'opacity .3s ease';
  el.style.opacity = '0';
  setTimeout(remove, 300);
}

/** Lift the boot preloader unless a loader takes it over within SETTLE_MS. */
export function scheduleBootPreloaderHide() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (holds === 0) hide();
  }, SETTLE_MS);
}

/** Keep the boot preloader up while a loader is mounted; returns the release. */
export function holdBootPreloader(): () => void {
  holds += 1;
  clearTimeout(timer);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds -= 1;
    scheduleBootPreloaderHide();
  };
}
