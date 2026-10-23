/** Generic API response */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  meta?: {
    cursor?: string;
    hasMore?: boolean;
    total?: number;
  };
}

/** Paginated response */
export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  meta: {
    cursor?: string;
    hasMore: boolean;
    total?: number;
  };
}

/** Error codes */
export enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  CONFLICT = 'CONFLICT',
  IDEMPOTENCY_CONFLICT = 'IDEMPOTENCY_CONFLICT',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  STOCK_INSUFFICIENT = 'STOCK_INSUFFICIENT',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  BOOKING_EXPIRED = 'BOOKING_EXPIRED',
  PERIOD_LOCKED = 'PERIOD_LOCKED',
}

/** User roles */
export enum UserRole {
  SUPERADMIN = 'superadmin',
  ADMIN = 'admin',
  CASHIER = 'cashier',
  WAREHOUSE = 'warehouse',
  ACCOUNTANT = 'accountant',
}

/** Permissions */
export type Permission =
  | 'pos.discount.approve'
  | 'accounting.journal.post'
  | 'inventory.adjust'
  | 'production.workorder.create'
  | 'booking.policy.manage'
  | 'catalog.product.manage'
  | 'order.view'
  | 'order.manage'
  | 'report.view';

/** Order status */
export enum OrderStatus {
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  PAID = 'PAID',
  PROCESSING = 'PROCESSING',
  PACKED = 'PACKED',
  SHIPPED = 'SHIPPED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  RETURNED = 'RETURNED',
}

/** Payment status */
export enum PaymentStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
  EXPIRED = 'EXPIRED',
}

/** Payment method */
export enum PaymentMethod {
  CASH = 'CASH',
  QRIS = 'QRIS',
  TRANSFER = 'TRANSFER',
  EDC = 'EDC',
  MIDTRANS = 'MIDTRANS',
}

/** Booking status */
export enum BookingStatus {
  DRAFT = 'DRAFT',
  WAITING_DP = 'WAITING_DP',
  CONFIRMED = 'CONFIRMED',
  IN_PRODUCTION = 'IN_PRODUCTION',
  READY_FOR_SETTLEMENT = 'READY_FOR_SETTLEMENT',
  COMPLETED = 'COMPLETED',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
}

/** Booking type */
export enum BookingType {
  PREORDER_BATCH = 'PREORDER_BATCH',
  CUSTOM_SIZE = 'CUSTOM_SIZE',
  FITTING_SLOT = 'FITTING_SLOT',
}

/** Stock movement type */
export enum StockMovementType {
  RESERVATION = 'RESERVATION',
  COMMIT = 'COMMIT',
  RELEASE = 'RELEASE',
  ADJUSTMENT = 'ADJUSTMENT',
  TRANSFER_IN = 'TRANSFER_IN',
  TRANSFER_OUT = 'TRANSFER_OUT',
  OPNAME = 'OPNAME',
  PRODUCTION_IN = 'PRODUCTION_IN',
  PRODUCTION_OUT = 'PRODUCTION_OUT',
}

/** Journal entry status */
export enum JournalStatus {
  DRAFT = 'DRAFT',
  POSTED = 'POSTED',
  REVERSED = 'REVERSED',
}

/** Account type */
export enum AccountType {
  ASSET = 'ASSET',
  LIABILITY = 'LIABILITY',
  EQUITY = 'EQUITY',
  REVENUE = 'REVENUE',
  COGS = 'COGS',
  EXPENSE = 'EXPENSE',
}

/** Fiscal period status */
export enum FiscalPeriodStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
  LOCKED = 'LOCKED',
}

/** Notification channel */
export enum NotificationChannel {
  EMAIL = 'EMAIL',
  WHATSAPP = 'WHATSAPP',
  PUSH = 'PUSH',
  IN_APP = 'IN_APP',
}

/** Idempotency key scope */
export enum IdempotencyScope {
  ORDER_CHECKOUT = 'ORDER_CHECKOUT',
  POS_SALE = 'POS_SALE',
  PAYMENT_WEBHOOK = 'PAYMENT_WEBHOOK',
  BOOKING_CREATE = 'BOOKING_CREATE',
  INVENTORY_ADJUST = 'INVENTORY_ADJUST',
  JOURNAL_POST = 'JOURNAL_POST',
}