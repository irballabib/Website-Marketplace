export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? process.env.API_URL ?? 'http://localhost:3001';

const TENANT_CODE = process.env.NEXT_PUBLIC_TENANT_CODE ?? process.env.TENANT_CODE;

export interface ProductMedia {
  id: string;
  url: string;
  alt: string | null;
  sortOrder: number;
  isPrimary: boolean;
}

export interface ProductVariant {
  id: string;
  sku: string;
  color: string;
  size: string;
  price: string;
  stockAvailable?: string;
}

export interface ProductCategory {
  id: string;
  name: string;
  slug: string;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: ProductCategory;
  media: ProductMedia[];
  variants: ProductVariant[];
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  sortOrder: number;
}

export interface Location {
  id: string;
  code: string;
  name: string;
  type: string;
  address: string | null;
}

export interface ProductPage {
  data: Product[];
  nextCursor: string | null;
}

export interface OrderItem {
  id: string;
  variantId: string;
  productName: string;
  sku: string;
  qty: number;
  unitPrice: string;
  total: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  status: string;
  locationId: string;
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  fulfillmentType: string;
  shippingAddress: string | null;
  subtotal: string;
  shippingCost: string;
  total: string;
  expiresAt: string;
  paidAt: string | null;
  shippedAt: string | null;
  completedAt: string | null;
  courier: string | null;
  trackingNumber: string | null;
  createdAt: string;
  items: OrderItem[];
}

export interface Payment {
  id: string;
  orderId: string | null;
  status: string;
  amount: string;
  snapToken: string | null;
  redirectUrl: string | null;
}

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

async function apiPost<T>(
  path: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {}
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (TENANT_CODE) {
    headers['X-Tenant-Code'] = TENANT_CODE;
  }

  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { ...headers, ...extraHeaders },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const error = data as { code?: string; message?: string } | null;
    throw new ApiError(error?.code ?? `HTTP_${response.status}`, error?.message ?? 'Permintaan gagal');
  }

  return data as T;
}

export interface CreateOrderInput {
  items: { variantId: string; qty: number }[];
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  fulfillmentType: 'SHIP' | 'PICKUP';
  shippingAddress?: string;
  shippingCost?: string;
  locationId?: string;
  qrCode?: string;
}

export function createOrder(input: CreateOrderInput, idempotencyKey: string) {
  return apiPost<Order>('/api/v1/orders', input, { 'Idempotency-Key': idempotencyKey });
}

export function createOrderPayment(orderId: string) {
  return apiPost<Payment>(`/api/v1/payments/order/${encodeURIComponent(orderId)}`);
}

export function simulatePayment(orderId: string) {
  return apiPost<{ payment: Payment; updated: boolean }>('/api/v1/dev/payments/simulate', {
    orderId,
    status: 'PAID',
  });
}

export function getOrder(id: string) {
  return tryApiGet<Order>(`/api/v1/orders/${encodeURIComponent(id)}`);
}

async function apiGet<T>(path: string): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (TENANT_CODE) {
    headers['X-Tenant-Code'] = TENANT_CODE;
  }

  const response = await fetch(`${API_URL}${path}`, { headers, cache: 'no-store' });

  if (!response.ok) {
    throw new Error(`API ${response.status} for ${path}`);
  }

  return (await response.json()) as T;
}

export async function tryApiGet<T>(path: string): Promise<T | null> {
  try {
    return await apiGet<T>(path);
  } catch {
    return null;
  }
}

export function mediaUrl(path: string | undefined): string | null {
  return path ? `${API_URL}${path}` : null;
}

export function getProducts(query: { q?: string; category?: string } = {}) {
  const params = new URLSearchParams({ limit: '50' });
  if (query.q?.trim()) params.set('q', query.q.trim());
  if (query.category?.trim()) params.set('category', query.category.trim());
  return tryApiGet<ProductPage>(`/api/v1/catalog/products?${params.toString()}`);
}

export function getCategories() {
  return tryApiGet<{ data: Category[] }>('/api/v1/catalog/categories');
}

export function getProduct(slug: string, locationCode?: string) {
  const params = new URLSearchParams();
  if (locationCode?.trim()) params.set('locationCode', locationCode.trim());
  const suffix = params.size > 0 ? `?${params.toString()}` : '';
  return tryApiGet<Product>(`/api/v1/catalog/products/${encodeURIComponent(slug)}${suffix}`);
}

export function getLocation(code: string) {
  return tryApiGet<Location>(`/api/v1/catalog/locations/${encodeURIComponent(code)}`);
}

export function resolveQr(code: string) {
  return tryApiGet<{ code: string; targetUrl: string }>(
    `/api/v1/qr/${encodeURIComponent(code)}`
  );
}

export function formatRupiah(value: string | number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(value));
}

export function lowestPrice(product: Product): string {
  if (product.variants.length === 0) return '0';
  return product.variants.reduce(
    (min, variant) => (Number(variant.price) < Number(min) ? variant.price : min),
    product.variants[0]?.price ?? '0'
  );
}
