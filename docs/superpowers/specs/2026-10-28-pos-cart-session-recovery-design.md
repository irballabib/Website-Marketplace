# POS Cart & Session Recovery — Design

**Date:** 2026-10-28
**Status:** Approved approach (option 2)
**Scope:** `apps/pos` auth/cart flow plus POS/auth regression tests.

## Intent

A cashier must not lose an unpaid cart when the 15-minute access token expires, and the browser must not keep access or refresh tokens in `localStorage`.

## Goals

- Access token lives only in memory; refresh token stays in the existing httpOnly cookie.
- On reload or expired access token, POS silently restores the session through `/api/v1/auth/refresh`.
- A failed refresh shows login without deleting the cart.
- Restored carts are revalidated against the current server catalog (active product/variant, price, stock, location, shift, cashier).
- Retries reuse one idempotency key so a timeout cannot create a second sale.
- POS tests cover expired token retry, refresh failure, cart recovery, stock changes, and key reuse.

## Non-goals

- POS offline/Dexie queue, ESC/POS, barcode camera, and discount supervisor PIN.
- Changes to the booking module or unrelated staged work.
- Server-side BFF/proxy; the existing CORS `credentials: true` and httpOnly refresh cookie are sufficient.

## Approach

1. `PosApiClient` owns the in-memory access token. `restore()` calls the refresh endpoint with `credentials: 'include'`; protected requests retry once after a 401. Concurrent refreshes share one promise.
2. `pos-cart.ts` persists only cart context and variant IDs/quantities, never tokens. Restore reconciles against the fresh catalog, clamps quantity to stock, drops inactive/missing items, and rejects owner/location/shift mismatches.
3. `page.tsx` keeps auth in React state, preserves the cart on auth expiry, clears it only on manual logout/location change/shift close/successful sale, and persists one idempotency key until success or explicit reset.
4. Existing API idempotency remains the source of truth; tests prove the same key returns one sale.

## Constraints

- No new dependencies.
- No `localStorage` token storage.
- No commits.
- Do not edit `apps/api/src/modules/booking/` or overwrite other staged/unstaged work.
- UI copy in Indonesian; code/comments in English.

## Risks

- A different cashier logging in on the same browser must not inherit the previous cart; owner mismatch discards it.
- A cart whose shift was closed is discarded because the new shift ID differs.
- If refresh itself fails due network, the session is kept and an error is shown; only a 401 refresh failure forces login.
- `pnpm verify` may still fail on the unrelated booking module; POS/auth checks are reported separately.
