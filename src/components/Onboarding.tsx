import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { safeLocal } from '../utils/safeStorage';
import { cn } from '../lib/utils';

interface OnboardingStep {
  target: string; // data-onboarding attribute value
  title: string;
  description: string;
  placement: 'top' | 'bottom' | 'left' | 'right';
}

interface OnboardingProps {
  steps: OnboardingStep[];
  onComplete: () => void;
  onSkip: () => void;
}

const STORAGE_KEY = 'onboarding_completed';

/** Gap between the target and the spotlight edge. */
const SPOT_PAD = 8;
/** Gap between the spotlight and the tooltip (room for the arrow). */
const GAP = 16;
/** Minimum distance from the viewport edge. */
const EDGE = 16;
const MAX_WIDTH = 344;

// eslint-disable-next-line react-refresh/only-export-components
export function useOnboarding() {
  const [isCompleted, setIsCompleted] = useState(() => {
    return safeLocal.getItem(STORAGE_KEY) === 'true';
  });

  const complete = useCallback(() => {
    safeLocal.setItem(STORAGE_KEY, 'true');
    setIsCompleted(true);
  }, []);

  const reset = useCallback(() => {
    safeLocal.removeItem(STORAGE_KEY);
    setIsCompleted(false);
  }, []);

  return { isCompleted, complete, reset };
}

/** The visible element of a step: phones and desktop can each have their own. */
function findTarget(name: string): Element | null {
  const all = [...document.querySelectorAll(`[data-onboarding="${name}"]`)];
  return all.find((el) => el.getClientRects().length > 0) ?? all[0] ?? null;
}

