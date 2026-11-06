export const POS_API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? process.env.NEXT_PUBLIC_POS_API_URL ?? 'http://localhost:3001';

export class PosApiError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'PosApiError';
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

export interface PosPaymentInput {
  method: string;
  amount: string;
}

export interface PosPaymentView extends PosPaymentInput {
  id: string;
  reference: string | null;
}

export interface PosSaleItem {
  id: string;
  variantId: string;
  productName: string;
  sku: string;
  qty: number;
  unitPrice: string;
  total: string;
}

export interface PosSale {
  id: string;
  receiptNumber: string;
  locationId: string;
  shiftId: string;
  cashierId: string;
  status: string;
  customerName: string | null;
  subtotal: string;
  discount: string;
  total: string;
  paymentTotal: string;
  createdAt: string;
  voidedAt: string | null;
  voidReason: string | null;
  items: PosSaleItem[];
  payments: PosPaymentView[];
}

export interface PosAuthSession {
  accessToken: string;
  expiresIn: number;
  user: AuthUser;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isAuthUser(value: unknown): value is AuthUser {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.tenantId === 'string' &&
    typeof value.email === 'string' &&
    typeof value.fullName === 'string' &&
    Array.isArray(value.roles) &&
    value.roles.every((role) => typeof role === 'string') &&
    Array.isArray(value.permissions) &&
    value.permissions.every((permission) => typeof permission === 'string')
  );
}

function parseSession(value: unknown): PosAuthSession | null {
  if (
    !isRecord(value) ||
    typeof value.accessToken !== 'string' ||
    typeof value.expiresIn !== 'number' ||
    !isAuthUser(value.user)
  ) {
    return null;
  }
  return {
    accessToken: value.accessToken,
    expiresIn: value.expiresIn,
    user: value.user,
  };
}

async function readJson(response: Response): Promise<unknown> {
  if (response.status === 204 || !response.headers.get('content-type')?.includes('application/json')) {
    return null;
  }
  return response.json();
}

function apiError(status: number, body: unknown): PosApiError {
  if (isRecord(body)) {
    const code = typeof body.code === 'string' ? body.code : `HTTP_${status}`;
    const message = typeof body.message === 'string' ? body.message : 'Permintaan POS gagal';
    return new PosApiError(code, message);
  }
  return new PosApiError(`HTTP_${status}`, 'Permintaan POS gagal');
}

export class PosApiClient {
  private accessToken: string | null = null;
  private refreshPromise: Promise<PosAuthSession | null> | null = null;
  private readonly fetcher: typeof fetch;

  constructor(fetcher: typeof fetch = fetch) {
    this.fetcher = fetcher.bind(globalThis);
  }

  async login(email: string, password: string): Promise<PosAuthSession> {
    const response = await this.fetcher(`${POS_API_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      credentials: 'include',
    });
    const body = await readJson(response);
    if (!response.ok) {
      throw apiError(response.status, body);
    }

    const session = parseSession(body);
    if (!session) {
      throw new PosApiError('AUTH_INVALID_RESPONSE', 'Respons login tidak valid');
    }
    this.accessToken = session.accessToken;
    return session;
  }

  async restore(): Promise<PosAuthSession | null> {
    return this.refresh();
  }

  async logout(): Promise<void> {
    try {
      const response = await this.fetcher(`${POS_API_URL}/api/v1/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok && response.status !== 401) {
        throw apiError(response.status, await readJson(response));
      }
    } finally {
      this.accessToken = null;
    }
  }

  async getLocations(): Promise<PosLocation[]> {
    return this.request<PosLocation[]>('/api/v1/pos/locations');
  }

  async getCatalog(locationId: string): Promise<PosCatalogItem[]> {
    const query = new URLSearchParams({ locationId });
    return this.request<PosCatalogItem[]>(`/api/v1/pos/catalog?${query.toString()}`);
  }

  async getCurrentShift(locationId: string): Promise<PosShift | null> {
    const query = new URLSearchParams({ locationId });
    return this.request<PosShift | null>(`/api/v1/pos/shifts/current?${query.toString()}`);
  }

  async openShift(dto: { locationId: string; openingCash: string }): Promise<PosShift> {
    return this.request<PosShift>('/api/v1/pos/shifts/open', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  async closeShift(shiftId: string, closingCash: string): Promise<PosShift> {
    return this.request<PosShift>(`/api/v1/pos/shifts/${encodeURIComponent(shiftId)}/close`, {
      method: 'POST',
      body: JSON.stringify({ closingCash }),
    });
  }

  async createSale(
    payload: {
      shiftId: string;
      items: { variantId: string; qty: number }[];
      discount: string;
      payments: PosPaymentInput[];
      customerName?: string;
    },
    idempotencyKey: string
  ): Promise<PosSale> {
    return this.request<PosSale>('/api/v1/pos/sales', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Idempotency-Key': idempotencyKey },
    });
  }

  private async refresh(): Promise<PosAuthSession | null> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.performRefresh();
    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async performRefresh(): Promise<PosAuthSession | null> {
    const response = await this.fetcher(`${POS_API_URL}/api/v1/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });

    if (response.status === 401) {
      this.accessToken = null;
      return null;
    }

    const body = await readJson(response);
    if (!response.ok) {
      this.accessToken = null;
      throw apiError(response.status, body);
    }

    const session = parseSession(body);
    if (!session) {
      this.accessToken = null;
      throw new PosApiError('AUTH_INVALID_RESPONSE', 'Respons pemulihan sesi tidak valid');
    }
    this.accessToken = session.accessToken;
    return session;
  }

  private async request<T>(
    path: string,
    init: RequestInit = {},
    retryAuth = true
  ): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    if (init.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    if (this.accessToken) {
      headers.set('Authorization', `Bearer ${this.accessToken}`);
    }

    const response = await this.fetcher(`${POS_API_URL}${path}`, {
      ...init,
      credentials: 'include',
      headers,
    });

    if (response.status === 401 && this.accessToken && retryAuth) {
      const session = await this.refresh();
      if (session) {
        return this.request<T>(path, init, false);
      }
      throw new PosApiError('AUTH_SESSION_EXPIRED', 'Sesi berakhir, silakan login kembali');
    }

    const body = await readJson(response);
    if (!response.ok) {
      if (response.status === 401) {
        this.accessToken = null;
      }
      throw apiError(response.status, body);
    }
    return body as T;
  }
}

export function formatRupiah(amount: string | number): string {
  const value = typeof amount === 'number' ? amount : Number(amount);
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 2,
  }).format(value);
}

export const posApi = new PosApiClient();
