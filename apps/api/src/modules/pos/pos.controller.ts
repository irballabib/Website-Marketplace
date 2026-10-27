import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  CurrentUser,
  RequirePermissions,
  type AuthUser,
} from '../identity/auth.access';
import {
  CloseShiftDto,
  CreatePosSaleDto,
  ListPosSalesQueryDto,
  OpenShiftDto,
  VoidSaleDto,
  type PosSaleView,
  type PosShiftView,
} from './pos.dto';
import { PosService } from './pos.service';

@ApiTags('pos')
@ApiBearerAuth()
@Controller('pos')
export class PosController {
  constructor(private readonly pos: PosService) {}

  @Post('shifts/open')
  @RequirePermissions('pos.shift.manage')
  @ApiOperation({ summary: 'Open a cashier shift' })
  @ApiBody({ type: OpenShiftDto })
  openShift(
    @CurrentUser() user: AuthUser,
    @Body() dto: OpenShiftDto
  ): Promise<PosShiftView> {
    return this.pos.openShift(user.tenantId, user.id, dto);
  }

  @Post('shifts/:id/close')
  @RequirePermissions('pos.shift.manage')
  @ApiOperation({ summary: 'Close a cashier shift and calculate cash difference' })
  @ApiBody({ type: CloseShiftDto })
  closeShift(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CloseShiftDto
  ): Promise<PosShiftView> {
    return this.pos.closeShift(user.tenantId, user.id, id, dto);
  }

  @Get('shifts/current')
  @RequirePermissions('pos.shift.manage')
  @ApiOperation({ summary: 'Get the current open shift for the cashier' })
  currentShift(
    @CurrentUser() user: AuthUser,
    @Query('locationId') locationId?: string
  ): Promise<PosShiftView | null> {
    return this.pos.getCurrentShift(user.tenantId, user.id, locationId);
  }

  @Get('locations')
  @RequirePermissions('pos.sale.create')
  @ApiOperation({ summary: 'List active POS locations' })
  listLocations(@CurrentUser() user: AuthUser) {
    return this.pos.listLocations(user.tenantId);
  }

  @Get('catalog')
  @RequirePermissions('pos.sale.create')
  @ApiOperation({ summary: 'List variants and stock for a POS location' })
  catalog(
    @CurrentUser() user: AuthUser,
    @Query('locationId') locationId?: string
  ) {
    if (!locationId) {
      throw new BadRequestException({
        code: 'POS_LOCATION_REQUIRED',
        message: 'locationId wajib diisi',
      });
    }

    return this.pos.getCatalog(user.tenantId, locationId);
  }

  @Post('sales')
  @RequirePermissions('pos.sale.create')
  @ApiOperation({ summary: 'Create a POS sale with split payments' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ type: CreatePosSaleDto })
  createSale(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreatePosSaleDto,
    @Headers('idempotency-key') idempotencyKey?: string
  ): Promise<PosSaleView> {
    return this.pos.createSale(
      user.tenantId,
      user.id,
      user.permissions,
      dto,
      idempotencyKey
    );
  }

  @Get('sales')
  @RequirePermissions('order.view')
  @ApiOperation({ summary: 'List recent POS sales' })
  listSales(
    @CurrentUser() user: AuthUser,
    @Query() query: ListPosSalesQueryDto
  ): Promise<PosSaleView[]> {
    return this.pos.listSales(user.tenantId, query);
  }

  @Get('sales/:id')
  @RequirePermissions('order.view')
  @ApiOperation({ summary: 'Get a POS sale by id' })
  getSale(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<PosSaleView> {
    return this.pos.getSale(user.tenantId, id);
  }

  @Post('sales/:id/void')
  @RequirePermissions('pos.sale.void')
  @ApiOperation({ summary: 'Void a POS sale and return its stock' })
  @ApiBody({ type: VoidSaleDto })
  voidSale(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: VoidSaleDto
  ): Promise<PosSaleView> {
    return this.pos.voidSale(user.tenantId, user.id, id, dto);
  }
}
