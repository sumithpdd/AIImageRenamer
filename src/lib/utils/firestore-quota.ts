/** Shared Firestore quota cooldown so we stop hammering when free tier is exhausted. */

type QuotaGlobal = {
  __aiImageRenamerQuotaUntil?: number;
  __aiImageRenamerQuotaLogAt?: number;
};
const quotaGlobal = globalThis as typeof globalThis & QuotaGlobal;

let quotaCooldownUntil = quotaGlobal.__aiImageRenamerQuotaUntil ?? 0;
let lastQuotaLogAt = quotaGlobal.__aiImageRenamerQuotaLogAt ?? 0;

function persistQuotaState() {
  quotaGlobal.__aiImageRenamerQuotaUntil = quotaCooldownUntil;
  quotaGlobal.__aiImageRenamerQuotaLogAt = lastQuotaLogAt;
}

export function isQuotaError(error: unknown): boolean {
  const msg = String((error as any)?.message || error || '');
  const code = String((error as any)?.code || '');
  return (
    code.includes('resource-exhausted') ||
    code === '8' ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('Quota exceeded')
  );
}

export function isFirestoreQuotaCoolingDown(): boolean {
  quotaCooldownUntil = quotaGlobal.__aiImageRenamerQuotaUntil ?? quotaCooldownUntil;
  return Date.now() < quotaCooldownUntil;
}

export function markFirestoreQuotaExceeded(error?: unknown, cooldownMs = 5 * 60 * 1000): void {
  quotaCooldownUntil = Date.now() + cooldownMs;
  const now = Date.now();
  if (now - lastQuotaLogAt > 30_000) {
    lastQuotaLogAt = now;
    const detail = error ? String((error as any)?.message || error) : 'Quota exceeded';
    console.warn(`⚠️  Firestore quota exceeded — pausing Firestore I/O for ${Math.round(cooldownMs / 1000)}s. ${detail}`);
  }
  persistQuotaState();
}

export function clearFirestoreQuotaCooldown(): void {
  quotaCooldownUntil = 0;
  persistQuotaState();
}