/** The target's own corner radius, so the cut-out follows its shape. */
function targetRadius(el: Element): number {
  const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
  return Math.min(radius, 32) + SPOT_PAD;
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

type Side = 'top' | 'bottom';

/**
 * Tour over the dashboard: the target sits in a cut-out of the dimmed page,
 * the tooltip card points at it. Only the cut-out's shadow dims the page, so
 * the target itself stays at full brightness.
 */
export default function Onboarding({ steps, onComplete, onSkip }: OnboardingProps) {
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState(0);
  const [target, setTarget] = useState<{ rect: DOMRect; radius: number } | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [tooltipHeight, setTooltipHeight] = useState(180);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const step = steps[currentStep];
  const isLast = currentStep === steps.length - 1;

  /** Leave the page where the tour found it — at the top. */
  const finish = useCallback((done: () => void) => {
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    done();
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: ищем цель только при смене шага, а не на каждый ре-рендер списка шагов
  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 6;

    setIsVisible(false);

    const tryFind = () => {
      if (cancelled) return;
      const el = findTarget(step.target);
      if (el) {
        el.scrollIntoView({
          behavior: prefersReducedMotion() ? 'auto' : 'smooth',
          block: 'center',
        });
        setTarget({ rect: el.getBoundingClientRect(), radius: targetRadius(el) });
        window.setTimeout(() => {
          if (!cancelled) setIsVisible(true);
        }, 120);
        return;
      }
      attempts += 1;
      if (attempts < maxAttempts) {
        window.setTimeout(tryFind, 200);
        return;
      }
      if (currentStep === steps.length - 1) {
        onCompleteRef.current();
      } else {
        setCurrentStep((prev) => Math.min(prev + 1, steps.length - 1));
      }
    };

    const timer = window.setTimeout(tryFind, currentStep === 0 ? 300 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [step.target]);

  // Follow the target while the page scrolls (scrollIntoView) or resizes.
  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const el = findTarget(step.target);
        if (el) setTarget({ rect: el.getBoundingClientRect(), radius: targetRadius(el) });
      });
    };
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [step.target]);

  // Real tooltip height for placement (text length differs per step/locale):
  // the card is one node for the whole tour, the observer follows its size.
  useLayoutEffect(() => {
    const node = tooltipRef.current;
    if (!node) return;
    setTooltipHeight(node.offsetHeight);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setTooltipHeight(node.offsetHeight));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const handleNext = () => {
    if (isLast) finish(onComplete);
    else setCurrentStep(currentStep + 1);
  };
  const handlePrev = () => {
    if (currentStep > 0) setCurrentStep(currentStep - 1);
  };
  const handleSkip = () => finish(onSkip);

  // Trap focus inside the tooltip while the tour runs; Esc skips it.
  // lockScroll stays off so scrollIntoView can bring each target into view.
  const trapRef = useFocusTrap<HTMLDivElement>(true, { onEscape: handleSkip, lockScroll: false });
  const setTooltipNode = useCallback(
    (node: HTMLDivElement | null) => {
      tooltipRef.current = node;
      trapRef.current = node;
    },
    [trapRef],
  );

  // ── Layout ────────────────────────────────────────────────────────────
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
  const width = Math.min(MAX_WIDTH, vw - EDGE * 2);

  let tooltipStyle: React.CSSProperties = { width, top: -9999, left: 0 };
  let side: Side = 'bottom';
  let arrowX = width / 2;

  if (target) {
    const { rect } = target;
    const spotTop = rect.top - SPOT_PAD;
    const spotBottom = rect.bottom + SPOT_PAD;
    const roomBelow = vh - spotBottom - GAP - EDGE;
    const roomAbove = spotTop - GAP - EDGE;
    // Left/right placements read badly on phones and the dashboard has no
    // side room anyway — they fall back to above/below.
    const preferred: Side = step.placement === 'top' ? 'top' : 'bottom';
    side =
      preferred === 'bottom'
        ? roomBelow >= tooltipHeight || roomBelow >= roomAbove
          ? 'bottom'
          : 'top'
        : roomAbove >= tooltipHeight || roomAbove >= roomBelow
          ? 'top'
          : 'bottom';

    let top = side === 'bottom' ? spotBottom + GAP : spotTop - GAP - tooltipHeight;
    top = Math.max(EDGE, Math.min(top, vh - EDGE - tooltipHeight));

    const centerX = rect.left + rect.width / 2;
    const left = Math.max(EDGE, Math.min(centerX - width / 2, vw - EDGE - width));
    arrowX = Math.max(28, Math.min(centerX - left, width - 28));

    tooltipStyle = { width, top, left };
  }

  const spotlightStyle: React.CSSProperties = target
    ? {
        top: target.rect.top - SPOT_PAD,
        left: target.rect.left - SPOT_PAD,
        width: target.rect.width + SPOT_PAD * 2,
        height: target.rect.height + SPOT_PAD * 2,
        borderRadius: target.radius,
      }
    : { top: vh / 2, left: vw / 2, width: 0, height: 0 };

  return createPortal(
    <div
      className={cn(
        'fixed inset-0 z-[100] transition-opacity duration-300 motion-reduce:transition-none',
        isVisible ? 'opacity-100' : 'pointer-events-none opacity-0',
      )}
    >
      {/* Swallows clicks on the dimmed page: only the tour's controls work. */}
      <div aria-hidden className="absolute inset-0" />

      {/* Cut-out: its huge shadow is the dim layer, the inside stays clear. */}
      <div
        aria-hidden
        className="pointer-events-none absolute transition-[top,left,width,height,border-radius] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
        style={{
          ...spotlightStyle,
          boxShadow: '0 0 0 2px var(--rd-action), 0 0 0 9999px rgba(10, 10, 12, 0.62)',
        }}
      />

      {/* Tapping the highlighted element moves the tour on. */}
      {target && (
        <div
          aria-hidden
          className="absolute cursor-pointer"
          style={{
            top: target.rect.top,
            left: target.rect.left,
            width: target.rect.width,
            height: target.rect.height,
          }}
          onClick={handleNext}
        />
      )}

      <div
        ref={setTooltipNode}
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        aria-describedby="onboarding-desc"
        className={cn(
          'absolute flex flex-col gap-5 rounded-[var(--rd-radius-md)] bg-[var(--rd-surface)] p-6 shadow-[0_16px_48px_rgba(0,0,0,0.24)] transition-[top,left,opacity,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none',
          isVisible ? 'scale-100 opacity-100' : 'scale-95 opacity-0',
        )}
        style={tooltipStyle}
      >
        {/* Arrow toward the target, wherever the card got clamped to. */}
        <span
          aria-hidden
          className={cn(
            'absolute size-4 rotate-45 rounded-[3px] bg-[var(--rd-surface)]',
            side === 'bottom' ? '-top-1.5' : '-bottom-1.5',
          )}
          style={{ left: arrowX - 8 }}
        />

        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5" aria-hidden>
            {steps.map((s, index) => (
              <span
                key={s.target}
                className={cn(
                  'h-1.5 rounded-full transition-all duration-300 motion-reduce:transition-none',
                  index === currentStep
                    ? 'w-6 bg-[var(--rd-action)]'
                    : index < currentStep
                      ? 'w-1.5 bg-[var(--rd-action)] opacity-40'
                      : 'w-1.5 bg-[var(--rd-border)]',
                )}
              />
            ))}
          </div>
          <span className="rd-p-sm text-[var(--rd-caption)]">
            {t('onboarding.progress', {
              current: currentStep + 1,
              total: steps.length,
              defaultValue: '{{current}} of {{total}}',
            })}
          </span>
        </div>

        <div className="flex flex-col gap-2">
          <h3
            id="onboarding-title"
            className="text-balance text-[20px] font-bold leading-6 text-[var(--rd-heading)]"
          >
            {step.title}
          </h3>
          <p id="onboarding-desc" className="rd-p-md text-pretty text-[var(--rd-caption)]">
            {step.description}
          </p>
        </div>

        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={handleSkip} className="rd-link rd-p-md">
            {t('onboarding.skip', 'Skip')}
          </button>
          <div className="flex gap-2">
            {currentStep > 0 && (
              <button
                type="button"
                onClick={handlePrev}
                className="rd-btn-soft !min-h-11 !rounded-[var(--rd-radius-sm)] !px-4"
              >
                {t('common.back', 'Back')}
              </button>
            )}
            <button
              type="button"
              onClick={handleNext}
              className="rd-btn !min-h-11 !rounded-[var(--rd-radius-sm)] !px-5"
            >
              {isLast ? t('onboarding.finish', 'Finish') : t('common.next', 'Next')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
