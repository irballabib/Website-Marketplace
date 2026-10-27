import { Controller, Get, Headers, Param, Query } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../identity/auth.access';
import { ListProductsQueryDto } from './catalog.dto';
import { CatalogService } from './catalog.service';

@ApiTags('catalog')
@ApiHeader({
  name: 'X-Tenant-Code',
  required: false,
  description: 'Tenant code for public catalog reads; defaults to the first active tenant',
})
@Public()
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('categories')
  @ApiOperation({ summary: 'List active catalog categories' })
  listCategories(@Headers('x-tenant-code') tenantCode?: string) {
    return this.catalog.listCategories(tenantCode);
  }

  @Get('products')
  @ApiOperation({ summary: 'List active products with cursor pagination' })
  listProducts(
    @Query() query: ListProductsQueryDto,
    @Headers('x-tenant-code') tenantCode?: string
  ) {
    return this.catalog.listPublicProducts(tenantCode, query);
  }

  @Get('locations/:code')
  @ApiOperation({ summary: 'Get an active stock location by code' })
  getLocation(@Param('code') code: string, @Headers('x-tenant-code') tenantCode?: string) {
    return this.catalog.getPublicLocation(code, tenantCode);
  }

  @Get('products/:slug')
  @ApiOperation({ summary: 'Get an active product by slug' })
  getProduct(
    @Param('slug') slug: string,
    @Headers('x-tenant-code') tenantCode?: string,
    @Query('locationCode') locationCode?: string
  ) {
    return this.catalog.getPublicProduct(slug, tenantCode, locationCode);
  }

  @Get('variants/:sku')
  @ApiOperation({ summary: 'Get an active variant and its product by SKU' })
  getVariant(@Param('sku') sku: string, @Headers('x-tenant-code') tenantCode?: string) {
    return this.catalog.getPublicVariant(sku, tenantCode);
  }
}
