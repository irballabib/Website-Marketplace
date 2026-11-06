'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  Barcode,
  CreditCard,
  LogOut,
  Minus,
  Package,
  Plus,
  Printer,
  ReceiptText,
  ShoppingBag,
  Trash2,
  Wifi,
} from 'lucide-react';

import {
  PosApiError,
  formatRupiah,
  posApi,
  type AuthUser,
  type PosCatalogItem,
  type PosLocation,
  type PosSale,
  type PosShift,
} from '../lib/pos-api';
import {
  clearPersistedCart,
  readPersistedCart,
  reconcileCart,
  resolveCheckoutKey,
  writePersistedCart,
  type PosCartLine,
} from '../lib/pos-cart';

interface PaymentLine {
  method: string;
  amount: string;
}

const METHODS = ['CASH', 'QRIS', 'TRANSFER', 'EDC'] as const;

export default function POSPage() {
  const bootstrappedRef = useRef(false);
  const checkoutKeyRef = useRef<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [email, setEmail] = useState('kasir@cutbray.local');
  const [password, setPassword] = useState('password123');
  const [locations, setLocations] = useState<PosLocation[]>([]);
  const [locationId, setLocationId] = useState('');
  const [shift, setShift] = useState<PosShift | null>(null);
  const [catalog, setCatalog] = useState<PosCatalogItem[]>([]);
  const [cart, setCart] = useState<PosCartLine[]>([]);
  const [cartReady, setCartReady] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [openingCash, setOpeningCash] = useState('100000');
  const [closingCash, setClosingCash] = useState('');
  const [discount, setDiscount] = useState('0');
  const [payments, setPayments] = useState<PaymentLine[]>([]);
  const [receipt, setReceipt] = useState<PosSale | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    void (async () => {
      try {
        const session = await posApi.restore();
        if (session) {
          setToken(session.accessToken);
          setUser(session.user);
          await loadLocations();
        }
      } catch (restoreError) {
        setError(restoreError instanceof Error ? restoreError.message : 'Gagal memulihkan sesi');
      } finally {
        setHydrated(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!token || !locationId || !user) return;
    void loadLocation(locationId);
  }, [token, locationId, user]);

  useEffect(() => {
    if (!cartReady || !user || !shift || !locationId) return;
    if (cart.length === 0) {
      clearPersistedCart(window.localStorage);
      return;
    }

    writePersistedCart(window.localStorage, {
      version: 1,
      ownerId: user.id,
      locationId,
      shiftId: shift.id,
      idempotencyKey: checkoutKeyRef.current,
      items: cart.map((line) => ({ variantId: line.item.variantId, qty: line.qty })),
    });
  }, [cart, cartReady, locationId, shift, user]);

  const total = useMemo(
    () => cart.reduce((sum, line) => sum + Number(line.item.price) * line.qty, 0),
    [cart]
  );
  const discountValue = Math.min(Number(discount) || 0, total);
  const payable = Math.max(0, total - discountValue);
  const paymentTotal = payments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);

  useEffect(() => {
    setPayments((previous) =>
      previous.length <= 1
        ? [{ method: previous[0]?.method ?? 'CASH', amount: payable ? String(payable) : '' }]
        : previous
    );
  }, [payable]);

  const filteredCatalog = catalog.filter((item) => {
    const query = searchQuery.toLowerCase();
    return (
      item.productName.toLowerCase().includes(query) ||
      item.sku.toLowerCase().includes(query) ||
      item.color.toLowerCase().includes(query) ||
      item.size.toLowerCase().includes(query)
    );
  });

  async function loadLocations() {
    try {
      const list = await posApi.getLocations();
      setLocations(list);
      setLocationId(
        (current) => list.find((location) => location.id === current)?.id ?? list[0]?.id ?? ''
      );
    } catch (loadError) {
      handleError(loadError);
    }
  }

  async function loadLocation(id: string) {
    setCartReady(false);
    try {
      const [currentShift, items] = await Promise.all([
        posApi.getCurrentShift(id),
        posApi.getCatalog(id),
      ]);
      setShift(currentShift);
      setCatalog(items);
      if (currentShift && user) {
        const persisted = readPersistedCart(window.localStorage);
        const result = reconcileCart(persisted, items, {
          ownerId: user.id,
          locationId: id,
          shiftId: currentShift.id,
        });
        setCart(result.lines);
        checkoutKeyRef.current =
          result.lines.length > 0 && result.reason === null
            ? resolveCheckoutKey(persisted?.idempotencyKey ?? null)
            : null;
        if (result.reason) {
          clearPersistedCart(window.localStorage);
          setNotice('Keranjang tersimpan dihapus karena kasir, lokasi, atau shift berbeda.');
        } else if (result.removed > 0 || result.adjusted > 0) {
          setNotice('Keranjang disesuaikan dengan stok terbaru.');
        }
      } else {
        checkoutKeyRef.current = null;
        setCart([]);
        clearPersistedCart(window.localStorage);
      }
      setCartReady(true);
      setError(null);
    } catch (loadError) {
      handleError(loadError);
    }
  }

  function handleError(loadError: unknown) {
    if (
      loadError instanceof PosApiError &&
      ['AUTH_INVALID_TOKEN', 'AUTH_SESSION_EXPIRED'].includes(loadError.code)
    ) {
      logout();
      return;
    }
    setError(loadError instanceof Error ? loadError.message : 'Terjadi kesalahan POS');
  }

  function logout() {
    checkoutKeyRef.current = null;
    clearPersistedCart(window.localStorage);
    setToken(null);
    setUser(null);
    setShift(null);
    setCatalog([]);
    setCart([]);
    setLocations([]);
    setLocationId('');
    setReceipt(null);
    setNotice(null);
    setCartReady(false);
    void posApi.logout().catch((logoutError: unknown) => {
      setError(logoutError instanceof Error ? logoutError.message : 'Gagal mengakhiri sesi');
    });
  }

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const session = await posApi.login(email, password);
      setToken(session.accessToken);
      setUser(session.user);
      setError(null);
      await loadLocations();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Login gagal');
    } finally {
      setLoading(false);
    }
  }

  async function submitOpenShift(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!locationId) return;
    setLoading(true);
    setError(null);
    try {
      const opened = await posApi.openShift({ locationId, openingCash });
      setShift(opened);
      await loadLocation(locationId);
    } catch (openError) {
      handleError(openError);
    } finally {
      setLoading(false);
    }
  }

  async function submitCloseShift(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!shift) return;
    setLoading(true);
    setError(null);
    try {
      const closed = await posApi.closeShift(shift.id, closingCash);
      setShift(null);
      setCart([]);
      setClosingCash('');
      setReceipt(null);
      checkoutKeyRef.current = null;
      clearPersistedCart(window.localStorage);
      setNotice(
        `Shift ditutup. Kas akhir ${formatRupiah(closed.closingCash ?? '0')}, selisih ${formatRupiah(closed.difference ?? '0')}.`
      );
    } catch (closeError) {
      handleError(closeError);
    } finally {
      setLoading(false);
    }
  }

  function addToCart(item: PosCatalogItem) {
    const stock = Number(item.stockAvailable);
    if (stock <= 0) return;
    setCart((previous) => {
      const existing = previous.find((line) => line.item.variantId === item.variantId);
      if (existing) {
        if (existing.qty >= stock) return previous;
        return previous.map((line) =>
          line.item.variantId === item.variantId ? { ...line, qty: line.qty + 1 } : line
        );
      }
      return [...previous, { item, qty: 1 }];
    });
  }

  function updateQty(variantId: string, delta: number) {
    setCart((previous) =>
      previous
        .map((line) =>
          line.item.variantId === variantId
            ? { ...line, qty: Math.min(Number(line.item.stockAvailable), line.qty + delta) }
            : line
        )
        .filter((line) => line.qty > 0)
    );
  }

  function addPaymentLine() {
    setPayments((previous) => [...previous, { method: 'CASH', amount: '' }]);
  }

  function updatePayment(index: number, patch: Partial<PaymentLine>) {
    setPayments((previous) =>
      previous.map((payment, position) => (position === index ? { ...payment, ...patch } : payment))
    );
  }

  function removePayment(index: number) {
    setPayments((previous) => previous.filter((_, position) => position !== index));
  }

  async function submitSale() {
    if (!token || !user || !shift || cart.length === 0) return;
    if (paymentTotal !== payable) {
      setError('Total pembayaran belum sama dengan total tagihan');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const idempotencyKey = resolveCheckoutKey(checkoutKeyRef.current);
      checkoutKeyRef.current = idempotencyKey;
      writePersistedCart(window.localStorage, {
        version: 1,
        ownerId: user.id,
        locationId: shift.locationId,
        shiftId: shift.id,
        idempotencyKey,
        items: cart.map((line) => ({ variantId: line.item.variantId, qty: line.qty })),
      });
      const sale = await posApi.createSale(
        {
          shiftId: shift.id,
          items: cart.map((line) => ({ variantId: line.item.variantId, qty: line.qty })),
          discount: String(discountValue),
          payments,
          customerName: 'Walk-in',
        },
        idempotencyKey
      );
      setReceipt(sale);
      setCart([]);
      setDiscount('0');
      setPayments([]);
      checkoutKeyRef.current = null;
      clearPersistedCart(window.localStorage);
      await loadLocation(shift.locationId);
    } catch (saleError) {
      handleError(saleError);
    } finally {
      setLoading(false);
    }
  }

  if (!hydrated) {
    return <div className="p-8 text-sm text-muted-foreground">Memuat POS...</div>;
  }

  if (!token) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <form onSubmit={(event) => void submitLogin(event)} className="w-full max-w-sm rounded-2xl border bg-card p-6 shadow-sm">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Package className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-primary">Bale Store POS</h1>
              <p className="text-xs text-muted-foreground">Masuk kasir</p>
            </div>
          </div>
          {error ? <p role="alert" className="mb-3 rounded-lg bg-destructive/5 p-2 text-sm text-destructive">{error}</p> : null}
          <label className="text-sm font-medium" htmlFor="email">Email kasir</label>
          <input id="email" name="email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required className="mb-3 mt-1 h-11 w-full rounded-lg border bg-muted/50 px-3 text-sm" />
          <label className="text-sm font-medium" htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required className="mb-4 mt-1 h-11 w-full rounded-lg border bg-muted/50 px-3 text-sm" />
          <button type="submit" disabled={loading} className="h-11 w-full rounded-lg bg-primary text-sm font-bold text-primary-foreground disabled:opacity-60">
            {loading ? 'Masuk...' : 'Masuk'}
          </button>
        </form>
      </main>
    );
  }

  return (
    <>
      <main className="flex h-screen flex-col bg-background print:hidden">
        <header className="sticky top-0 z-40 flex items-center justify-between border-b bg-card px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Package className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-lg font-extrabold text-primary">Bale Store POS</h1>
              <p className="text-xs text-muted-foreground">{user?.fullName ?? 'Kasir'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="pos-location" className="sr-only">Lokasi</label>
            <select id="pos-location" name="location" value={locationId} onChange={(event) => setLocationId(event.target.value)} className="h-11 max-w-[8rem] rounded-lg border bg-background px-3 text-sm">
              {locations.map((location) => (
                <option key={location.id} value={location.id}>{location.name}</option>
              ))}
            </select>
            <span className="hidden items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary sm:flex">
              <Wifi className="h-3 w-3" /> Online
            </span>
            <button type="button" onClick={logout} className="flex h-11 w-11 items-center justify-center rounded-lg border text-muted-foreground hover:text-foreground" aria-label="Keluar">
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </header>

        {error ? <div role="alert" className="border-b border-destructive/20 bg-destructive/5 px-4 py-2 text-sm text-destructive">{error}</div> : null}
        {notice ? <div role="status" className="border-b bg-muted/50 px-4 py-2 text-sm text-muted-foreground">{notice}</div> : null}

        {!shift ? (
          <div className="flex flex-1 items-center justify-center p-4">
            <form onSubmit={(event) => void submitOpenShift(event)} className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-sm">
              <h2 className="text-xl font-extrabold">Buka shift</h2>
              <p className="mt-1 text-sm text-muted-foreground">Masukkan modal awal kasir untuk mulai transaksi.</p>
              <label htmlFor="opening-cash" className="mt-4 block text-sm font-medium">Modal awal</label>
              <input id="opening-cash" name="openingCash" autoComplete="off" inputMode="numeric" value={openingCash} onChange={(event) => setOpeningCash(event.target.value)} className="mt-1 h-11 w-full rounded-lg border bg-muted/50 px-3 text-sm" />
              <button type="submit" disabled={loading} className="mt-4 h-11 w-full rounded-lg bg-primary text-sm font-bold text-primary-foreground disabled:opacity-60">
                {loading ? 'Membuka...' : 'Buka Shift'}
              </button>
            </form>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col md:flex-row">
            <section className="flex min-w-0 flex-1 flex-col">
              <div className="flex flex-col gap-2 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative max-w-md flex-1">
                  <Barcode className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                  <label htmlFor="pos-search" className="sr-only">Cari produk</label>
                  <input
                    id="pos-search"
                    name="search"
                    autoComplete="off"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Cari produk, warna, atau SKU..."
                    className="h-11 w-full rounded-lg border bg-muted/50 pl-10 pr-3 text-sm"
                    autoFocus
                  />
                </div>
                <form onSubmit={(event) => void submitCloseShift(event)} className="flex items-center gap-2">
                  <label htmlFor="closing-cash" className="sr-only">Kas akhir</label>
                  <input id="closing-cash" name="closingCash" autoComplete="off" value={closingCash} onChange={(event) => setClosingCash(event.target.value)} inputMode="numeric" placeholder="Kas akhir" className="h-11 w-28 rounded-lg border bg-background px-2 text-sm" />
                  <button type="submit" disabled={loading} className="h-11 rounded-lg border px-3 text-xs font-semibold text-muted-foreground hover:text-foreground">Tutup Shift</button>
                </form>
              </div>

              <div className="grid flex-1 auto-rows-min grid-cols-2 gap-3 overflow-y-auto p-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {filteredCatalog.map((item) => (
                  <button
                    key={item.variantId}
                    type="button"
                    onClick={() => addToCart(item)}
                    disabled={Number(item.stockAvailable) <= 0}
                    className="flex min-h-32 flex-col justify-between rounded-xl border bg-card p-3 text-left transition hover:border-primary/50 hover:shadow-sm disabled:opacity-50"
                  >
                    <div>
                      <p className="line-clamp-2 text-sm font-semibold">{item.productName}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{item.color} / {item.size}</p>
                      <p className="text-[11px] text-muted-foreground">{item.sku}</p>
                    </div>
                    <div className="mt-2 flex items-end justify-between gap-2">
                      <span className="text-sm font-bold text-primary">{formatRupiah(item.price)}</span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">Stok {item.stockAvailable}</span>
                    </div>
                  </button>
                ))}
                {filteredCatalog.length === 0 ? (
                  <div className="col-span-full py-12 text-center text-sm text-muted-foreground">Produk tidak ditemukan.</div>
                ) : null}
              </div>
            </section>

            <aside className="flex w-full flex-col border-t bg-card md:w-[380px] md:border-l md:border-t-0">
              <div className="flex items-center justify-between border-b p-4">
                <div className="flex items-center gap-2">
                  <ReceiptText className="h-5 w-5 text-primary" />
                  <h2 className="font-bold">Keranjang ({cart.reduce((sum, line) => sum + line.qty, 0)})</h2>
                </div>
                {cart.length > 0 ? (
                  <button type="button" onClick={() => setCart([])} className="min-h-11 px-2 text-xs text-destructive">Kosongkan</button>
                ) : null}
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                {cart.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
                    <ShoppingBag className="h-12 w-12 opacity-30" />
                    <p className="text-sm">Keranjang kosong</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {cart.map((line) => (
                      <div key={line.item.variantId} className="rounded-xl border p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold">{line.item.productName}</p>
                            <p className="text-xs text-muted-foreground">{line.item.color} / {line.item.size}</p>
                          </div>
                          <button type="button" onClick={() => updateQty(line.item.variantId, -line.qty)} aria-label="Hapus item" className="flex h-11 w-11 items-center justify-center text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="mt-2 flex items-center justify-between">
                          <div className="flex items-center rounded-lg border">
                            <button type="button" onClick={() => updateQty(line.item.variantId, -1)} aria-label="Kurangi jumlah" className="flex h-11 w-11 items-center justify-center"><Minus className="h-4 w-4" /></button>
                            <span className="w-7 text-center text-sm font-bold">{line.qty}</span>
                            <button type="button" onClick={() => updateQty(line.item.variantId, 1)} aria-label="Tambah jumlah" className="flex h-11 w-11 items-center justify-center"><Plus className="h-4 w-4" /></button>
                          </div>
                          <span className="text-sm font-semibold">{formatRupiah(Number(line.item.price) * line.qty)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t p-4">
                <label htmlFor="discount" className="text-xs font-medium text-muted-foreground">Diskon</label>
                <input id="discount" name="discount" autoComplete="off" inputMode="numeric" value={discount} onChange={(event) => setDiscount(event.target.value)} className="mb-3 mt-1 h-11 w-full rounded-lg border bg-muted/50 px-3 text-sm" />
                <div className="mb-3 space-y-2">
                  {payments.map((payment, index) => (
                    <div key={index} className="flex gap-2">
                      <select aria-label={`Metode pembayaran ${index + 1}`} name={`paymentMethod${index + 1}`} value={payment.method} onChange={(event) => updatePayment(index, { method: event.target.value })} className="h-11 rounded-lg border bg-background px-2 text-xs">
                        {METHODS.map((method) => <option key={method} value={method}>{method}</option>)}
                      </select>
                      <input aria-label={`Jumlah pembayaran ${index + 1}`} name={`paymentAmount${index + 1}`} autoComplete="off" inputMode="numeric" value={payment.amount} onChange={(event) => updatePayment(index, { amount: event.target.value })} placeholder="Jumlah" className="h-11 min-w-0 flex-1 rounded-lg border bg-muted/50 px-2 text-xs" />
                      {payments.length > 1 ? <button type="button" onClick={() => removePayment(index)} aria-label={`Hapus pembayaran ${index + 1}`} className="flex h-11 w-11 items-center justify-center text-destructive"><Trash2 className="h-4 w-4" /></button> : null}
                    </div>
                  ))}
                  <button type="button" onClick={addPaymentLine} className="min-h-11 text-xs font-semibold text-primary">+ Pembayaran lain</button>
                </div>
                <div className="mb-3 space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatRupiah(total)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Diskon</span><span>-{formatRupiah(discountValue)}</span></div>
                  <div className="flex justify-between border-t pt-1 text-base font-bold"><span>Total</span><span className="text-primary">{formatRupiah(payable)}</span></div>
                  <div className="flex justify-between text-xs"><span className="text-muted-foreground">Dibayar</span><span className={paymentTotal === payable ? 'text-primary' : 'text-destructive'}>{formatRupiah(paymentTotal)}</span></div>
                </div>
                <button type="button" onClick={() => void submitSale()} disabled={loading || cart.length === 0 || paymentTotal !== payable} className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-bold text-primary-foreground disabled:opacity-50">
                  <CreditCard className="h-5 w-5" /> {loading ? 'Memproses...' : `Bayar ${formatRupiah(payable)}`}
                </button>
              </div>
            </aside>
          </div>
        )}
      </main>

      {receipt ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 print:static print:bg-white print:p-0">
          <div className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-5 text-black shadow-xl print:max-h-none print:shadow-none">
            <div className="text-center">
              <h2 className="text-lg font-extrabold">Bale Store</h2>
              <p className="text-xs text-gray-500">Struk {receipt.receiptNumber}</p>
            </div>
            <div className="my-4 space-y-2 border-y py-3 text-sm">
              {receipt.items.map((item) => (
                <div key={item.sku} className="flex justify-between gap-3">
                  <span>{item.productName} × {item.qty}</span>
                  <span>{formatRupiah(item.total)}</span>
                </div>
              ))}
            </div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between"><span>Subtotal</span><span>{formatRupiah(receipt.subtotal)}</span></div>
              <div className="flex justify-between"><span>Diskon</span><span>-{formatRupiah(receipt.discount)}</span></div>
              <div className="flex justify-between text-base font-bold"><span>Total</span><span>{formatRupiah(receipt.total)}</span></div>
              {receipt.payments.map((payment) => (
                <div key={payment.id} className="flex justify-between text-xs text-gray-600"><span>{payment.method}</span><span>{formatRupiah(payment.amount)}</span></div>
              ))}
            </div>
            <p className="mt-4 text-center text-xs text-gray-500">Terima kasih sudah berbelanja.</p>
            <div className="mt-4 flex gap-2 print:hidden">
              <button type="button" onClick={() => window.print()} className="flex h-11 flex-1 items-center justify-center gap-1 rounded-lg bg-primary text-sm font-semibold text-primary-foreground"><Printer className="h-4 w-4" /> Cetak</button>
              <button type="button" onClick={() => setReceipt(null)} className="h-11 flex-1 rounded-lg border text-sm font-semibold">Tutup</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
