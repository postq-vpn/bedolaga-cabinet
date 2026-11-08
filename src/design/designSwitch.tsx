import { Suspense, type ComponentProps, type ComponentType, type JSX, type ReactNode } from 'react';
import { lazyWithRetry } from '@/utils/lazyWithRetry';
import PageLoader from '@/components/common/PageLoader';
import { isPostqDesign, usePostqDesign } from './postqDesign';

/**
 * A component that renders the postq or the upstream version of itself.
 *
 * Both versions are loaded lazily, each from its own chunk, so a visitor only
 * downloads the design they actually see (before, every page carried both).
 * The version this browser is likely to show (isPostqDesign() right now) starts loading
 * as soon as this module is evaluated — in parallel with the page — so there is
 * normally nothing to wait for by the time it renders.
 *
 * `page`: show the page loader while the chunk arrives; components (cards,
 * header, shell) render nothing for that moment instead.
 */
// biome-ignore lint/suspicious/noExplicitAny: props are taken from the component, as React.lazy does.
export function designSwitch<T extends ComponentType<any>>(
  loadPostq: () => Promise<{ default: T }>,
  loadLegacy: () => Promise<{ default: ComponentType<ComponentProps<T>> }>,
  name: string,
  { page = false }: { page?: boolean } = {},
): (props: ComponentProps<T>) => JSX.Element {
  type P = ComponentProps<T>;
  const Postq = lazyWithRetry(loadPostq) as unknown as ComponentType<P>;
  const Legacy = lazyWithRetry(loadLegacy) as unknown as ComponentType<P>;
  void (isPostqDesign() ? loadPostq() : loadLegacy()).catch(() => {});

  const fallback: ReactNode = page ? <PageLoader variant="dark" /> : null;
  function Switched(props: P) {
    const p = props as P & JSX.IntrinsicAttributes;
    return (
      <Suspense fallback={fallback}>
        {usePostqDesign() ? <Postq {...p} /> : <Legacy {...p} />}
      </Suspense>
    );
  }
  Switched.displayName = name;
  return Switched;
}
