import { isPostqDesign } from '@/design/postqDesign';
import { type ConfirmOptions, useConfirmStore } from '@/store/confirmDialog';

/**
 * Non-React entry point for the platform adapters. Under postq it opens the
 * styled dialog (ConfirmDialogHost); under the upstream design it is the plain
 * window.confirm it replaced. Lives in src/platform/ — the only place allowed
 * to touch window.confirm (biome-plugins/telegram-webview-guards.grit).
 */
export const confirmDialog = (options: ConfirmOptions): Promise<boolean> =>
  isPostqDesign()
    ? useConfirmStore.getState().confirm(options)
    : Promise.resolve(window.confirm(options.message));
