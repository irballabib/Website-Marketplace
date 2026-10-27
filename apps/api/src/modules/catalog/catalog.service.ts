import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Product, ProductMedia, Variant } from '@prisma/client';
import Decimal from 'decimal.js';

import { generateUuidV7 } from '../../common/id';
import { PrismaService } from '../../common/prisma/prisma.service';
import { FILE_STORAGE } from '../../common/storage/storage.module';
import type { FileStorage, StoredFile } from '../../common/storage/storage.module';
import { validateImageUpload } from './catalog-media';
import type { UploadedImage, UploadMediaDto } from './catalog-media';
import type {
  CreateProductDto,
  CreateVariantDto,
  ListProductsQueryDto,
  UpdateProductDto,
  UpdateVariantDto,
} from './catalog.dto';

const categorySelect = {
  id: true,
  name: true,
  slug: true,
} satisfies Prisma.CategorySelect;

const publicProductInclude = {
  category: { select: categorySelect },
  media: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }] },
  variants: {
    where: { deletedAt: null, isActive: true },
    orderBy: [{ size: 'asc' }, { color: 'asc' }],
  },
} satisfies Prisma.ProductInclude;

const adminProductInclude = {
  category: { select: categorySelect },
  media: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }] },
  variants: {
    where: { deletedAt: null },
    orderBy: [{ size: 'asc' }, { color: 'asc' }],
  },
} satisfies Prisma.ProductInclude;

type ProductRecord = Product & {
  category: { id: string; name: string; slug: string };
  media: ProductMedia[];
  variants: Variant[];
};

export interface CategoryView {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  sortOrder: number;
}

export interface ProductMediaView {
  id: string;
  url: string;
  alt: string | null;
  sortOrder: number;
  isPrimary: boolean;
}

export interface VariantView {
  id: string;
  productId: string;
  sku: string;
  barcode: string | null;
  color: string;
  size: string;
  price: string;
  costPrice: string | null;
  weight: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductView {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  skuPrefix: string;
  isActive: boolean;
  category: { id: string; name: string; slug: string };
  media: ProductMediaView[];
  variants: VariantView[];
  createdAt: string;
  updatedAt: string;
}

export interface PublicVariantView extends VariantView {
  product: {
    id: string;
    name: string;
    slug: string;
    category: { id: string; name: string; slug: string };
  };
}

export interface VariantStockView extends VariantView {
  stockAvailable: string;
}

export interface PublicProductDetailView extends Omit<ProductView, 'variants'> {
  variants: VariantStockView[];
}

export interface LocationView {
  id: string;
  code: string;
  name: string;
  type: string;
  address: string | null;
}

export interface PaginatedProducts {
  data: ProductView[];
  nextCursor: string | null;
}

@Injectable()
export class CatalogService {
  private readonly logger = new Logger(CatalogService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage
  ) {}

