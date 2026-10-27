import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { generateUuidV7 } from '../id';

/**
 * Single Prisma client for the whole API process.
 *
 * IDs are generated client-side as UUID v7 (time-ordered) instead of relying
 * on the database `uuid()` default (v4), so primary keys keep insert order and
 * stay index-friendly.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });

    this.$use(async (params: Prisma.MiddlewareParams, next) => {
      if (params.action === 'create' || params.action === 'createMany') {
        const args = params.args as { data?: Record<string, unknown> | Record<string, unknown>[] } | undefined;
        const data = args?.data;
        if (Array.isArray(data)) {
          for (const row of data) {
            if (row.id === undefined) {
              row.id = generateUuidV7();
            }
          }
        } else if (data && data.id === undefined) {
          data.id = generateUuidV7();
        }
      }
      const result: unknown = await next(params);
      return result;
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
