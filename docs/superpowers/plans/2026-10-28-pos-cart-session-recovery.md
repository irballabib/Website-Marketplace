# POS Cart & Session Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking. Do not commit: the user forbids automatic commits.

**Goal:** Keep the POS cart across access-token expiry and reloads, remove tokens from `localStorage`, and make retries idempotent.

**Architecture:** `PosApiClient` keeps the access token in memory and refreshes through the existing httpOnly cookie. `pos-cart.ts` persists and revalidates cart context against the live catalog. `page.tsx` preserves the cart on auth expiry and uses one idempotency key until the sale succeeds or the cashier resets the cart.

**Tech Stack:** Next.js 15, React 19, TypeScript strict, Vitest, NestJS/Supertest.

**Spec:** `docs/superpowers/specs/2026-10-28-pos-cart-session-recovery-design.md`

## Global Constraints

- Do not edit `apps/api/src/modules/booking/`.
- Do not reset, checkout, clean, commit, or overwrite staged/unstaged work.
- No new dependencies.
- Access/refresh tokens must not be written to `localStorage`.
- Do not claim success before running the commands.

## Review Focus

- Refresh returns 401: login is shown, cart survives.
- Refresh network error: session is not discarded.
- Restored cart has an out-of-stock or inactive variant: item is dropped.
- Restored cart quantity exceeds stock: quantity is clamped.
- Same idempotency key after a timeout: server returns the original sale and stock changes once.

---

### Task 1: Cart persistence and reconciliation helpers

**Files:**
- Create: `apps/pos/src/lib/pos-cart.ts`
- Test: `apps/pos/src/lib/pos-cart.spec.ts`

**Interfaces:**
- Produces:
  - `PersistedPosCart { version: 1; ownerId: string; locationId: string; shiftId: string; idempotencyKey: string | null; items: { variantId: string; qty: number }[] }`
  - `PosCartLine { item: PosCatalogItem; qty: number }`
  - `readPersistedCart(storage): PersistedPosCart | null`
  - `writePersistedCart(storage, cart): void`
  - `clearPersistedCart(storage): void`
  - `reconcileCart(persisted, catalog, context): { lines; removed; adjusted; reason }`
  - `resolveCheckoutKey(stored, generate?): string`

- [ ] **Step 1: Write failing tests** in `pos-cart.spec.ts` for round-trip, invalid storage, owner/location/shift mismatch, missing variant, zero stock, quantity clamp, fresh catalog price, and key reuse.
- [ ] **Step 2: Run** `pnpm --filter @cutbray/pos test` and confirm the new tests fail because the module is missing.
- [ ] **Step 3: Implement `pos-cart.ts`** with the exact interfaces above. Persist only variant IDs/quantities and cart context; never token data.
- [ ] **Step 4: Run** `pnpm --filter @cutbray/pos test` and confirm all POS tests pass.

### Task 2: In-memory POS API client with refresh-and-retry

**Files:**
- Modify: `apps/pos/src/lib/pos-api.ts`
- Test: `apps/pos/src/lib/pos-api.spec.ts`

**Interfaces:**
- Produces:
  - `PosAuthSession { accessToken: string; expiresIn: number; user: AuthUser }`
  - `class PosApiClient` with `login`, `restore`, `logout`, `getLocations`, `getCatalog`, `getCurrentShift`, `openShift`, `closeShift`, `createSale`
  - singleton `posApi`
- Consumes: existing response interfaces and `POS_API_URL`.

- [ ] **Step 1: Write failing tests** for `restore()` using `credentials: 'include'`, protected request sending the bearer token, 401 → one refresh → retry, refresh 401 → `AUTH_SESSION_EXPIRED`, and no second retry.
- [ ] **Step 2: Run** `pnpm --filter @cutbray/pos test` and confirm the new tests fail.
- [ ] **Step 3: Implement `PosApiClient`** with a private in-memory `accessToken`, a shared `refreshPromise`, `credentials: 'include'` on every request, and `createSale(payload, idempotencyKey)`.
- [ ] **Step 4: Run** `pnpm --filter @cutbray/pos test` and confirm all POS tests pass.

### Task 3: Wire the POS page to the new session/cart flow

**Files:**
- Modify: `apps/pos/src/app/page.tsx`

**Interfaces:**
- Consumes: `posApi`, `PosApiError`, `PosAuthSession`, and all `pos-cart.ts` helpers.
- Produces: no new exported API; UI behavior only.

- [ ] **Step 1: Replace localStorage auth** with `user` state; on mount call `posApi.restore()` and load locations using the persisted cart's location when present.
- [ ] **Step 2: Persist and reconcile the cart** after login/shift load. Drop it on owner/location/shift mismatch, clamp quantity, and show a short notice.
- [ ] **Step 3: Preserve the cart on auth expiry**: save it with its idempotency key, show the login screen, and restore after the same cashier logs in. Manual logout/location change/shift close/successful sale clears it.
- [ ] **Step 4: Stabilize checkout retries**: reuse `checkoutKeyRef.current`; write the key before `createSale`; clear it only after success or explicit reset.
- [ ] **Step 5: Run** `pnpm --filter @cutbray/pos test`, `pnpm --filter @cutbray/pos lint`, `pnpm --filter @cutbray/pos typecheck`, and `pnpm --filter @cutbray/pos build`.

### Task 4: API regression tests for expiry and duplicate prevention

**Files:**
- Modify: `apps/api/src/modules/identity/auth.http.spec.ts`
- Modify: `apps/api/src/modules/pos/pos.http.spec.ts`

- [ ] **Step 1: Add an auth test** that signs an access token with `expiresIn: -1`, expects `AUTH_INVALID_TOKEN`, refreshes with the httpOnly cookie, and expects the new token to authorize `/auth/me`.
- [ ] **Step 2: Add a POS test** that sends a sale with an expired token (expects 401 and zero sales), then retries with the same idempotency key and valid token (expects 201 and exactly one sale).
- [ ] **Step 3: Run** `$env:DATABASE_URL='postgresql://postgres@localhost:5432/cutbray_dev?schema=public'; Remove-Item Env:JWT_SECRET -ErrorAction SilentlyContinue; pnpm --filter @cutbray/api test` and confirm all API tests pass.

### Task 5: Document behavior and run scoped verification

**Files:**
- Modify: `docs/ASSUMPTIONS.md`

- [ ] **Step 1: Replace the old POS session note** with: access token in memory, refresh cookie, cart survives auth expiry/reload, manual logout clears it, owner/location/shift mismatch discards it.
- [ ] **Step 2: Run** `pnpm --filter @cutbray/pos lint`, `pnpm --filter @cutbray/pos typecheck`, `pnpm --filter @cutbray/pos test`, `pnpm --filter @cutbray/pos build`, and the API tests from Task 4.
- [ ] **Step 3: Run** `pnpm lint` only if the booking module is no longer being edited; otherwise report its failure separately. Do not touch it to make verification green.

## Self-Review

- Spec coverage: session restore, token storage, cart revalidation, idempotency, and tests map to Tasks 1–4.
- Type consistency: `PosCartLine` and `PosAuthSession` are defined once and consumed by name.
- Review Focus tests are assigned to Tasks 1, 2, and 4.
- No commit steps; user rule wins.
