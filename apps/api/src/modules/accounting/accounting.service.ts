import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';

import { generateUuidV7 } from '../../common/id';
import { PrismaService } from '../../common/prisma/prisma.service';
import type {
  BalanceSheetView,
  CreateJournalDto,
  IncomeStatementView,
  JournalView,
  ReportQueryDto,
  TrialBalanceRow,
  TrialBalanceView,
} from './accounting.dto';

const ACCOUNT_CODES = {
  cash: '1100',
  bank: '1110',
  inventory: '1130',
  revenue: '4100',
  cogs: '5100',
} as const;

type JournalWithLines = Prisma.JournalEntryGetPayload<{
  include: { lines: { include: { account: true } } };
}>;

interface JournalLineInput {
  accountId: string;
  debit: string;
  credit: string;
  description?: string;
}

interface PostJournalInput {
  date: Date;
  description: string;
  lines: JournalLineInput[];
  referenceType?: string;
  referenceId?: string;
  postedBy?: string;
}

interface RecordSaleInput {
  tenantId: string;
  referenceType: 'ORDER' | 'POS_SALE';
  referenceId: string;
  date: Date;
  total: Decimal.Value;
  costOfGoods: Decimal.Value;
  payments: { method: string; amount: Decimal.Value }[];
  postedBy?: string;
}

@Injectable()
export class AccountingService {
  private readonly logger = new Logger(AccountingService.name);

  constructor(private readonly prisma: PrismaService) {}

