import { useEffect, useState } from 'react';
import Preloader from '@/components/postq/Preloader';
import { hasBootPreloader, holdBootPreloader } from '@/components/postq/bootPreloader';
import { usePostqDesign } from '@/design/postqDesign';

interface PageLoaderProps {
  variant?: 'dark' | 'light';
}

export default function PageLoader({ variant = 'dark' }: PageLoaderProps) {
  const postq = usePostqDesign();
  // While index.html's boot preloader is still up, keep it instead of drawing
  // a second loader under it (see bootPreloader.ts).
  const [underBoot] = useState(hasBootPreloader);
  useEffect(() => (underBoot ? holdBootPreloader() : undefined), [underBoot]);

  if (underBoot) return null;
  if (postq) return <Preloader />;

  const spinnerColor = variant === 'dark' ? 'border-accent-500' : 'border-accent-500';

  return (
    <div className="min-h-viewport flex items-center justify-center">
      <div
        className={`h-10 w-10 border-[3px] ${spinnerColor} animate-spin rounded-full border-t-transparent`}
      />
    </div>
  );
}
