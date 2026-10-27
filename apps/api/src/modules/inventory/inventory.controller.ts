import {
  Body,
  ConflictException,
  Controller,
  Get,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  CurrentUser,
  RequirePermissions,
  type AuthUser,
} from '../identity/auth.access';
import {
  ListLedgerQueryDto,
  ListStockQueryDto,
  StockAdjustmentDto,
  StockTransferDto,
} from './inventory.dto';
import { StockError, StockService } from './stock.service';

@ApiTags('inventory-admin')
@ApiBearerAuth()
@RequirePermissions('inventory.adjust')
@Controller('admin/inventory')
export class InventoryController {
  constructor(private readonly stock: StockService) {}

  @Get('stock')
  @ApiOperation({ summary: 'List stock balances by location/search' })
  listStock(@CurrentUser() user: AuthUser, @Query() query: ListStockQueryDto) {
    return this.stock.listStock(user.tenantId, query);
  }

  @Get('ledger')
  @ApiOperation({ summary: 'List recent stock ledger movements' })
  listLedger(@CurrentUser() user: AuthUser, @Query() query: ListLedgerQueryDto) {
    return this.stock.listLedger(user.tenantId, query);
  }

  @Get('locations')
  @ApiOperation({ summary: 'List active inventory locations' })
  listLocations(@CurrentUser() user: AuthUser) {
    return this.stock.listLocations(user.tenantId);
  }

  @Post('adjustments')
  @ApiOperation({ summary: 'Adjust stock (signed qty)' })
  @ApiBody({ type: StockAdjustmentDto })
  async adjust(
    @CurrentUser() user: AuthUser,
    @Body() dto: StockAdjustmentDto
  ) {
    try {
      return await this.stock.adjust({
        tenantId: user.tenantId,
        variantId: dto.variantId,
        locationId: dto.locationId,
        qty: dto.qty,
        createdBy: user.id,
        note: dto.note?.trim(),
      });
    } catch (error) {
      throw this.stockException(error);
    }
  }

  @Post('transfers')
  @ApiOperation({ summary: 'Transfer stock between locations atomically' })
  @ApiBody({ type: StockTransferDto })
  async transfer(
    @CurrentUser() user: AuthUser,
    @Body() dto: StockTransferDto
  ) {
    try {
      return await this.stock.transfer({
        tenantId: user.tenantId,
        variantId: dto.variantId,
        fromLocationId: dto.fromLocationId,
        toLocationId: dto.toLocationId,
        qty: dto.qty,
        createdBy: user.id,
        note: dto.note?.trim(),
      });
    } catch (error) {
      throw this.stockException(error);
    }
  }

  private stockException(error: unknown): ConflictException {
    if (error instanceof StockError) {
      return new ConflictException({
        code: 'INVENTORY_STOCK_ERROR',
        message: error.message,
        details: { stockCode: error.code },
      });
    }

    return new ConflictException({
      code: 'INVENTORY_OPERATION_FAILED',
      message: error instanceof Error ? error.message : 'Operasi stok gagal',
    });
  }
}
