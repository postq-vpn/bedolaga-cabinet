import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { Device } from '@/types';
import { clientAppLabel } from '@/utils/clientApp';

/** What to do when the App Store has no update (wrong account region). */
const APP_STORE_REGION_HELP = 'https://postq.space/help/app-store-region';

const deviceName = (d: Device) => d.local_name || d.device_model || d.platform;

/**
 * Dashboard card when a connected device runs a VPN client older than the
 * bot's minimum (HAPP_MIN_VERSION*): the bot flags the device, the cabinet only
 * shows it. Same card shape as the gift banner — 3D illustration,
 * title + text, the update as the soft action — help links under a divider.
 */
export function OutdatedClientBanner({ devices }: { devices: Device[] }) {
  const { t } = useTranslation();
  if (devices.length === 0) return null;

  const single = devices.length === 1 ? devices[0] : null;
  const app = clientAppLabel(devices[0].app_name);
  const version = devices[0].min_app_version ?? '';
  // The App Store region guide only helps Apple devices.
  const hasApple = devices.some((d) =>
    /ios|iphone|ipad|mac|darwin/i.test(`${d.platform} ${d.user_agent ?? ''}`),
  );

  // One quiet row of links, no questions — the card stays light. Centred
  // under the full-width button on phones, under the text from `sm`.
  const help = (className: string) => (
    <div
      className={`relative flex flex-wrap items-center gap-x-6 gap-y-1 text-[14px] font-medium leading-5 ${className}`}
    >
      {hasApple && (
        <a
          href={APP_STORE_REGION_HELP}
          target="_blank"
          rel="noopener noreferrer"
          className="rd-link-action"
        >
          {t('postq.devices.regionShort')}
        </a>
      )}
      <Link to="/support" className="rd-link-action">
        {t('postq.devices.supportShort')}
      </Link>
    </div>
  );

  return (
    <section
      role="status"
      className="rd-card relative flex flex-col gap-5 overflow-hidden sm:min-h-[152px] sm:justify-center sm:pl-36"
    >
      {/* Tilted 3D «refresh», slightly cropped by the card edge: top-right on
          phones, top-left next to the title from `sm` — the same treatment as
          the gift banner's box. */}
      <img
        src="/redesign/cabinet/refresh-3d.webp"
        alt=""
        aria-hidden
        width={128}
        height={128}
        draggable={false}
        decoding="async"
        className="pointer-events-none absolute -right-4 -top-3 size-24 rotate-[14deg] select-none sm:-left-1 sm:-top-2 sm:right-auto sm:size-28 sm:-rotate-[10deg]"
      />

      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-8">
        <div className="flex min-w-0 flex-1 flex-col gap-2 pr-20 sm:pr-0">
          <h2 className="text-balance text-[20px] font-bold leading-6 text-[var(--rd-heading)]">
            {single
              ? t('postq.devices.outdatedTitleSingle', { app, device: deviceName(single) })
              : t('postq.devices.outdatedTitle', { app, count: devices.length })}
          </h2>
          <p className="rd-p-md text-pretty text-[var(--rd-caption)] sm:hidden">
            {single
              ? t('postq.devices.outdatedShortSingle', { current: single.app_version, version })
              : t('postq.devices.outdatedShort')}
          </p>
          <p className="rd-p-md hidden whitespace-pre-line text-pretty text-[var(--rd-caption)] sm:block">
            {single
              ? t('postq.devices.outdatedTextSingle', { current: single.app_version, version })
              : t('postq.devices.outdatedText')}
          </p>
          {single && help('hidden pt-1 sm:flex')}
        </div>
        {single?.update_url && (
          <a
            href={single.update_url}
            target="_blank"
            rel="noopener noreferrer"
            className="rd-btn-soft w-full shrink-0 sm:w-auto sm:min-w-[160px]"
          >
            {t('postq.devices.update')}
          </a>
        )}
      </div>

      {/* Several devices: one row each, the update link per platform. */}
      {!single && (
        <ul className="relative flex flex-col gap-2">
          {devices.map((d) => (
            <li
              key={d.hwid}
              className="rd-p-md flex min-h-14 items-center justify-between gap-4 rounded-[var(--rd-radius-sm)] bg-[var(--rd-field)] px-4 py-3"
            >
              <span className="flex min-w-0 flex-col gap-1">
                <span className="truncate font-medium text-[var(--rd-heading)]">
                  {deviceName(d)}
                </span>
                <span className="rd-p-sm text-[var(--rd-caption)]">
                  {clientAppLabel(d.app_name)} {d.app_version}
                  {d.min_app_version &&
                    ` · ${t('postq.devices.needVersion', { version: d.min_app_version })}`}
                </span>
              </span>
              {d.update_url && (
                <a
                  href={d.update_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rd-link-action shrink-0 font-medium"
                >
                  {t('postq.devices.update')}
                </a>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Phones always end with the links; from `sm` a list ends with them too. */}
      {help(single ? 'justify-center sm:hidden' : 'justify-center sm:justify-start')}
    </section>
  );
}
