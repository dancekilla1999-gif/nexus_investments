import { cn } from '@/lib/cn';

/**
 * Renders a decimal-string amount without ever converting it to a JavaScript number.
 *
 * The integer part gets thousands separators for readability; the fractional part keeps every
 * digit the backend sent, de-emphasised after the first few so a balance of
 * `0.000000000000000003` is both fully accurate and still scannable. Parsing to a float to
 * format it would silently round exactly the values this platform must not round.
 */
export function Amount({
  value,
  symbol,
  className,
  emphasizeDigits = 8,
}: {
  value: string;
  symbol?: string;
  className?: string;
  emphasizeDigits?: number;
}) {
  const negative = value.startsWith('-');
  const unsigned = negative ? value.slice(1) : value;
  const [whole, fraction = ''] = unsigned.split('.');

  const groupedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const head = fraction.slice(0, emphasizeDigits);
  const tail = fraction.slice(emphasizeDigits);

  return (
    <span className={cn('font-mono tabular-nums', className)}>
      {negative && '-'}
      {groupedWhole}
      {fraction && (
        <>
          .{head}
          {tail && <span className="text-ink-muted/50">{tail}</span>}
        </>
      )}
      {symbol && <span className="ml-1 text-ink-muted">{symbol}</span>}
    </span>
  );
}
