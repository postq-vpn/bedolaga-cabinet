// @vitest-environment jsdom
/**
 * postq confirms destructive actions in its own dialog everywhere — in the
 * Telegram Mini App too, where the native popup used to show (the client's
 * look, «Cancel» in the client's language).
 */
import { renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useConfirmStore } from '@/store/confirmDialog';
import { useDestructiveConfirm } from './useNativeDialog';

const popup = vi.fn();
vi.mock('@/platform/hooks/usePlatform', () => ({
  usePlatform: () => ({
    dialog: { popup, confirm: vi.fn(), alert: vi.fn() },
    capabilities: { hasNativeDialogs: true },
  }),
}));

afterEach(() => {
  vi.clearAllMocks();
  useConfirmStore.getState().close(false);
});

it('opens the postq dialog, not the Telegram popup, with the action and title', async () => {
  const { result } = renderHook(() => useDestructiveConfirm());
  const answer = result.current(
    'Подписка перестанет продлеваться сама.',
    'Отключить',
    'Отключить?',
  );

  const request = useConfirmStore.getState().request;
  expect(request).toMatchObject({
    message: 'Подписка перестанет продлеваться сама.',
    title: 'Отключить?',
    confirmLabel: 'Отключить',
    destructive: true,
  });
  expect(popup).not.toHaveBeenCalled();

  useConfirmStore.getState().close(true);
  expect(await answer).toBe(true);
});
