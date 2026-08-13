import { Fragment } from 'react';

/**
 * Deliberately minimal — handles the handful of constructs the risk disclosure text actually
 * uses (headings, blockquote callouts, bold, bullet lists, paragraphs) via line-by-line
 * parsing into React elements. No `dangerouslySetInnerHTML`, no HTML injection surface: every
 * character of a legal document renders as text, never as markup. Not a general-purpose
 * markdown renderer — if the document needs more than this, that's a signal to pull in a real
 * markdown library, not to extend this file line by line.
 */
export function MarkdownLite({ text }: { text: string }) {
  const lines = text.split('\n');
  const blocks: React.ReactNode[] = [];
  let listBuffer: string[] = [];

  function flushList() {
    if (listBuffer.length === 0) return;
    blocks.push(
      <ul key={`list-${blocks.length}`} className="my-2 list-disc space-y-1 pl-5">
        {listBuffer.map((item, i) => (
          <li key={i}>{renderInline(item)}</li>
        ))}
      </ul>,
    );
    listBuffer = [];
  }

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('## ')) {
      flushList();
      blocks.push(
        <h3 key={i} className="mb-2 mt-5 text-base font-semibold text-ink first:mt-0">
          {renderInline(trimmed.slice(3))}
        </h3>,
      );
    } else if (trimmed.startsWith('> ')) {
      flushList();
      blocks.push(
        <blockquote key={i} className="my-3 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
          {renderInline(trimmed.slice(2))}
        </blockquote>,
      );
    } else if (trimmed.startsWith('- ')) {
      listBuffer.push(trimmed.slice(2));
    } else if (trimmed === '') {
      flushList();
    } else {
      flushList();
      blocks.push(
        <p key={i} className="my-2 leading-relaxed">
          {renderInline(trimmed)}
        </p>,
      );
    }
  });
  flushList();

  return <div className="text-sm text-ink-muted">{blocks}</div>;
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <Fragment key={i}>
              <strong className="font-semibold text-ink">{part.slice(2, -2)}</strong>
            </Fragment>
          );
        }
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}