  /**
   * Single-seller default: public reads resolve the first active tenant.
   * `X-Tenant-Code` lets tests and future multi-tenant clients pick a tenant
   * explicitly without changing every catalog URL.
   */
  async resolveTenantId(tenantCode?: string): Promise<string> {
    const code = tenantCode?.trim();
    const tenant = await this.prisma.tenant.findFirst({
      where: {
        isActive: true,
        deletedAt: null,
        ...(code ? { code } : {}),
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });

    if (!tenant) {
      throw new NotFoundException({
        code: 'CATALOG_TENANT_NOT_FOUND',
        message: 'Tenant katalog tidak ditemukan',
      });
    }

    return tenant.id;
  }

  async listCategories(tenantCode?: string): Promise<{ data: CategoryView[] }> {
    const tenantId = await this.resolveTenantId(tenantCode);
    const categories = await this.prisma.category.findMany({
      where: { tenantId, isActive: true, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, slug: true, imageUrl: true, sortOrder: true },
    });

    return { data: categories };
  }

  async listPublicProducts(
    tenantCode: string | undefined,
    query: ListProductsQueryDto
  ): Promise<PaginatedProducts> {
    const tenantId = await this.resolveTenantId(tenantCode);
    return this.listProducts(tenantId, query, true);
  }

  async listAdminProducts(
    tenantId: string,
    query: ListProductsQueryDto
  ): Promise<PaginatedProducts> {
    return this.listProducts(tenantId, query, false);
  }

  async getPublicProduct(
    slug: string,
    tenantCode?: string,
    locationCode?: string
  ): Promise<ProductView | PublicProductDetailView> {
    const tenantId = await this.resolveTenantId(tenantCode);
    const product = await this.prisma.product.findFirst({
      where: { tenantId, slug: slug.trim().toLowerCase(), deletedAt: null, isActive: true },
      include: publicProductInclude,
    });

    if (!product) {
      throw this.productNotFound();
    }

    const view = this.toProductView(product);

    if (!locationCode?.trim()) {
      return view;
    }

    const location = await this.prisma.location.findFirst({
      where: {
        tenantId,
        code: locationCode.trim().toUpperCase(),
        isActive: true,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!location) {
      throw new NotFoundException({
        code: 'CATALOG_LOCATION_NOT_FOUND',
        message: 'Lokasi katalog tidak ditemukan',
      });
    }

    const balances = await this.prisma.stockBalance.findMany({
      where: {
        tenantId,
        locationId: location.id,
        variantId: { in: product.variants.map((variant) => variant.id) },
      },
      select: { variantId: true, qtyOnHand: true, qtyReserved: true },
    });
    const stockByVariant = new Map(
      balances.map((balance) => [
        balance.variantId,
        new Decimal(balance.qtyOnHand.toString())
          .minus(new Decimal(balance.qtyReserved.toString()))
          .toString(),
      ])
    );

    return {
      ...view,
      variants: view.variants.map((variant) => ({
        ...variant,
        stockAvailable: stockByVariant.get(variant.id) ?? '0',
      })),
    };
  }

  async getPublicLocation(code: string, tenantCode?: string): Promise<LocationView> {
    const tenantId = await this.resolveTenantId(tenantCode);
    const location = await this.prisma.location.findFirst({
      where: {
        tenantId,
        code: code.trim().toUpperCase(),
        isActive: true,
        deletedAt: null,
      },
      select: { id: true, code: true, name: true, type: true, address: true },
    });

    if (!location) {
      throw new NotFoundException({
        code: 'CATALOG_LOCATION_NOT_FOUND',
        message: 'Lokasi katalog tidak ditemukan',
      });
    }

    return location;
  }

  async getAdminProduct(tenantId: string, id: string): Promise<ProductView> {
    const product = await this.prisma.product.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: adminProductInclude,
    });

    if (!product) {
      throw this.productNotFound();
    }

    return this.toProductView(product);
  }

  async getPublicVariant(sku: string, tenantCode?: string): Promise<PublicVariantView> {
    const tenantId = await this.resolveTenantId(tenantCode);
    const variant = await this.prisma.variant.findFirst({
      where: {
        tenantId,
        sku: sku.trim().toUpperCase(),
        deletedAt: null,
        isActive: true,
        product: { deletedAt: null, isActive: true },
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
            category: { select: categorySelect },
          },
        },
      },
    });

    if (!variant) {
      throw this.variantNotFound();
    }

    return {
      ...this.toVariantView(variant),
      product: variant.product,
    };
  }

  async addProductMedia(
    tenantId: string,
    productId: string,
    file: UploadedImage | undefined,
    dto: UploadMediaDto
  ): Promise<ProductMediaView> {
    await this.requireProduct(tenantId, productId);
    const image = validateImageUpload(file);

    let stored: StoredFile;
    try {
      stored = await this.storage.save({
        folder: 'catalog',
        tenantId,
        extension: image.extension,
        contentType: image.contentType,
        buffer: image.buffer,
      });
    } catch (error) {
      this.logger.error(
        `Failed to store catalog image: ${error instanceof Error ? error.message : 'unknown error'}`
      );
      throw new InternalServerErrorException({
        code: 'CATALOG_STORAGE_FAILED',
        message: 'Gagal menyimpan file gambar',
      });
    }

    try {
      const media = await this.prisma.$transaction(async (tx) => {
        const existingCount = await tx.productMedia.count({ where: { productId } });
        const isPrimary = dto.isPrimary ?? existingCount === 0;

        if (isPrimary) {
          await tx.productMedia.updateMany({
            where: { productId, isPrimary: true },
            data: { isPrimary: false },
          });
        }

        return tx.productMedia.create({
          data: {
            id: generateUuidV7(),
            productId,
            url: stored.url,
            alt: dto.alt?.trim() || null,
            sortOrder: dto.sortOrder ?? existingCount,
            isPrimary,
          },
        });
      });

      return this.toMediaView(media);
    } catch (error) {
      await this.safeDeleteStoredFile(stored.url);
      throw error;
    }
  }

