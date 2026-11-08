import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

// Ported from postq-site (src/components/redesign/RdPreloader.tsx).
// Frames of public/redesign/preloader.json: the logo animates over 0–107 and
// holds until 153. We loop 0–153 while something is loading.
const LOOP: [number, number] = [0, 153];
/** Playback rate; index.html's boot preloader uses the same value. */
export const PRELOADER_SPEED = 1.5;

/** The looping postq logo animation (Lottie "Liquid VPN route"). Sized by the
 *  caller through `className`; keeps the file's 789×835 aspect ratio. */
export function PreloaderLogo({ className }: { className?: string }) {
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let destroyed = false;
    let anim: { destroy: () => void } | undefined;
    const box = boxRef.current;
    // Light build: SVG renderer only, no expressions — all this file needs.
    import('lottie-web/build/player/lottie_light').then(
      ({ default: lottie }) => {
        if (destroyed || !box) return;
        const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
        const a = lottie.loadAnimation({
          container: box,
          renderer: 'svg',
          loop: true,
          autoplay: false,
          path: '/redesign/preloader.json',
        });
        a.setSpeed(PRELOADER_SPEED);
        a.addEventListener('DOMLoaded', () => {
          if (reduce) a.goToAndStop(LOOP[1], true);
          else a.playSegments(LOOP, true);
        });
        anim = a;
      },
      () => {},
    );
    return () => {
      destroyed = true;
      anim?.destroy();
    };
  }, []);

  return <div ref={boxRef} aria-hidden className={cn('aspect-[789/835]', className)} />;
}

/** Full-screen loading overlay, as on postq-site. It fades in only after a
 *  short delay (.rd-preloader in postq.css), so fast loads never see it; it
 *  lives as long as the caller keeps it mounted. */
export default function Preloader() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="rd-preloader fixed inset-0 z-[100] flex items-center justify-center bg-[var(--rd-page)]"
    >
      <PreloaderLogo className="w-[120px] sm:w-[150px]" />
    </div>
  );
}
