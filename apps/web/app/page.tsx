import Link from 'next/link';
import {
  ArrowRight,
  ShieldCheck,
  Wallet,
  LineChart,
  Users,
  Sparkles,
  Layers,
  Lock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const chains = ['Ethereum', 'Arbitrum', 'Base', 'BNB Chain', 'Polygon', 'Solana', 'TRON', 'Bitcoin'];

const plans = [
  {
    tier: 'Free',
    price: '$0',
    features: ['3 signals / day', 'Core market data', 'Spot trading', 'P2P access'],
  },
  {
    tier: 'Pro',
    price: '$29/mo',
    features: ['25 signals / day', 'Advanced indicators', 'AI explanations', 'Market scanner'],
    highlighted: true,
  },
  {
    tier: 'Elite',
    price: '$99/mo',
    features: ['Unlimited signals', 'Macro & on-chain analytics', 'Priority alerts', 'Full AI assistant'],
  },
];

export default function LandingPage() {
  return (
    <main className="mx-auto max-w-6xl px-6">
      <nav className="flex items-center justify-between py-6">
        <div className="text-lg font-semibold tracking-tight">Nexus Investments</div>
        <div className="flex items-center gap-3">
          <Link href="/login">
            <Button variant="ghost" size="sm">
              Log in
            </Button>
          </Link>
          <Link href="/register">
            <Button size="sm">Create account</Button>
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="grid gap-8 py-16 md:grid-cols-2 md:items-center md:py-24">
        <div>
          <Badge tone="accent">Sandbox — testnet, no real funds</Badge>
          <h1 className="mt-5 text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
            One account for custody, trading, and AI-assisted research.
          </h1>
          <p className="mt-4 max-w-lg text-ink-muted">
            Nexus Investments holds your crypto in an audited internal ledger backed by
            multi-chain custody, lets you trade spot markets and P2P, and layers an
            explainable AI signal engine on top — without pretending to guarantee returns.
          </p>
          <div className="mt-8 flex gap-3">
            <Link href="/register">
              <Button size="lg">
                Get started <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="#how-it-works">
              <Button size="lg" variant="secondary">
                How it works
              </Button>
            </Link>
          </div>
        </div>
        <Card className="bg-surface-raised">
          <div className="space-y-4 p-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-ink-muted">Total Portfolio</span>
              <span className="font-mono text-ink-muted">— sandbox —</span>
            </div>
            <div className="h-px bg-border" />
            {[
              ['Available', 'Wallet'],
              ['Trading', 'Reserved for open orders'],
              ['Locked', 'Withdrawals / P2P escrow'],
            ].map(([label, desc]) => (
              <div key={label} className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">{label}</div>
                  <div className="text-xs text-ink-muted">{desc}</div>
                </div>
                <span className="font-mono text-sm text-ink-muted">—</span>
              </div>
            ))}
          </div>
        </Card>
      </section>

      {/* Trust / custody */}
      <section className="grid gap-4 border-t border-border py-16 md:grid-cols-3">
        <TrustCard
          icon={<Lock className="h-5 w-5" />}
          title="Where funds are custodied"
          body="Deposits settle to hot/cold custody wallets; your balance is tracked by a double-entry internal ledger, never by raw on-chain balance. See the architecture docs for the full model."
        />
        <TrustCard
          icon={<ShieldCheck className="h-5 w-5" />}
          title="Security-first"
          body="Argon2id password hashing, TOTP 2FA, rotating sessions, device tracking, and a withdrawal risk engine gate every sensitive action."
        />
        <TrustCard
          icon={<Layers className="h-5 w-5" />}
          title="Built in the open, module by module"
          body="Every capability below ships behind a documented milestone. Nothing is presented as live before its money-movement path has an audit trail and a risk engine."
        />
      </section>

      {/* Markets */}
      <section id="markets" className="border-t border-border py-16">
        <h2 className="text-2xl font-semibold tracking-tight">Multi-chain from day one</h2>
        <p className="mt-2 max-w-2xl text-ink-muted">
          The wallet layer is chain-agnostic — adding a network is a configuration row, not a
          rewrite.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          {chains.map((chain) => (
            <Badge key={chain} tone="neutral">
              {chain}
            </Badge>
          ))}
        </div>
      </section>

      {/* AI */}
      <section id="ai" className="grid gap-8 border-t border-border py-16 md:grid-cols-2">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 text-accent">
            <Sparkles className="h-5 w-5" />
            <span className="text-sm font-medium">AI Signal Engine</span>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">
            Explainable, not guaranteed.
          </h2>
          <p className="mt-3 text-ink-muted">
            Every signal ships with an entry zone, stop loss, take-profit levels, a confidence
            score, and the indicators and market/macro context behind it — plus the real,
            immutable win-rate history for that setup. We never claim a signal is
            &ldquo;guaranteed&rdquo; or &ldquo;100% accurate.&rdquo;
          </p>
        </div>
        <Card>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium">BTC/USDT · LONG</span>
              <Badge tone="accent">Confidence 84%</Badge>
            </div>
            <div className="text-ink-muted">
              Entry $XX,XXX–XX,XXX · SL $XX,XXX · TP1/TP2/TP3 · R:R 1:3
            </div>
            <div className="text-xs text-ink-muted">
              Illustrative layout — the live Signal Engine ships in MVP6 (see roadmap).
            </div>
          </div>
        </Card>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="border-t border-border py-16">
        <h2 className="text-2xl font-semibold tracking-tight">How it works</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <Step icon={<Wallet className="h-5 w-5" />} step="1" title="Deposit" body="Get a deposit address per chain, credited to your ledger after confirmations." />
          <Step icon={<LineChart className="h-5 w-5" />} step="2" title="Trade" body="Spot markets with market, limit, stop, and OCO orders on a real order book." />
          <Step icon={<Users className="h-5 w-5" />} step="3" title="P2P" body="Buy or sell with escrow protection, reputation, and dispute resolution." />
          <Step icon={<ShieldCheck className="h-5 w-5" />} step="4" title="Withdraw" body="Every withdrawal clears a risk engine and AML screening before broadcast." />
        </div>
      </section>

      {/* Subscriptions */}
      <section id="pricing" className="border-t border-border py-16">
        <h2 className="text-2xl font-semibold tracking-tight">Signal subscriptions</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {plans.map((plan) => (
            <Card key={plan.tier} className={plan.highlighted ? 'border-accent' : undefined}>
              <div className="mb-4">
                <div className="text-sm text-ink-muted">{plan.tier}</div>
                <div className="text-2xl font-semibold">{plan.price}</div>
              </div>
              <ul className="space-y-2 text-sm text-ink-muted">
                {plan.features.map((f) => (
                  <li key={f}>• {f}</li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
        <p className="mt-4 text-xs text-ink-muted">
          Plan tiers and entitlements ship in MVP8 — pricing shown here is the product design,
          not a live checkout yet.
        </p>
      </section>

      <footer className="border-t border-border py-10 text-sm text-ink-muted">
        <p>
          Nexus Investments · Not financial advice · Sandbox deployment, no real assets are held
          or moved. Full architecture and roadmap in the repository&apos;s <code>docs/</code>{' '}
          folder.
        </p>
      </footer>
    </main>
  );
}

function TrustCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <Card>
      <div className="mb-3 text-accent">{icon}</div>
      <h3 className="mb-2 font-medium">{title}</h3>
      <p className="text-sm text-ink-muted">{body}</p>
    </Card>
  );
}

function Step({
  icon,
  step,
  title,
  body,
}: {
  icon: React.ReactNode;
  step: string;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-border p-5">
      <div className="mb-3 flex items-center gap-2 text-ink-muted">
        {icon}
        <span className="text-xs">STEP {step}</span>
      </div>
      <h3 className="mb-1 font-medium">{title}</h3>
      <p className="text-sm text-ink-muted">{body}</p>
    </div>
  );
}