  async deleteProductMedia(
    tenantId: string,
    productId: string,
    mediaId: string
  ): Promise<void> {
    const media = await this.prisma.productMedia.findFirst({
      where: {
        id: mediaId,
        productId,
        product: { tenantId, deletedAt: null },
      },
    });

    if (!media) {
      throw new NotFoundException({
        code: 'CATALOG_MEDIA_NOT_FOUND',
        message: 'Media produk tidak ditemukan',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.productMedia.delete({ where: { id: mediaId } });

      if (media.isPrimary) {
        const next = await tx.productMedia.findFirst({
          where: { productId },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        });

        if (next) {
          await tx.productMedia.update({
            where: { id: next.id },
            data: { isPrimary: true },
          });
        }
      }
    });

    await this.safeDeleteStoredFile(media.url);
  }

  async createProduct(tenantId: string, dto: CreateProductDto): Promise<ProductView> {
    await this.assertCategory(tenantId, dto.categoryId);
    await this.assertSlugAvailable(tenantId, dto.slug);

    try {
      const product = await this.prisma.product.create({
        data: {
          id: generateUuidV7(),
          tenantId,
          categoryId: dto.categoryId,
          name: dto.name,
          slug: dto.slug,
          description: dto.description ?? null,
          skuPrefix: dto.skuPrefix,
          isActive: dto.isActive ?? true,
        },
        include: adminProductInclude,
      });

      return this.toProductView(product);
    } catch (error) {
      this.rethrowUnique(error, 'CATALOG_SLUG_TAKEN', 'Slug produk sudah dipakai');
    }
  }

  async updateProduct(
    tenantId: string,
    id: string,
    dto: UpdateProductDto
  ): Promise<ProductView> {
    const current = await this.requireProduct(tenantId, id);

    if (dto.categoryId !== undefined && dto.categoryId !== current.categoryId) {
      await this.assertCategory(tenantId, dto.categoryId);
    }

    if (dto.slug !== undefined && dto.slug !== current.slug) {
      await this.assertSlugAvailable(tenantId, dto.slug, id);
    }

    const data: Prisma.ProductUncheckedUpdateInput = {};
    if (dto.categoryId !== undefined) data.categoryId = dto.categoryId;
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.slug !== undefined) data.slug = dto.slug;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.skuPrefix !== undefined) data.skuPrefix = dto.skuPrefix;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    try {
      const product = await this.prisma.product.update({
        where: { id },
        data,
        include: adminProductInclude,
      });

      return this.toProductView(product);
    } catch (error) {
      this.rethrowUnique(error, 'CATALOG_SLUG_TAKEN', 'Slug produk sudah dipakai');
    }
  }

  /** Soft-deletes the product and every non-deleted variant in one transaction. */
  async deleteProduct(tenantId: string, id: string): Promise<void> {
    await this.requireProduct(tenantId, id);
    const deletedAt = new Date();

    await this.prisma.$transaction([
      this.prisma.product.update({
        where: { id },
        data: { deletedAt, isActive: false },
      }),
      this.prisma.variant.updateMany({
        where: { tenantId, productId: id, deletedAt: null },
        data: { deletedAt, isActive: false },
      }),
    ]);
  }

  async createVariant(
    tenantId: string,
    productId: string,
    dto: CreateVariantDto
  ): Promise<VariantView> {
    await this.requireProduct(tenantId, productId);
    await this.assertSkuAvailable(dto.sku);
    if (dto.barcode) {
      await this.assertBarcodeAvailable(dto.barcode);
    }

    const price = this.parsePrice(dto.price);
    const costPrice = dto.costPrice ? this.parseCostPrice(dto.costPrice) : null;
    const weight = dto.weight ? this.parseWeight(dto.weight) : null;

    try {
      const variant = await this.prisma.variant.create({
        data: {
          id: generateUuidV7(),
          tenantId,
          productId,
          sku: dto.sku,
          barcode: dto.barcode ?? null,
          color: dto.color,
          size: dto.size,
          price: price.toFixed(2),
          costPrice: costPrice ? costPrice.toFixed(2) : null,
          weight: weight ? weight.toFixed(3) : null,
          isActive: dto.isActive ?? true,
        },
      });

      return this.toVariantView(variant);
    } catch (error) {
      this.rethrowUnique(error, 'CATALOG_DUPLICATE', 'SKU atau barcode sudah dipakai');
    }
  }

  async updateVariant(
    tenantId: string,
    id: string,
    dto: UpdateVariantDto
  ): Promise<VariantView> {
    const current = await this.requireVariant(tenantId, id);

    if (dto.sku !== undefined && dto.sku !== current.sku) {
      await this.assertSkuAvailable(dto.sku, id);
    }

    if (dto.barcode !== undefined && dto.barcode !== current.barcode && dto.barcode) {
      await this.assertBarcodeAvailable(dto.barcode, id);
    }

    const data: Prisma.VariantUncheckedUpdateInput = {};
    if (dto.sku !== undefined) data.sku = dto.sku;
    if (dto.barcode !== undefined) data.barcode = dto.barcode || null;
    if (dto.color !== undefined) data.color = dto.color;
    if (dto.size !== undefined) data.size = dto.size;
    if (dto.price !== undefined) data.price = this.parsePrice(dto.price).toFixed(2);
    if (dto.costPrice !== undefined) {
      data.costPrice = dto.costPrice === null ? null : this.parseCostPrice(dto.costPrice).toFixed(2);
    }
    if (dto.weight !== undefined) {
      data.weight = dto.weight === null ? null : this.parseWeight(dto.weight).toFixed(3);
    }
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    try {
      const variant = await this.prisma.variant.update({ where: { id }, data });
      return this.toVariantView(variant);
    } catch (error) {
      this.rethrowUnique(error, 'CATALOG_DUPLICATE', 'SKU atau barcode sudah dipakai');
    }
  }

  async deleteVariant(tenantId: string, id: string): Promise<void> {
    const result = await this.prisma.variant.updateMany({
      where: {
        id,
        tenantId,
        deletedAt: null,
        product: { deletedAt: null },
      },
      data: { deletedAt: new Date(), isActive: false },
    });

    if (result.count === 0) {
      throw this.variantNotFound();
    }
  }

  private async listProducts(
    tenantId: string,
    query: ListProductsQueryDto,
    publicOnly: boolean
  ): Promise<PaginatedProducts> {
    const limit = query.limit ?? 20;
    const q = query.q?.trim();
    const category = query.category?.trim().toLowerCase();

    const where: Prisma.ProductWhereInput = {
      tenantId,
      deletedAt: null,
      ...(publicOnly ? { isActive: true } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              {
                variants: {
                  some: {
                    isActive: true,
                    deletedAt: null,
                    OR: [
                      { sku: { contains: q, mode: 'insensitive' } },
                      { barcode: { contains: q, mode: 'insensitive' } },
                      { color: { contains: q, mode: 'insensitive' } },
                      { size: { contains: q, mode: 'insensitive' } },
                    ],
                  },
                },
              },
            ],
          }
        : {}),
      ...(category
        ? {
            category: {
              slug: category,
              deletedAt: null,
              ...(publicOnly ? { isActive: true } : {}),
            },
          }
        : {}),
    };

    const rows = await this.prisma.product.findMany({
      where,
      include: publicOnly ? publicProductInclude : adminProductInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    return {
      data: page.map((product) => this.toProductView(product)),
      nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
    };
  }

  private async requireProduct(tenantId: string, id: string): Promise<Product> {
    const product = await this.prisma.product.findFirst({
      where: { id, tenantId, deletedAt: null },
    });

    if (!product) {
      throw this.productNotFound();
    }

    return product;
  }

  private async requireVariant(tenantId: string, id: string): Promise<Variant> {
    const variant = await this.prisma.variant.findFirst({
      where: {
        id,
        tenantId,
        deletedAt: null,
        product: { deletedAt: null },
      },
    });

    if (!variant) {
      throw this.variantNotFound();
    }

    return variant;
  }

  private async assertCategory(tenantId: string, categoryId: string): Promise<void> {
    const category = await this.prisma.category.findFirst({
      where: { id: categoryId, tenantId, isActive: true, deletedAt: null },
      select: { id: true },
    });

    if (!category) {
      throw new BadRequestException({
        code: 'CATALOG_CATEGORY_INVALID',
        message: 'Kategori tidak ditemukan atau tidak aktif',
      });
    }
  }

  private async assertSlugAvailable(
    tenantId: string,
    slug: string,
    excludeId?: string
  ): Promise<void> {
    const existing = await this.prisma.product.findFirst({
      where: {
        tenantId,
        slug,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException({
        code: 'CATALOG_SLUG_TAKEN',
        message: 'Slug produk sudah dipakai',
      });
    }
  }

  private async assertSkuAvailable(sku: string, excludeId?: string): Promise<void> {
    const existing = await this.prisma.variant.findFirst({
      where: {
        sku,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException({
        code: 'CATALOG_SKU_TAKEN',
        message: 'SKU sudah dipakai',
      });
    }
  }

  private async assertBarcodeAvailable(barcode: string, excludeId?: string): Promise<void> {
    const existing = await this.prisma.variant.findFirst({
      where: {
        barcode,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException({
        code: 'CATALOG_BARCODE_TAKEN',
        message: 'Barcode sudah dipakai',
      });
    }
  }

  private parsePrice(value: string): Decimal {
    const price = new Decimal(value);

    if (!price.isFinite() || price.isZero() || !price.isPositive()) {
      throw new BadRequestException({
        code: 'CATALOG_INVALID_PRICE',
        message: 'Harga harus lebih besar dari nol',
      });
    }

    return price;
  }

  private parseCostPrice(value: string): Decimal {
    const costPrice = new Decimal(value);

    if (!costPrice.isFinite() || costPrice.isNegative()) {
      throw new BadRequestException({
        code: 'CATALOG_INVALID_COST_PRICE',
        message: 'Harga pokok tidak boleh negatif',
      });
    }

    return costPrice;
  }

  private parseWeight(value: string): Decimal {
    const weight = new Decimal(value);

    if (!weight.isFinite() || weight.isZero() || !weight.isPositive()) {
      throw new BadRequestException({
        code: 'CATALOG_INVALID_WEIGHT',
        message: 'Berat harus lebih besar dari nol',
      });
    }

    return weight;
  }

  private rethrowUnique(error: unknown, code: string, message: string): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException({ code, message });
    }

    throw error;
  }

  private productNotFound(): NotFoundException {
    return new NotFoundException({
      code: 'CATALOG_PRODUCT_NOT_FOUND',
      message: 'Produk tidak ditemukan',
    });
  }

  private variantNotFound(): NotFoundException {
    return new NotFoundException({
      code: 'CATALOG_VARIANT_NOT_FOUND',
      message: 'Varian produk tidak ditemukan',
    });
  }

  private async safeDeleteStoredFile(fileUrl: string): Promise<void> {
    try {
      await this.storage.delete(fileUrl);
    } catch (error) {
      this.logger.warn(
        `Failed to delete stored file ${fileUrl}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`
      );
    }
  }

  private toMediaView(media: ProductMedia): ProductMediaView {
    return {
      id: media.id,
      url: media.url,
      alt: media.alt,
      sortOrder: media.sortOrder,
      isPrimary: media.isPrimary,
    };
  }

  private toVariantView(variant: Variant): VariantView {
    return {
      id: variant.id,
      productId: variant.productId,
      sku: variant.sku,
      barcode: variant.barcode,
      color: variant.color,
      size: variant.size,
      price: variant.price.toFixed(2),
      costPrice: variant.costPrice ? variant.costPrice.toFixed(2) : null,
      weight: variant.weight ? variant.weight.toFixed(3) : null,
      isActive: variant.isActive,
      createdAt: variant.createdAt.toISOString(),
      updatedAt: variant.updatedAt.toISOString(),
    };
  }

  private toProductView(product: ProductRecord): ProductView {
    return {
      id: product.id,
      name: product.name,
      slug: product.slug,
      description: product.description,
      skuPrefix: product.skuPrefix,
      isActive: product.isActive,
      category: product.category,
      media: product.media.map((media) => this.toMediaView(media)),
      variants: product.variants.map((variant) => this.toVariantView(variant)),
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
    };
  }
}
