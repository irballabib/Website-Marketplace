import { VersioningType, ValidationPipe, type INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../../app.module';
import { HttpExceptionFilter } from '../../common/filters/http-exception.filter';
import { generateUuidV7 } from '../../common/id';
import { AccountingService } from './accounting.service';

const databaseUrl = process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

const JWT_SECRET = 'accounting-http-test-secret-32-characters';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? JWT_SECRET;

const PERMISSION_CODES = ['accounting.journal.post', 'report.view'];

interface JournalBody {
  id: string;
  entryNumber: string;
  totalDebit: string;
  totalCredit: string;
  lines: { accountCode: string; debit: string; credit: string }[];
}

interface TrialBalanceBody {
  totalDebit: string;
  totalCredit: string;
  rows: { code: string; debit: string; credit: string }[];
}

interface IncomeStatementBody {
  revenue: string;
  cogs: string;
  expenses: string;
  netIncome: string;
}

interface BalanceSheetBody {
  assets: string;
  liabilities: string;
  equity: string;
  balanced: boolean;
}

suite('Accounting API (HTTP)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  let accounting: AccountingService;

  const tenantId = generateUuidV7();
  const suffix = tenantId.slice(-8);
  const userId = generateUuidV7();
  const email = `accounting-${suffix}@cutbray.local`;
  const createdPermissionIds: string[] = [];

  const accountIds: Record<string, string> = {};
  let token = '';

  beforeAll(async () => {
    await prisma.tenant.create({
      data: { id: tenantId, name: `Accounting Test ${suffix}`, code: `acc-${suffix}` },
    });

    const accounts = [
      { code: '1100', name: 'Kas', type: 'ASSET' },
      { code: '1110', name: 'Bank', type: 'ASSET' },
      { code: '1130', name: 'Persediaan Barang Jadi', type: 'ASSET' },
      { code: '3100', name: 'Modal', type: 'EQUITY' },
      { code: '4100', name: 'Penjualan', type: 'REVENUE' },
      { code: '5100', name: 'HPP Penjualan', type: 'COGS' },
      { code: '6100', name: 'Beban Gaji', type: 'EXPENSE' },
    ];
    for (const account of accounts) {
      const created = await prisma.account.create({
        data: {
          id: generateUuidV7(),
          tenantId,
          ...account,
          isSystem: true,
        },
      });
      accountIds[account.code] = created.id;
    }

    const permissions: { id: string }[] = [];
    for (const code of PERMISSION_CODES) {
      const existing = await prisma.permission.findUnique({ where: { code } });
      const permission =
        existing ??
        (await prisma.permission.create({
          data: { code, name: code, category: 'Accounting' },
        }));
      if (!existing) {
        createdPermissionIds.push(permission.id);
      }
      permissions.push(permission);
    }

    const role = await prisma.role.create({
      data: { tenantId, name: `accounting-${suffix}`, description: 'Accounting test role' },
    });
    for (const permission of permissions) {
      await prisma.rolePermission.create({
        data: { tenantId, roleId: role.id, permissionId: permission.id },
      });
    }
    await prisma.user.create({
      data: {
        id: userId,
        tenantId,
        email,
        fullName: 'Accountant',
        passwordHash: 'not-used-by-this-suite',
        isActive: true,
        isVerified: true,
      },
    });
    await prisma.userRole.create({ data: { tenantId, userId, roleId: role.id } });

    token = await new JwtService({ secret: JWT_SECRET }).signAsync({
      sub: userId,
      tenantId,
      type: 'access',
    });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      })
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    server = app.getHttpServer() as Parameters<typeof request>[0];
    accounting = app.get(AccountingService);
  });

  beforeEach(async () => {
    await prisma.journalLine.deleteMany({ where: { tenantId } });
    await prisma.journalEntry.deleteMany({ where: { tenantId } });
    await prisma.accountingSequence.deleteMany({ where: { tenantId } });
  });

  afterAll(async () => {
    await app?.close();
    await prisma.journalLine.deleteMany({ where: { tenantId } });
    await prisma.journalEntry.deleteMany({ where: { tenantId } });
    await prisma.accountingSequence.deleteMany({ where: { tenantId } });
    await prisma.account.deleteMany({ where: { tenantId } });
    await prisma.userRole.deleteMany({ where: { tenantId } });
    await prisma.rolePermission.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.role.deleteMany({ where: { tenantId } });
    if (createdPermissionIds.length > 0) {
      await prisma.permission.deleteMany({ where: { id: { in: createdPermissionIds } } });
    }
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  function journalPayload(overrides: Record<string, unknown> = {}) {
    return {
      date: new Date().toISOString().slice(0, 10),
      description: 'Jurnal penjualan tunai',
      referenceType: 'TEST',
      referenceId: generateUuidV7(),
      lines: [
        { accountId: accountIds['1100'], debit: '100000', credit: '0' },
        { accountId: accountIds['4100'], debit: '0', credit: '100000' },
      ],
      ...overrides,
    };
  }

  it('creates a balanced journal and returns trial balance, income statement, and balance sheet', async () => {
    const created = await request(server)
      .post('/api/v1/accounting/journals')
      .set('Authorization', `Bearer ${token}`)
      .send(journalPayload())
      .expect(201);
    const journal = created.body as JournalBody;
    expect(journal).toMatchObject({ totalDebit: '100000.00', totalCredit: '100000.00' });
    expect(journal.entryNumber).toMatch(/^JE-\d{8}-00001$/);

    const trial = await request(server)
      .get('/api/v1/reports/trial-balance')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const trialBody = trial.body as TrialBalanceBody;
    expect(trialBody.totalDebit).toBe('100000.00');
    expect(trialBody.totalCredit).toBe('100000.00');

    const income = await request(server)
      .get('/api/v1/reports/income-statement')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(income.body as IncomeStatementBody).toMatchObject({
      revenue: '100000.00',
      netIncome: '100000.00',
    });

    const balance = await request(server)
      .get('/api/v1/reports/balance-sheet')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const balanceBody = balance.body as BalanceSheetBody;
    expect(balanceBody).toMatchObject({
      assets: '100000.00',
      equity: '100000.00',
      balanced: true,
    });
  });

  it('rejects an unbalanced manual journal', async () => {
    const response = await request(server)
      .post('/api/v1/accounting/journals')
      .set('Authorization', `Bearer ${token}`)
      .send(
        journalPayload({
          lines: [
            { accountId: accountIds['1100'], debit: '100000', credit: '0' },
            { accountId: accountIds['4100'], debit: '0', credit: '90000' },
          ],
        })
      )
      .expect(400);
    expect(response.body).toMatchObject({ code: 'ACCOUNTING_UNBALANCED_JOURNAL' });
  });

  it('creates an automatic sale journal with HPP exactly once', async () => {
    const referenceId = `pos-${suffix}`;
    await prisma.$transaction((tx) =>
      accounting.recordSale(tx, {
        tenantId,
        referenceType: 'POS_SALE',
        referenceId,
        date: new Date(),
        total: '50000',
        costOfGoods: '30000',
        payments: [{ method: 'CASH', amount: '50000' }],
        postedBy: userId,
      })
    );
    await prisma.$transaction((tx) =>
      accounting.recordSale(tx, {
        tenantId,
        referenceType: 'POS_SALE',
        referenceId,
        date: new Date(),
        total: '50000',
        costOfGoods: '30000',
        payments: [{ method: 'CASH', amount: '50000' }],
        postedBy: userId,
      })
    );

    expect(await prisma.journalEntry.count({ where: { tenantId } })).toBe(1);
    const trial = await request(server)
      .get('/api/v1/reports/trial-balance')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const rows = (trial.body as TrialBalanceBody).rows;
    expect(rows.find((row) => row.code === '1100')).toMatchObject({ debit: '50000.00' });
    expect(rows.find((row) => row.code === '4100')).toMatchObject({ credit: '50000.00' });
    expect(rows.find((row) => row.code === '5100')).toMatchObject({ debit: '30000.00' });
    expect(rows.find((row) => row.code === '1130')).toMatchObject({ credit: '30000.00' });
  });
});
