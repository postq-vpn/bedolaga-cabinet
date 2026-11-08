import { useEffect } from 'react';
import { usePostqDesign } from './postqDesign';

/** Puts `postq` on <html> while the redesign is shown — postq.css is scoped to it. */
export function PostqDesignClass() {
  const on = usePostqDesign();
  useEffect(() => {
    document.documentElement.classList.toggle('postq', on);
  }, [on]);
  return null;
}
