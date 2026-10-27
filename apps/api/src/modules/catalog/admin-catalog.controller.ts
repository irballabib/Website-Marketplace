import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser, RequirePermissions, type AuthUser } from '../identity/auth.access';
import { MAX_IMAGE_BYTES, UploadMediaDto } from './catalog-media';
import type { UploadedImage } from './catalog-media';
import {
  CreateProductDto,
  CreateVariantDto,
  ListProductsQueryDto,
  UpdateProductDto,
  UpdateVariantDto,
} from './catalog.dto';
import { CatalogService } from './catalog.service';

@ApiTags('catalog-admin')
@ApiBearerAuth()
@RequirePermissions('catalog.product.manage')
@Controller('admin/catalog')
export class AdminCatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('products')
  @ApiOperation({ summary: 'List products including inactive ones' })
  listProducts(@CurrentUser() user: AuthUser, @Query() query: ListProductsQueryDto) {
    return this.catalog.listAdminProducts(user.tenantId, query);
  }

  @Get('products/:id')
  @ApiOperation({ summary: 'Get a product including inactive variants' })
  getProduct(@CurrentUser() user: AuthUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.catalog.getAdminProduct(user.tenantId, id);
  }

  @Post('products')
  @ApiOperation({ summary: 'Create a product' })
  createProduct(@CurrentUser() user: AuthUser, @Body() dto: CreateProductDto) {
    return this.catalog.createProduct(user.tenantId, dto);
  }

  @Patch('products/:id')
  @ApiOperation({ summary: 'Update a product' })
  updateProduct(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateProductDto
  ) {
    return this.catalog.updateProduct(user.tenantId, id, dto);
  }

  @Delete('products/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Soft-delete a product and its variants' })
  deleteProduct(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string
  ): Promise<void> {
    return this.catalog.deleteProduct(user.tenantId, id);
  }

  @Post('products/:id/media')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_BYTES, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        alt: { type: 'string', maxLength: 200 },
        isPrimary: { type: 'boolean' },
        sortOrder: { type: 'integer', minimum: 0, maximum: 1000 },
      },
    },
  })
  @ApiOperation({ summary: 'Upload a product image (JPEG, PNG, WebP, AVIF; max 5 MB)' })
  uploadProductMedia(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @UploadedFile() file: UploadedImage | undefined,
    @Body() dto: UploadMediaDto
  ) {
    return this.catalog.addProductMedia(user.tenantId, id, file, dto);
  }

  @Delete('products/:productId/media/:mediaId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a product image and its stored file' })
  deleteProductMedia(
    @CurrentUser() user: AuthUser,
    @Param('productId', new ParseUUIDPipe()) productId: string,
    @Param('mediaId', new ParseUUIDPipe()) mediaId: string
  ): Promise<void> {
    return this.catalog.deleteProductMedia(user.tenantId, productId, mediaId);
  }

  @Post('products/:id/variants')
  @ApiOperation({ summary: 'Create a SKU/barcode variant under a product' })
  createVariant(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateVariantDto
  ) {
    return this.catalog.createVariant(user.tenantId, id, dto);
  }

  @Patch('variants/:id')
  @ApiOperation({ summary: 'Update a variant' })
  updateVariant(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateVariantDto
  ) {
    return this.catalog.updateVariant(user.tenantId, id, dto);
  }

  @Delete('variants/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Soft-delete a variant' })
  deleteVariant(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string
  ): Promise<void> {
    return this.catalog.deleteVariant(user.tenantId, id);
  }
}
