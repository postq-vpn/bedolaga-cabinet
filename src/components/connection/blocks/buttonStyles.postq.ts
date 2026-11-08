/**
 * Shared button styling for connection blocks. The config-driven blocks
 * (BlockButtons) and the Happ TV quick-connect both render through this so the
 * latter adapts to exactly the same visual language as the styles coming from
 * the subscription-page config — no divergent one-off button styles.
 */
export function blockButtonClass(
  variant: 'primary' | 'light' | 'subtle',
  _isLight?: boolean,
): string {
  const base =
    'rd-p-md inline-flex h-12 items-center justify-center gap-2 rounded-[var(--rd-radius-sm)] px-6 font-medium transition-colors';
  // postq: the step's main action (add the subscription) is the solid action
  // button; the rest (download, copy) are flat neutral buttons.
  if (variant === 'primary') {
    return `${base} bg-[var(--rd-action)] text-[var(--rd-on-action)] hover:bg-[var(--rd-action-hover)]`;
  }
  if (variant === 'light') {
    return `${base} bg-[var(--rd-chip)] text-[var(--rd-heading)] hover:bg-[var(--rd-chip-hover)]`;
  }
  return 'rd-p-md inline-flex items-center gap-2 rounded-[var(--rd-radius-sm)] px-3 py-2 text-[var(--rd-caption)] transition-colors hover:text-[var(--rd-heading)]';
}
