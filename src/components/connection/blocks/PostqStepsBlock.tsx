import type { BlockRendererProps } from './types';

/**
 * Installation steps in the postq style: a plain number, the step text and its
 * action on the right (below the text on phones). No badges or tinted circles.
 */
export function PostqStepsBlock({
  blocks,
  getLocalizedText,
  renderBlockButtons,
}: BlockRendererProps) {
  const visible = blocks.filter(
    (b) =>
      getLocalizedText(b.title) ||
      getLocalizedText(b.description) ||
      b.buttons?.length ||
      b.customNode,
  );
  if (!visible.length) return null;

  return (
    <ol className="flex flex-col">
      {visible.map((block, i) => {
        const title = getLocalizedText(block.title);
        const description = getLocalizedText(block.description);
        return (
          <li
            key={i}
            className="flex flex-col gap-4 border-b border-[var(--rd-border)] py-6 last:border-b-0 last:pb-0"
          >
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:gap-8">
              <div className="flex min-w-0 flex-1 gap-4">
                <span className="rd-p-lg w-6 shrink-0 tabular-nums text-[var(--rd-placeholder)]">
                  {i + 1}
                </span>
                <div className="flex min-w-0 flex-col gap-1">
                  {title && (
                    <h3 className="rd-p-lg font-medium text-[var(--rd-heading)]">{title}</h3>
                  )}
                  {description && (
                    <p className="rd-p-md whitespace-pre-line text-[var(--rd-caption)]">
                      {description}
                    </p>
                  )}
                </div>
              </div>
              {/* BlockButtons brings its own top margin — not needed in this row. */}
              <div className="flex shrink-0 flex-wrap gap-2 pl-10 empty:hidden md:pl-0 [&>div]:mt-0">
                {renderBlockButtons(block.buttons, 'light')}
              </div>
            </div>
            {block.customNode && <div className="pl-10">{block.customNode}</div>}
          </li>
        );
      })}
    </ol>
  );
}
