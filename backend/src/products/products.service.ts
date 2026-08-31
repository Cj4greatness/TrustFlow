import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ProductsRepository, PaginatedProducts } from './products.repository';
import { InventoryRepository } from './inventory.repository';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import { Product, ProductStatus } from './entities/product.entity';

@Injectable()
export class ProductsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly productsRepository: ProductsRepository,
    private readonly inventoryRepository: InventoryRepository,
  ) {}

  /**
   * Tenant-isolation check, same pattern as
   * CustomersService.getOwnedCustomerOrThrow. Public (not private) —
   * InventoryService calls this via an injected ProductsService to
   * verify product ownership before trusting the child Inventory row.
   */
  async getOwnedProductOrThrow(
    organizationId: string,
    productId: string,
  ): Promise<Product> {
    const product = await this.productsRepository.findById(productId);
    if (!product || product.organizationId !== organizationId) {
      throw new NotFoundException('Product not found in this organization');
    }
    return product;
  }

  /**
   * Creates a Product and its initial (zero-quantity) Inventory row
   * atomically — per CTO Directive v1, every product is provisioned
   * with an Inventory record at birth. A Product without Inventory,
   * or Inventory orphaned by a failed Product insert, is an invalid
   * state this transaction boundary exists to prevent.
   */
  async createProduct(
    organizationId: string,
    dto: CreateProductDto,
    createdByUserId: string,
  ): Promise<Product> {
    const skuTaken = await this.productsRepository.existsByOrganizationAndSku(
      organizationId,
      dto.sku,
    );
    if (skuTaken) {
      throw new ConflictException(
        'A product with this SKU already exists in this organization',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const productRepo = this.productsRepository.withTransaction(manager);
      const inventoryRepo = this.inventoryRepository.withTransaction(manager);

      const product = productRepo.create({
        organizationId,
        name: dto.name,
        description: dto.description ?? null,
        sku: dto.sku,
        category: dto.category ?? null,
        unit: dto.unit ?? null,
        sellingPrice: dto.sellingPrice.toFixed(2),
        costPrice:
          dto.costPrice !== undefined ? dto.costPrice.toFixed(2) : null,
        status: dto.status ?? ProductStatus.ACTIVE,
        createdBy: createdByUserId,
      });
      const savedProduct = await productRepo.save(product);

      const inventory = inventoryRepo.create({
        organizationId,
        productId: savedProduct.id,
        quantity: 0,
        lowStockThreshold: null,
      });
      await inventoryRepo.save(inventory);

      return savedProduct;
    });
  }

  async listProducts(
    organizationId: string,
    query: ProductQueryDto,
  ): Promise<PaginatedProducts> {
    return this.productsRepository.findByOrganization(organizationId, query);
  }

  async getProduct(
    organizationId: string,
    productId: string,
  ): Promise<Product> {
    return this.getOwnedProductOrThrow(organizationId, productId);
  }

  async updateProduct(
    organizationId: string,
    productId: string,
    dto: UpdateProductDto,
  ): Promise<Product> {
    const existing = await this.getOwnedProductOrThrow(
      organizationId,
      productId,
    );

    if (dto.sku && dto.sku !== existing.sku) {
      const skuTaken = await this.productsRepository.existsByOrganizationAndSku(
        organizationId,
        dto.sku,
        productId,
      );
      if (skuTaken) {
        throw new ConflictException(
          'A product with this SKU already exists in this organization',
        );
      }
    }

    const updated = this.productsRepository.create({
      ...existing,
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.sku !== undefined && { sku: dto.sku }),
      ...(dto.category !== undefined && { category: dto.category }),
      ...(dto.unit !== undefined && { unit: dto.unit }),
      ...(dto.sellingPrice !== undefined && {
        sellingPrice: dto.sellingPrice.toFixed(2),
      }),
      ...(dto.costPrice !== undefined && {
        costPrice: dto.costPrice.toFixed(2),
      }),
      ...(dto.status !== undefined && { status: dto.status }),
    });

    return this.productsRepository.save(updated);
  }

  async deleteProduct(
    organizationId: string,
    productId: string,
  ): Promise<void> {
    await this.getOwnedProductOrThrow(organizationId, productId);
    await this.productsRepository.softDelete(productId);
  }
}