  async listAccounts(tenantId: string) {
    return this.prisma.account.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, code: true, name: true, type: true, isSystem: true },
      orderBy: { code: 'asc' },
    });
  }

  async createManualJournal(
    tenantId: string,
    userId: string,
    dto: CreateJournalDto
  ): Promise<JournalView> {
    const date = new Date(dto.date);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException({
        code: 'ACCOUNTING_INVALID_DATE',
        message: 'Tanggal jurnal tidak valid',
      });
    }

    const journal = await this.prisma.$transaction((tx) =>
      this.postJournal(tx, tenantId, {
        date,
        description: dto.description.trim(),
        lines: dto.lines.map((line) => ({
          accountId: line.accountId,
          debit: line.debit ?? '0',
          credit: line.credit ?? '0',
          description: line.description?.trim(),
        })),
        referenceType: dto.referenceType?.trim() || 'MANUAL',
        referenceId: dto.referenceId?.trim() || undefined,
        postedBy: userId,
      })
    );

    return this.toJournalView(journal);
  }

  /**
   * Called inside the order/POS transaction. If the tenant has no chart of
   * accounts yet, the journal is skipped so the sale itself is not lost.
   */
  async recordSale(
    tx: Prisma.TransactionClient,
    input: RecordSaleInput
  ): Promise<void> {
    const existing = await tx.journalEntry.findFirst({
      where: {
        tenantId: input.tenantId,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
      },
      select: { id: true },
    });
    if (existing) return;

    const accounts = await tx.account.findMany({
      where: {
        tenantId: input.tenantId,
        code: { in: Object.values(ACCOUNT_CODES) },
      },
      select: { id: true, code: true },
    });
    const byCode = new Map(accounts.map((account) => [account.code, account.id]));
    if (Object.values(ACCOUNT_CODES).some((code) => !byCode.has(code))) {
      this.logger.warn(
        `Auto journal skipped for ${input.referenceType} ${input.referenceId}: chart of accounts incomplete`
      );
      return;
    }

    const total = new Decimal(input.total);
    const cost = new Decimal(input.costOfGoods);
    const lines: JournalLineInput[] = [];

    for (const payment of input.payments) {
      const amount = new Decimal(payment.amount);
      if (amount.lte(0)) continue;
      lines.push({
        accountId: payment.method === 'CASH' ? byCode.get(ACCOUNT_CODES.cash)! : byCode.get(ACCOUNT_CODES.bank)!,
        debit: amount.toFixed(2),
        credit: '0',
        description: `Pembayaran ${payment.method}`,
      });
    }

    lines.push({
      accountId: byCode.get(ACCOUNT_CODES.revenue)!,
      debit: '0',
      credit: total.toFixed(2),
      description: 'Penjualan',
    });

    if (cost.gt(0)) {
      lines.push(
        {
          accountId: byCode.get(ACCOUNT_CODES.cogs)!,
          debit: cost.toFixed(2),
          credit: '0',
          description: 'HPP penjualan',
        },
        {
          accountId: byCode.get(ACCOUNT_CODES.inventory)!,
          debit: '0',
          credit: cost.toFixed(2),
          description: 'Pengurangan persediaan',
        }
      );
    }

    await this.postJournal(tx, input.tenantId, {
      date: input.date,
      description: `Penjualan ${input.referenceType} ${input.referenceId}`,
      lines,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      postedBy: input.postedBy,
    });
  }

  async trialBalance(
    tenantId: string,
    query: ReportQueryDto
  ): Promise<TrialBalanceView> {
    const { from, to } = this.range(query);
    const lines = await this.prisma.journalLine.findMany({
      where: {
        tenantId,
        journalEntry: {
          status: 'POSTED',
          date: { gte: from, lte: to },
        },
      },
      include: {
        account: { select: { id: true, code: true, name: true, type: true } },
      },
    });

    const rows = new Map<string, TrialBalanceRow>();
    for (const line of lines) {
      const row =
        rows.get(line.accountId) ??
        {
          accountId: line.accountId,
          code: line.account.code,
          name: line.account.name,
          type: line.account.type,
          debit: '0',
          credit: '0',
          balance: '0',
        };
      row.debit = new Decimal(row.debit).plus(line.debit.toString()).toFixed(2);
      row.credit = new Decimal(row.credit).plus(line.credit.toString()).toFixed(2);
      rows.set(line.accountId, row);
    }

    const data = [...rows.values()]
      .map((row) => ({
        ...row,
        balance: new Decimal(row.debit).minus(row.credit).toFixed(2),
      }))
      .sort((a, b) => a.code.localeCompare(b.code));
    const totalDebit = data.reduce((sum, row) => sum.plus(row.debit), new Decimal(0));
    const totalCredit = data.reduce((sum, row) => sum.plus(row.credit), new Decimal(0));

    return {
      from: this.formatDate(from),
      to: this.formatDate(to),
      rows: data,
      totalDebit: totalDebit.toFixed(2),
      totalCredit: totalCredit.toFixed(2),
    };
  }

  async incomeStatement(
    tenantId: string,
    query: ReportQueryDto
  ): Promise<IncomeStatementView> {
    const trial = await this.trialBalance(tenantId, query);
    const revenue = trial.rows
      .filter((row) => row.type === 'REVENUE')
      .reduce((sum, row) => sum.plus(row.credit).minus(row.debit), new Decimal(0));
    const cogs = trial.rows
      .filter((row) => row.type === 'COGS')
      .reduce((sum, row) => sum.plus(row.debit).minus(row.credit), new Decimal(0));
    const expenses = trial.rows
      .filter((row) => row.type === 'EXPENSE')
      .reduce((sum, row) => sum.plus(row.debit).minus(row.credit), new Decimal(0));

    return {
      from: trial.from,
      to: trial.to,
      revenue: revenue.toFixed(2),
      cogs: cogs.toFixed(2),
      grossProfit: revenue.minus(cogs).toFixed(2),
      expenses: expenses.toFixed(2),
      netIncome: revenue.minus(cogs).minus(expenses).toFixed(2),
      rows: trial.rows.filter((row) =>
        ['REVENUE', 'COGS', 'EXPENSE'].includes(row.type)
      ),
    };
  }

  async balanceSheet(
    tenantId: string,
    query: ReportQueryDto
  ): Promise<BalanceSheetView> {
    const trial = await this.trialBalance(tenantId, {
      from: '1970-01-01',
      to: query.to ?? this.formatDate(new Date()),
    });
    const assets = trial.rows
      .filter((row) => row.type === 'ASSET')
      .reduce((sum, row) => sum.plus(row.debit).minus(row.credit), new Decimal(0));
    const liabilities = trial.rows
      .filter((row) => row.type === 'LIABILITY')
      .reduce((sum, row) => sum.plus(row.credit).minus(row.debit), new Decimal(0));
    const equityAccounts = trial.rows
      .filter((row) => row.type === 'EQUITY')
      .reduce((sum, row) => sum.plus(row.credit).minus(row.debit), new Decimal(0));
    const revenue = trial.rows
      .filter((row) => row.type === 'REVENUE')
      .reduce((sum, row) => sum.plus(row.credit).minus(row.debit), new Decimal(0));
    const cogs = trial.rows
      .filter((row) => row.type === 'COGS')
      .reduce((sum, row) => sum.plus(row.debit).minus(row.credit), new Decimal(0));
    const expenses = trial.rows
      .filter((row) => row.type === 'EXPENSE')
      .reduce((sum, row) => sum.plus(row.debit).minus(row.credit), new Decimal(0));
    const netIncome = revenue.minus(cogs).minus(expenses);
    const equity = equityAccounts.plus(netIncome);
    const totalLiabilitiesEquity = liabilities.plus(equity);

    return {
      asOf: trial.to,
      assets: assets.toFixed(2),
      liabilities: liabilities.toFixed(2),
      equity: equity.toFixed(2),
      netIncome: netIncome.toFixed(2),
      totalLiabilitiesEquity: totalLiabilitiesEquity.toFixed(2),
      balanced: assets.minus(totalLiabilitiesEquity).abs().lte(0.01),
      rows: trial.rows.filter((row) =>
        ['ASSET', 'LIABILITY', 'EQUITY'].includes(row.type)
      ),
    };
  }

  private async postJournal(
    tx: Prisma.TransactionClient,
    tenantId: string,
    input: PostJournalInput
  ): Promise<JournalWithLines> {
    if (input.referenceId && input.referenceType) {
      const existing = await tx.journalEntry.findFirst({
        where: {
          tenantId,
          referenceType: input.referenceType,
          referenceId: input.referenceId,
        },
        include: { lines: { include: { account: true } } },
      });
      if (existing) return existing;
    }

    const lines = input.lines.map((line) => ({
      ...line,
      debit: this.parseAmount(line.debit, 'debit'),
      credit: this.parseAmount(line.credit, 'credit'),
    }));
    const totalDebit = lines.reduce((sum, line) => sum.plus(line.debit), new Decimal(0));
    const totalCredit = lines.reduce((sum, line) => sum.plus(line.credit), new Decimal(0));

    if (totalDebit.isZero() || !totalDebit.equals(totalCredit)) {
      throw new BadRequestException({
        code: 'ACCOUNTING_UNBALANCED_JOURNAL',
        message: `Total debit ${totalDebit.toString()} tidak sama dengan total kredit ${totalCredit.toString()}`,
      });
    }

    const sequence = await tx.accountingSequence.upsert({
      where: { tenantId },
      create: { id: generateUuidV7(), tenantId, lastNumber: 1 },
      update: { lastNumber: { increment: 1 } },
    });
    const entryNumber = `JE-${this.formatDate(input.date).replace(/-/g, '')}-${String(
      sequence.lastNumber
    ).padStart(5, '0')}`;

    return tx.journalEntry.create({
      data: {
        id: generateUuidV7(),
        tenantId,
        entryNumber,
        date: new Date(`${this.formatDate(input.date)}T00:00:00.000Z`),
        description: input.description,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        status: 'POSTED',
        postedBy: input.postedBy,
        postedAt: new Date(),
        lines: {
          create: lines.map((line) => ({
            id: generateUuidV7(),
            tenantId,
            accountId: line.accountId,
            debit: new Prisma.Decimal(line.debit.toFixed(2)),
            credit: new Prisma.Decimal(line.credit.toFixed(2)),
            description: line.description,
          })),
        },
      },
      include: { lines: { include: { account: true } } },
    });
  }

  private toJournalView(journal: JournalWithLines): JournalView {
    const totalDebit = journal.lines.reduce(
      (sum, line) => sum.plus(line.debit.toString()),
      new Decimal(0)
    );
    const totalCredit = journal.lines.reduce(
      (sum, line) => sum.plus(line.credit.toString()),
      new Decimal(0)
    );

    return {
      id: journal.id,
      entryNumber: journal.entryNumber,
      date: this.formatDate(journal.date),
      description: journal.description,
      status: journal.status,
      totalDebit: totalDebit.toFixed(2),
      totalCredit: totalCredit.toFixed(2),
      lines: journal.lines.map((line) => ({
        accountId: line.accountId,
        accountCode: line.account.code,
        accountName: line.account.name,
        debit: line.debit.toFixed(2),
        credit: line.credit.toFixed(2),
        description: line.description,
      })),
    };
  }

  private parseAmount(value: string, field: string): Decimal {
    const amount = new Decimal(value);

    if (!amount.isFinite() || amount.isNegative() || amount.decimalPlaces() > 2) {
      throw new BadRequestException({
        code: 'ACCOUNTING_INVALID_AMOUNT',
        message: `${field} tidak valid`,
      });
    }

    return amount;
  }

  private range(query: ReportQueryDto): { from: Date; to: Date } {
    const from = query.from ? new Date(`${query.from}T00:00:00.000Z`) : new Date('1970-01-01T00:00:00.000Z');
    const to = query.to ? new Date(`${query.to}T23:59:59.999Z`) : new Date();

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException({
        code: 'ACCOUNTING_INVALID_RANGE',
        message: 'Rentang tanggal tidak valid',
      });
    }

    return { from, to };
  }

  private formatDate(date: Date): string {
    return date.toISOString().slice(0, 10);
  }
}
