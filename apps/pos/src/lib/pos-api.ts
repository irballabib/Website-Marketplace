export const POS_API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? process.env.NEXT_PUBLIC_POS_API_URL ?? 'http://localhost:3001';

export class PosApiError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export interface AuthUser {
  id: string;
  tenantId: string;
  email: string;
  fullName: string;
  roles: string[];
  permissions: string[];
}

export interface PosLocation {
  id: string;
  code: string;
  name: string;
  type: string;
}

export interface PosCatalogItem {
  variantId: string;
  productName: string;
  sku: string;
  color: string;
  size: string;
  price: string;
  stockAvailable: string;
}

export interface PosShift {
  id: string;
  locationId: string;
  cashierId: string;
  status: string;
  openingCash: string;
  closingCash: string | null;
  expectedCash: string | null;
  difference: string | null;
  openedAt: string;
  closedAt: string | null;
}

export interface PosPayment {
  id: string;
  method: string;
  amount: string;
  reference: string | null;
}

export interface PosSale {
  id: string;
  receiptNumber: string;
  shiftId: string;
  locationId: string;
  cashierId: string;
  status: string;
  customerName: string | null;
  subtotal: string;
  discount: string;
  total: string;
  paymentTotal: string;
  createdAt: string;
  items: { productName: string; sku: string; qty: number; unitPrice: string; total: string }[];
  payments: PosPayment[];
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  token?: string
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(init.headers as Record<string, string> | undefined),
  };
  const response = await fetch(`${POS_API_URL}${path}`, { ...init, headers });
  const data: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const error = data as { code?: string; message?: string } | null;
    throw new PosApiError(
      error?.code ?? `HTTP_${response.status}`,
      error?.message ?? 'Permintaan POS gagal'
    );
  }

  return data as T;
}

export function posLogin(email: string, password: string) {
  return request<{ accessToken: string; user: AuthUser }>('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function getLocations(token: string) {
  return request<PosLocation[]>('/api/v1/pos/locations', {}, token);
}

export function getCatalog(token: string, locationId: string) {
  return request<PosCatalogItem[]>(
    `/api/v1/pos/catalog?locationId=${encodeURIComponent(locationId)}`,
    {},
    token
  );
}

export function getCurrentShift(token: string, locationId: string) {
  return request<PosShift | null>(
    `/api/v1/pos/shifts/current?locationId=${encodeURIComponent(locationId)}`,
    {},
    token
  );
}

export function openShift(token: string, locationId: string, openingCash: string) {
  return request<PosShift>(
    '/api/v1/pos/shifts/open',
    { method: 'POST', body: JSON.stringify({ locationId, openingCash }) },
    token
  );
}

export function closeShift(token: string, shiftId: string, closingCash: string) {
  return request<PosShift>(
    `/api/v1/pos/shifts/${encodeURIComponent(shiftId)}/close`,
    { method: 'POST', body: JSON.stringify({ closingCash }) },
    token
  );
}

export interface CreateSalePayload {
  shiftId: string;
  items: { variantId: string; qty: number }[];
  discount?: string;
  payments: { method: string; amount: string; reference?: string }[];
  customerName?: string;
}

export function createSale(
  token: string,
  payload: CreateSalePayload,
  idempotencyKey: string
) {
  return request<PosSale>(
    '/api/v1/pos/sales',
    {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Idempotency-Key': idempotencyKey },
    },
    token
  );
}

export function formatRupiah(value: string | number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(value));
}
