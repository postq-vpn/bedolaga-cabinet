import { Navigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { SectionBody, sectionId, useInfoSections } from '@/components/postq/profile/InfoCard';

/**
 * Документ из «Документы и помощь» отдельной страницей (/profile/docs/:id):
 * FAQ, правила, политика, оферта, статусы и свои страницы админа. «Назад» —
 * в шапке, как у остальных вложенных экранов. Раздел, которого больше нет
 * (админ скрыл, страницу удалили), возвращает в профиль.
 */
export default function InfoDocument() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const { sections, ready } = useInfoSections();
  const section = sections.find((s) => sectionId(s) === id);

  if (!section) {
    if (ready) return <Navigate to="/profile" replace />;
    return <p className="rd-p-md text-[var(--rd-caption)]">{t('common.loading')}</p>;
  }

  return (
    <div className="flex max-w-[800px] flex-col gap-6 lg:gap-8">
      <h1 className="rd-h3 text-[var(--rd-heading)]">{section.label}</h1>
      <section className="rd-card rd-card--lg">
        <SectionBody section={section} />
      </section>
    </div>
  );
}
