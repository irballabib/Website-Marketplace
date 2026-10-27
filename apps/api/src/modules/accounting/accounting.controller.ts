import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  CurrentUser,
  RequirePermissions,
  type AuthUser,
} from '../identity/auth.access';
import { AccountingService } from './accounting.service';
import {
  CreateJournalDto,
  ReportQueryDto,
  type BalanceSheetView,
  type IncomeStatementView,
  type JournalView,
  type TrialBalanceView,
} from './accounting.dto';

@ApiTags('accounting')
@ApiBearerAuth()
@Controller('accounting')
export class AccountingController {
  constructor(private readonly accounting: AccountingService) {}

  @Get('accounts')
  @RequirePermissions('accounting.journal.post')
  @ApiOperation({ summary: 'List chart of accounts' })
  accounts(@CurrentUser() user: AuthUser) {
    return this.accounting.listAccounts(user.tenantId);
  }

  @Post('journals')
  @RequirePermissions('accounting.journal.post')
  @ApiOperation({ summary: 'Create a balanced manual journal' })
  @ApiBody({ type: CreateJournalDto })
  createJournal(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateJournalDto
  ): Promise<JournalView> {
    return this.accounting.createManualJournal(user.tenantId, user.id, dto);
  }
}

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportController {
  constructor(private readonly accounting: AccountingService) {}

  @Get('trial-balance')
  @RequirePermissions('report.view')
  @ApiOperation({ summary: 'Trial balance from posted journals' })
  trialBalance(
    @CurrentUser() user: AuthUser,
    @Query() query: ReportQueryDto
  ): Promise<TrialBalanceView> {
    return this.accounting.trialBalance(user.tenantId, query);
  }

  @Get('income-statement')
  @RequirePermissions('report.view')
  @ApiOperation({ summary: 'Income statement from posted journals' })
  incomeStatement(
    @CurrentUser() user: AuthUser,
    @Query() query: ReportQueryDto
  ): Promise<IncomeStatementView> {
    return this.accounting.incomeStatement(user.tenantId, query);
  }

  @Get('balance-sheet')
  @RequirePermissions('report.view')
  @ApiOperation({ summary: 'Balance sheet from posted journals' })
  balanceSheet(
    @CurrentUser() user: AuthUser,
    @Query() query: ReportQueryDto
  ): Promise<BalanceSheetView> {
    return this.accounting.balanceSheet(user.tenantId, query);
  }
}
