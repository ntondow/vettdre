// ============================================================
// Format helpers & P&L row types — extracted from deal-modeler.tsx
// ============================================================

export const fmt = (n: number) =>
  n >= 0 ? `$${n.toLocaleString()}` : `-$${Math.abs(n).toLocaleString()}`;

export const fmtPct = (n: number) => `${n.toFixed(2)}%`;

export const fmtX = (n: number) => `${n.toFixed(2)}x`;
