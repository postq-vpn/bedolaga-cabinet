import { useTranslation } from 'react-i18next';
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  type ReactNode,
} from 'react';

import { RdIcon } from '@/components/postq/RdIcon';

interface ToastOptions {
  type?: 'success' | 'error' | 'info' | 'warning';
  message: string;
  title?: string;
  /** Not shown: postq toasts are text-only. Kept so existing call sites compile. */
  icon?: ReactNode;
  duration?: number;
  onClick?: () => void;
}

interface Toast extends ToastOptions {
  id: number;
}

interface ToastContextType {
  showToast: (options: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

const MAX_VISIBLE = 3;

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const removeToast = useCallback((id: number) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (options: ToastOptions) => {
      const id = Date.now() + Math.random();
      const toast: Toast = { id, duration: 5000, type: 'info', ...options };

      setToasts((prev) => {
        const next = [...prev, toast];
        // Evict oldest toasts beyond the limit
        if (next.length > MAX_VISIBLE) {
          const evicted = next.slice(0, next.length - MAX_VISIBLE);
          for (const old of evicted) {
            const timer = timersRef.current.get(old.id);
            if (timer) {
              clearTimeout(timer);
              timersRef.current.delete(old.id);
            }
          }
          return next.slice(-MAX_VISIBLE);
        }
        return next;
      });

      const timer = setTimeout(() => {
        removeToast(id);
      }, toast.duration);

      timersRef.current.set(id, timer);
    },
    [removeToast],
  );

  // Cleanup all timers on unmount
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}

      {/* Toast region: centred at the top, over the header, below the safe area.
          role+aria-live lets screen readers announce toasts without stealing focus. */}
      <div
        role="region"
        aria-label={t('common.notifications')}
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-[calc(var(--rd-header-top,12px)+env(safe-area-inset-top,0px))] z-[110] mx-auto flex w-[calc(100%-32px)] max-w-[400px] flex-col gap-2"
      >
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// Plain card in the postq palette. The type shows only in the title colour of
// errors and warnings; success and info read as ordinary text.
const TITLE_COLOR = {
  success: 'text-[var(--rd-heading)]',
  info: 'text-[var(--rd-heading)]',
  warning: 'text-[var(--rd-warn-icon)]',
  error: 'text-[var(--rd-error-text)]',
} as const;

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const { t } = useTranslation();
  const type = toast.type || 'info';
  const clickable = !!toast.onClick;

  const handleClick = () => {
    toast.onClick?.();
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div
      // Errors interrupt the screen reader; everything else announces politely.
      role={type === 'error' ? 'alert' : 'status'}
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={`pointer-events-auto flex animate-slide-down items-start gap-3 rounded-[var(--rd-radius-control)] bg-[var(--rd-surface)] py-4 pl-5 pr-3 shadow-[0_8px_32px_rgba(0,0,0,0.16)] ring-1 ring-[var(--rd-divider)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rd-action)] ${
        clickable ? 'cursor-pointer' : ''
      }`}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1 py-1">
        {toast.title && <p className={`rd-p-md font-medium ${TITLE_COLOR[type]}`}>{toast.title}</p>}
        <p className={`rd-p-md ${toast.title ? 'text-[var(--rd-caption)]' : TITLE_COLOR[type]}`}>
          {toast.message}
        </p>
      </div>
      <button
        type="button"
        aria-label={t('common.close')}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="flex size-8 shrink-0 items-center justify-center rounded-full text-[var(--rd-caption)] transition-colors hover:bg-[var(--rd-icon-btn)] hover:text-[var(--rd-heading)]"
      >
        <RdIcon name="cabinet/x" size={16} />
      </button>
    </div>
  );
}
