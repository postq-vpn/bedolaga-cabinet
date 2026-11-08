import { RdImg } from './RdImg';
import { FOOTER_COLUMNS, FOOTER_LEGAL, FOOTER_SOCIAL, PAYMENTS, externalProps } from './links';

/** Footer of postq.space (Figma "Frame 80"), same as postq-site's RdFooter. */
export function SiteFooter({ className = '' }: { className?: string }) {
  return (
    <footer className={`rd-container pb-10 lg:pb-20 ${className}`}>
      <div className="flex flex-col gap-10 rounded-[25px] bg-[var(--rd-surface)] p-6 drop-shadow-[0px_4px_20px_rgba(0,0,0,0.05)] sm:p-8 md:gap-12 lg:p-12">
        <div className="flex flex-col justify-between gap-10 md:flex-row md:items-center md:gap-12">
          <div className="flex flex-col gap-8 md:gap-12">
            <div className="flex flex-col gap-6">
              <RdImg
                name="logo"
                alt="PostqVPN"
                width={154}
                height={31}
                className="h-[31px] w-[154px]"
              />
              <div className="rd-p-md flex flex-col gap-3 text-[var(--rd-caption)]">
                <p>© 2026 PostqVPN</p>
                <p>Доступ к любым сайтам без логов и слежки</p>
              </div>
            </div>
            <div className="rd-p-md flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-x-8">
              {FOOTER_SOCIAL.map((l) => (
                <a key={l.href} href={l.href} className="rd-link" {...externalProps(l.href)}>
                  {l.label}
                </a>
              ))}
            </div>
          </div>

          <nav aria-label="Ссылки в подвале" className="grid grid-cols-2 gap-6 sm:flex sm:gap-16">
            {FOOTER_COLUMNS.map((col) => (
              <div key={col.title} className="flex flex-col gap-4">
                <p className="rd-p-lg text-[var(--rd-heading)]">{col.title}</p>
                <ul className="rd-p-md flex flex-col gap-3 whitespace-nowrap">
                  {col.links.map((l) => (
                    <li key={l.label}>
                      <a href={l.href} className="rd-link" {...externalProps(l.href)}>
                        {l.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="flex flex-col gap-6 border-t-2 border-[var(--rd-divider)] pt-6">
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
            <div className="rd-p-md flex flex-wrap gap-x-8 gap-y-3">
              {FOOTER_LEGAL.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  className="rd-link"
                  {...(l.href.startsWith('mailto:') ? {} : { target: '_blank', rel: 'noopener' })}
                >
                  {l.label}
                </a>
              ))}
            </div>
            <ul
              aria-label="Способы оплаты"
              className="flex flex-wrap items-center justify-between gap-4 sm:justify-start sm:gap-6"
            >
              {PAYMENTS.map((p) => (
                <li key={p.src} className="flex">
                  <RdImg name={p.src} alt={p.label} width={p.w} height={p.h} />
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </footer>
  );
}
