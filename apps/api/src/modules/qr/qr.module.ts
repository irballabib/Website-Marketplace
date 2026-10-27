import { Module } from '@nestjs/common';

import { AdminQrController, QrController } from './qr.controller';
import { QrService } from './qr.service';

@Module({
  controllers: [QrController, AdminQrController],
  providers: [QrService],
  exports: [QrService],
})
export class QrModule {}
