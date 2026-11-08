import { Blobatar } from '@blobatar/react';
import 'blobatar/motion.css';
import { useUserAvatar } from '@/hooks/useUserAvatar';
import { useAuthStore } from '@/store/auth';
import { displayName } from '@/utils/displayName';
import { cn } from '@/lib/utils';

const BLOB_SCALE = 1.45;

/**
 * The user's avatar: their Telegram photo, or a blobatar when there is none.
 * The blob is generated locally from the display name (falls back to the
 * account id) and drawn without a background.
 *
 * - `animate="always"` — idle motion (profile card);
 * - `animate="hover"` — moves while the nearest `.rd-avatar-hover` ancestor is
 *   hovered (header button), see postq.css;
 * - no `animate` — static (support chat).
 */
export function UserAvatar({
  size,
  animate,
  className,
}: {
  size: number;
  animate?: 'always' | 'hover';
  className?: string;
}) {
  const user = useAuthStore((s) => s.user);
  const { src, onError } = useUserAvatar(user);
  const name = displayName(user) || undefined;

  if (src) {
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        onError={onError}
        referrerPolicy="no-referrer"
        className={cn('shrink-0 rounded-full object-cover', className)}
        style={{ width: size, height: size }}
      />
    );
  }
  // Seeded by the name, so each person gets their own blob and a rename
  // changes it; the id is the fallback for a nameless account.
  const seed = `postq-${name ?? user?.id ?? 'guest'}`;
  // Without its background the blob fills only part of its box, so it's drawn
  // larger and centred inside the same footprint as a photo avatar.
  const blobSize = Math.round(size * BLOB_SCALE);
  const inset = (blobSize - size) / 2;
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center', className)}
      style={{ width: size, height: size }}
      aria-hidden={!name}
    >
      <span className="inline-flex" style={{ margin: -inset }}>
        {animate ? (
          <Blobatar name={seed} size={blobSize} background={false} animate={animate} title={name} />
        ) : (
          <Blobatar name={seed} size={blobSize} background={false} title={name} />
        )}
      </span>
    </span>
  );
}
