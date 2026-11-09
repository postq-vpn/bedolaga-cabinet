/**
 * The postq design is shown to everyone. The upstream design is still in the
 * tree (`X.legacy.tsx`, picked by `X.tsx`) until it is deleted, but nothing
 * selects it any more, so its chunks are never downloaded.
 *
 * The postq stylesheet is scoped to `html.postq` (see PostqDesignClass).
 */

/**
 * Forces one design. Tests run against postq by default; a test can set it to
 * false to render an upstream module.
 */
declare global {
  var __POSTQ_DESIGN_OVERRIDE__: boolean | undefined;
}

function decide(): boolean {
  return globalThis.__POSTQ_DESIGN_OVERRIDE__ ?? true;
}

/** Whether the postq design is shown (hook form, kept for the call sites). */
export function usePostqDesign(): boolean {
  return decide();
}

/** Same, outside React (plain functions, adapters). */
export function isPostqDesign(): boolean {
  return decide();
}
