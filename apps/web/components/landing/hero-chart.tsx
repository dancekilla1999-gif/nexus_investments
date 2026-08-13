/**
 * Purely decorative — an illustrative chart shape for visual texture on the marketing page,
 * not a rendering of real market data (that would violate docs/01-PRD.md principle #2). Real
 * charts start at MVP4 in the Trading Terminal, backed by actual market data.
 */
export function HeroChart() {
  return (
    <svg viewBox="0 0 400 200" className="h-full w-full" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="heroFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(var(--color-accent))" stopOpacity="0.25" />
          <stop offset="100%" stopColor="rgb(var(--color-accent))" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d="M0,150 L30,140 L60,155 L90,120 L120,130 L150,95 L180,105 L210,70 L240,85 L270,55 L300,65 L330,35 L360,45 L400,15 L400,200 L0,200 Z"
        fill="url(#heroFill)"
      />
      <path
        d="M0,150 L30,140 L60,155 L90,120 L120,130 L150,95 L180,105 L210,70 L240,85 L270,55 L300,65 L330,35 L360,45 L400,15"
        fill="none"
        stroke="rgb(var(--color-accent))"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {[
        [0, 150],
        [90, 120],
        [150, 95],
        [210, 70],
        [270, 55],
        [330, 35],
        [400, 15],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="3" fill="rgb(var(--color-accent))" />
      ))}
    </svg>
  );
}
