import { Prisma } from '@prisma/client';
import { CoinGeckoMarkProvider } from './coingecko.mark-provider';
import { IdentityMarkProvider } from './identity.mark-provider';
import { MarkRequest } from './mark-provider.interface';

const request = (overrides: Partial<MarkRequest> = {}): MarkRequest => ({
  assetId: 'asset-btc',
  assetSymbol: 'WBTC',
  externalId: 'wrapped-bitcoin',
  quoteAssetId: 'asset-usdc',
  quoteAssetSymbol: 'USDC',
  quoteExternalId: 'usd-coin',
  ...overrides,
});

describe('IdentityMarkProvider', () => {
  const provider = new IdentityMarkProvider();

  it('prices an asset against itself at exactly one', async () => {
    const mark = await provider.getMark(request({ assetId: 'same', quoteAssetId: 'same' }));
    expect(mark!.price.equals(new Prisma.Decimal(1))).toBe(true);
    expect(mark!.source).toBe('identity');
  });

  it('has no opinion about a pair it is not identical for', async () => {
    // Crucially it does NOT mark stablecoins at par against each other: USDT is not
    // definitionally worth 1 USDC, and assuming so would overstate NAV during a depeg —
    // precisely when the number matters most.
    expect(await provider.getMark(request({ assetSymbol: 'USDT', quoteAssetSymbol: 'USDC' }))).toBeNull();
  });
});

describe('CoinGeckoMarkProvider', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  function stubFetch(body: unknown, ok = true, status = 200) {
    global.fetch = jest.fn().mockResolvedValue({
      ok,
      status,
      json: async () => body,
    }) as unknown as typeof fetch;
  }

  const nowSeconds = () => Math.floor(Date.now() / 1000);

  it('derives a cross rate through USD', async () => {
    stubFetch({
      'wrapped-bitcoin': { usd: 60000, last_updated_at: nowSeconds() },
      'usd-coin': { usd: 2, last_updated_at: nowSeconds() },
    });

    const mark = await new CoinGeckoMarkProvider().getMark(request());
    // 60000 USD per WBTC ÷ 2 USD per USDC = 30000 USDC per WBTC.
    expect(mark!.price.toFixed(0)).toBe('30000');
    expect(mark!.source).toBe('coingecko');
  });

  it('reports the age of the stalest leg, not the freshest', async () => {
    // A pair is only as fresh as its worse half. Taking the newer timestamp would let a frozen
    // quote leg hide behind an actively-updating base leg.
    const fresh = nowSeconds();
    const old = fresh - 3600;
    stubFetch({
      'wrapped-bitcoin': { usd: 60000, last_updated_at: fresh },
      'usd-coin': { usd: 1, last_updated_at: old },
    });

    const mark = await new CoinGeckoMarkProvider().getMark(request());
    expect(Math.round(mark!.asOf.getTime() / 1000)).toBe(old);
  });

  it('declines rather than guessing when an asset has no feed identifier', async () => {
    stubFetch({});
    expect(await new CoinGeckoMarkProvider().getMark(request({ externalId: null }))).toBeNull();
  });

  it('declines when the feed omits one of the legs', async () => {
    stubFetch({ 'wrapped-bitcoin': { usd: 60000, last_updated_at: nowSeconds() } });
    expect(await new CoinGeckoMarkProvider().getMark(request())).toBeNull();
  });

  it('declines on a zero or negative quote price rather than dividing by it', async () => {
    stubFetch({
      'wrapped-bitcoin': { usd: 60000, last_updated_at: nowSeconds() },
      'usd-coin': { usd: 0, last_updated_at: nowSeconds() },
    });
    expect(await new CoinGeckoMarkProvider().getMark(request())).toBeNull();
  });

  it('declines when rate-limited, rather than returning something older', async () => {
    // A 429 is an unavailable feed. Falling back to a cached-but-stale price here would defeat
    // the staleness policy the registry enforces.
    stubFetch({}, false, 429);
    expect(await new CoinGeckoMarkProvider().getMark(request())).toBeNull();
  });

  it('declines when the feed is unreachable', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;
    expect(await new CoinGeckoMarkProvider().getMark(request())).toBeNull();
  });

  it('treats a missing timestamp as maximally stale, not as fresh', async () => {
    // Defaulting an absent `last_updated_at` to "now" would make an unknown-age price look
    // current. Epoch zero guarantees the registry rejects it.
    stubFetch({
      'wrapped-bitcoin': { usd: 60000 },
      'usd-coin': { usd: 1 },
    });
    const mark = await new CoinGeckoMarkProvider().getMark(request());
    expect(mark!.asOf.getTime()).toBe(0);
  });
});
