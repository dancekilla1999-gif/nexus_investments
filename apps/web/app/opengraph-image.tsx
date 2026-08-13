import { ImageResponse } from 'next/og';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '80px',
          background: '#08090c',
          color: '#edeff3',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 40 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: '#0a0d12',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid #20252e',
            }}
          >
            <svg width="26" height="26" viewBox="0 0 32 32">
              <path
                d="M8 21 L13 14 L17 17 L24 8"
                stroke="#3b82f6"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
              <circle cx="24" cy="8" r="2.2" fill="#3b82f6" />
            </svg>
          </div>
          <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em' }}>
            Nexus Investments
          </div>
        </div>
        <div style={{ fontSize: 56, fontWeight: 600, letterSpacing: '-0.02em', maxWidth: 900, lineHeight: 1.15 }}>
          Custody, trading, and AI-assisted research in one account.
        </div>
        <div style={{ fontSize: 26, color: '#949ba8', marginTop: 28, maxWidth: 820 }}>
          A double-entry ledger, multi-chain custody, and an explainable signal engine —
          engineered, not themed.
        </div>
      </div>
    ),
    { ...size },
  );
}
