import {
  Body,
  Controller,
  HttpCode,
  NotFoundException,
  Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../identity/auth.access';
import { SimulateWebhookDto, type PaymentView } from './payment.dto';
import { PaymentService } from './payment.service';

@ApiTags('payment-dev')
@Controller('dev/payments')
export class DevPaymentController {
  constructor(
    private readonly payments: PaymentService,
    private readonly config: ConfigService
  ) {}

  @Post('simulate')
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Simulate a payment webhook (development only)' })
  @ApiBody({ type: SimulateWebhookDto })
  simulate(
    @Body() dto: SimulateWebhookDto
  ): Promise<{ payment: PaymentView; updated: boolean }> {
    const env = this.config.get<string>('NODE_ENV') ?? 'development';
    if (env !== 'development') {
      throw new NotFoundException({
        code: 'DEV_ENDPOINT_DISABLED',
        message: 'Endpoint simulasi hanya aktif pada NODE_ENV=development',
      });
    }

    return this.payments.simulateWebhook(dto.orderId, dto.status);
  }
}
