import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { safeSession } from './safeStorage';

/** A lazy component that can be loaded ahead of its first render. */
export type Preloadable = { preload?: () => Promise<void> };

/** React.lazy's internals: calling `_init` resolves the module or throws its promise. */
type LazyInternals = { _init: (payload: unknown) => unknown; _payload: unknown };

const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  !!value && typeof (value as PromiseLike<unknown>).then === 'function';

/**
 * Wrapper around React.lazy that auto-reloads the page when a chunk fails to load
 * (e.g. after a new deploy with different chunk hashes).
 *
 * `preload()` loads the chunk and settles the lazy component, so its first
 * render doesn't suspend (switching tabs would otherwise wait for the chunk with
 * the old screen frozen, then mount the new one in the middle of the animation).
 * A component the module exports may be preloadable too (designSwitch) — that
 * one is loaded as well.
 */
// biome-ignore lint/suspicious/noExplicitAny: same constraint as React.lazy itself.
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
): LazyExoticComponent<T> & Required<Preloadable> {
  const Lazy = lazy(() =>
    factory().catch(() => {
      const key = 'chunk_reload_ts';
      const last = Number(safeSession.getItem(key) || '0');
      // Метка обязана пережить сам reload — в этом её единственный смысл. Если
      // сохранить её негде, перезагрузка станет бесконечной: после reload метки
      // не окажется, и условие снова выполнится. Лучше отдать ошибку в
      // ErrorBoundary, чем крутить страницу по кругу.
      if (Date.now() - last > 30_000 && safeSession.setItem(key, String(Date.now()))) {
        window.location.reload();
      }
      // Re-throw so ErrorBoundary catches it if reload guard prevents loop
      return factory();
    }),
  );

  const { _init, _payload } = Lazy as unknown as LazyInternals;
  const resolve = (): unknown => {
    try {
      return _init(_payload);
    } catch (thrown) {
      if (isThenable(thrown)) return thrown;
      return undefined; // a failed chunk: the render reports it through ErrorBoundary
    }
  };

  async function preload() {
    let component = resolve();
    if (isThenable(component)) {
      await Promise.resolve(component).catch(() => {});
      component = resolve();
    }
    if (component && !isThenable(component)) await (component as Preloadable).preload?.();
  }

  return Object.assign(Lazy, { preload });
}
