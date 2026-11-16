import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Spinner } from '@/components/ui/Spinner';
import { AnimatedCheckmark } from '@/components/ui/AnimatedCheckmark';
import { AnimatedCrossmark } from '@/components/ui/AnimatedCrossmark';

/**
 * Full-screen status card for the pages the user lands on from outside — the
 * email link, the OAuth and Telegram returns. Same card as the top-up result:
 * a mark, a heading, a line of text and the way on.
 */
export function StatusScreen({
  state,
  title,
  text,
  children,
}: {
  state: 'loading' | 'success' | 'error';
  title: string;
  text?: ReactNode;
  /** Buttons under the text. */
  children?: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[var(--rd-page)] px-4">
      <div
        className="rd-card rd-card--lg w-full max-w-[480px]"
        aria-live="polite"
        aria-atomic="true"
      >
        <motion.div
          key={state}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-6 text-center [overflow-wrap:anywhere]"
        >
          {state === 'loading' ? (
            <Spinner className="h-16 w-16 border-[3px]" />
          ) : state === 'success' ? (
            <AnimatedCheckmark className="h-12 w-12 bg-transparent" />
          ) : (
            <AnimatedCrossmark className="h-12 w-12 bg-transparent" />
          )}
          <div>
            <h1 className="rd-h5 text-[var(--rd-heading)]">{title}</h1>
            {text && <p className="rd-p-md mt-2 text-[var(--rd-caption)]">{text}</p>}
          </div>
          {children && <div className="flex w-full flex-col gap-3">{children}</div>}
        </motion.div>
      </div>
    </div>
  );
}
