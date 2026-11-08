// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/store/auth';
import { ADMIN_TAPS, useSecretAdminTap } from './useSecretAdminTap';

const navigate = vi.fn();
vi.mock('react-router', async (orig) => ({
  ...(await orig<typeof import('react-router')>()),
  useNavigate: () => navigate,
}));

function tapper(isAdmin: boolean) {
  useAuthStore.setState({ isAdmin });
  return renderHook(() => useSecretAdminTap(), { wrapper: MemoryRouter }).result;
}

describe('скрытый вход в админку по аватарке', () => {
  afterEach(() => {
    navigate.mockReset();
    vi.useRealTimers();
  });

  it('админ попадает в админку после пяти нажатий подряд', () => {
    const tap = tapper(true);
    for (let i = 0; i < ADMIN_TAPS - 1; i++) act(() => tap.current());
    expect(navigate).not.toHaveBeenCalled();
    act(() => tap.current());
    expect(navigate).toHaveBeenCalledWith('/admin');
  });

  it('обычному пользователю нажатия ничего не дают', () => {
    const tap = tapper(false);
    for (let i = 0; i < ADMIN_TAPS * 2; i++) act(() => tap.current());
    expect(navigate).not.toHaveBeenCalled();
  });

  it('пауза между нажатиями сбрасывает счёт', () => {
    vi.useFakeTimers();
    const tap = tapper(true);
    for (let i = 0; i < ADMIN_TAPS - 1; i++) act(() => tap.current());
    vi.advanceTimersByTime(2000);
    act(() => tap.current());
    expect(navigate).not.toHaveBeenCalled();
  });
});
