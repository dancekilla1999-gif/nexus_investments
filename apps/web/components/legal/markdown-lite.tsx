import { Fragment } from 'react';

/**
 * Deliberately minimal — handles the handful of constructs the risk disclosure text actually
 * uses (headings, blockquote callouts, bold, bullet lists, paragraphs). No
 * `dangerouslySetInnerHTML`, no HTML injection surface: every character of a legal document
 * renders as text, never as markup. Not a general-purpose markdown renderer — if a document
 * needs more than this, that is a signal to pull in a real markdown library, not to extend this
 * file line by line.
 *
 * Source text is **hard-wrapped**, so consecutive lines are joined into one block until a blank
 * line or a different block type ends it. Rendering each source line as its own paragraph — the
 * previous behaviour — split sentences mid-clause and, worse, dropped the tail of a
 * hard-wrapped `>` callout out of its warning box and into plain body text. On a risk
 * disclosure, a warning that visually ends halfway through its own sentence is not a cosmetic
 * problem.
 */
export function MarkdownLite({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];

  let paragraph: string[] = [];
  let quote: string[] = [];
  let list: string[] = [];

  function flushParagraph() {
    if (paragraph.length === 0) return;
    blocks.push(
      <p key={`p-${blocks.length}`} className="my-2 leading-relaxed">
        {renderInline(paragraph.join(' '))}
      </p>,
    );
    paragraph = [];
  }

  function flushQuote() {
    if (quote.length === 0) return;
    blocks.push(
      <blockquote
        key={`q-${blocks.length}`}
        className="my-3 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning"
      >
        {renderInline(quote.join(' '))}
      </blockquote>,
    );
    quote = [];
  }

  function flushList() {
    if (list.length === 0) return;
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="my-2 list-disc space-y-1 pl-5">
        {list.map((item, i) => (
          <li key={i}>{renderInline(item)}</li>
        ))}
      </ul>,
    );
    list = [];
  }

  function flushAll() {
    flushQuote();
    flushList();
    flushParagraph();
  }

  for (const line of text.split('\n')) {
    const trimmed = line.trim();

    if (trimmed === '') {
      flushAll();
      continue;
    }

    if (trimmed.startsWith('## ')) {
      flushAll();
      blocks.push(
        <h3 key={`h-${blocks.length}`} className="mb-2 mt-5 text-base font-semibold text-ink first:mt-0">
          {renderInline(trimmed.slice(3))}
        </h3>,
      );
      continue;
    }

    if (trimmed.startsWith('> ')) {
      flushList();
      flushParagraph();
      quote.push(trimmed.slice(2));
      continue;
    }

    if (trimmed.startsWith('- ')) {
      flushQuote();
      flushParagraph();
      list.push(trimmed.slice(2));
      continue;
    }

    // A plain line while a block is open continues it — markdown's lazy continuation, and what
    // hard wrapping means in practice. A wrapped callout stays inside its warning box; a
    // wrapped bullet stays in its bullet.
    if (quote.length > 0) {
      quote.push(trimmed);
    } else if (list.length > 0) {
      list[list.length - 1] = `${list[list.length - 1]} ${trimmed}`;
    } else {
      paragraph.push(trimmed);
    }
  }

  flushAll();

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
