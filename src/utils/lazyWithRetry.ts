import { lazy, type ComponentType } from 'react';
import { safeSession } from './safeStorage';

/**
 * Wrapper around React.lazy that auto-reloads the page when a chunk fails to load
 * (e.g. after a new deploy with different chunk hashes).
 */
// biome-ignore lint/suspicious/noExplicitAny: same constraint as React.lazy itself.
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
) {
  return lazy(() =>
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
}
