import { Module } from '@nestjs/common';

import { AccountingController, ReportController } from './accounting.controller';
import { AccountingService } from './accounting.service';

@Module({
  controllers: [AccountingController, ReportController],
  providers: [AccountingService],
  exports: [AccountingService],
})
export class AccountingModule {}
