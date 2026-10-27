import { Injectable, Logger } from '@nestjs/common';

export interface NotificationOrder {
  id: string;
  orderNumber: string;
  customerPhone: string | null;
  customerEmail: string | null;
  courier?: string | null;
  trackingNumber?: string | null;
}

function maskPhone(phone: string): string {
  return phone.length <= 6 ? '***' : `${phone.slice(0, 4)}****${phone.slice(-2)}`;
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  return domain ? `${local.slice(0, 1)}***@${domain}` : '***';
}

/**
 * Local notification adapters. WhatsApp/email/web-push are logged with masked
 * recipients; real SMTP/Mailhog and Web Push are wired in the PWA phase.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  orderCreated(order: NotificationOrder): void {
    this.notify('order.created', order, 'Pesanan dibuat, menunggu pembayaran');
  }

  orderPaid(order: NotificationOrder): void {
    this.notify('order.paid', order, 'Pembayaran diterima, pesanan diproses');
  }

  orderShipped(order: NotificationOrder): void {
    this.notify(
      'order.shipped',
      order,
      `Pesanan dikirim via ${order.courier ?? '-'} (${order.trackingNumber ?? '-'})`
    );
  }

  orderCompleted(order: NotificationOrder): void {
    this.notify('order.completed', order, 'Pesanan selesai');
  }

  orderCancelled(order: NotificationOrder): void {
    this.notify('order.cancelled', order, 'Pesanan dibatalkan');
  }

  private notify(
    event: string,
    order: NotificationOrder,
    message: string
  ): void {
    const ref = `${order.orderNumber} (${order.id})`;

    if (order.customerPhone) {
      this.logger.log(`[whatsapp-mock] ${event} -> ${maskPhone(order.customerPhone)}: ${message} [${ref}]`);
    }

    if (order.customerEmail) {
      this.logger.log(`[email-mock] ${event} -> ${maskEmail(order.customerEmail)}: ${message} [${ref}]`);
    }

    this.logger.log(`[web-push-mock] ${event} -> ${ref}`);
  }
}
