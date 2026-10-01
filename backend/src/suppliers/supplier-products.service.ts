import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { SuppliersService } from './suppliers.service';
import { ProductsService } from '../products/products.service';
import { SupplierProductsRepository } from './supplier-products.repository';
import { CreateSupplierProductDto } from './dto/create-supplier-product.dto';
import { UpdateSupplierProductDto } from './dto/update-supplier-product.dto';
import { SupplierProduct } from './entities/supplier-product.entity';

const POSTGRES_UNIQUE_VIOLATION = '23505';

@Injectable()
export class SupplierProductsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly suppliersService: SuppliersService,
    private readonly productsService: ProductsService,
    private readonly supplierProductsRepository: SupplierProductsRepository,
  ) {}

  private async getOwnedAssociationOrThrow(
    organizationId: string,
    supplierId: string,
    associationId: string,
  ): Promise<SupplierProduct> {
    await this.suppliersService.getOwnedSupplierOrThrow(
      organizationId,
      supplierId,
    );

    const association =
      await this.supplierProductsRepository.findById(associationId);
    if (
      !association ||
      association.organizationId !== organizationId ||
      association.supplierId !== supplierId
    ) {
      throw new NotFoundException('Supplier-product association not found');
    }
    return association;
  }

  async addProductToSupplier(
    organizationId: string,
    supplierId: string,
    dto: CreateSupplierProductDto,
  ): Promise<SupplierProduct> {
    await this.suppliersService.getOwnedSupplierOrThrow(
      organizationId,
      supplierId,
    );
    await this.productsService.getOwnedProductOrThrow(
      organizationId,
      dto.productId,
    );

    const existing =
      await this.supplierProductsRepository.findBySupplierAndProduct(
        organizationId,
        supplierId,
        dto.productId,
      );
    if (existing) {
      return existing;
    }

    try {
      return await this.dataSource.transaction(async (manager) => {
        const association = manager.create(SupplierProduct, {
          organizationId,
          supplierId,
          productId: dto.productId,
          supplierSku: dto.supplierSku ?? null,
          unitCost: dto.unitCost !== undefined ? dto.unitCost.toFixed(2) : null,
          leadTimeDays: dto.leadTimeDays ?? null,
          minimumOrderQuantity: dto.minimumOrderQuantity ?? null,
        });
        return manager.save(SupplierProduct, association);
      });
    } catch (err) {
      if (
        err instanceof QueryFailedError &&
        (err as unknown as { code?: string }).code === POSTGRES_UNIQUE_VIOLATION
      ) {
        const raceWinner =
          await this.supplierProductsRepository.findBySupplierAndProduct(
            organizationId,
            supplierId,
            dto.productId,
          );
        if (raceWinner) {
          return raceWinner;
        }
      }
      throw err;
    }
  }

  async listSupplierProducts(
    organizationId: string,
    supplierId: string,
  ): Promise<SupplierProduct[]> {
    await this.suppliersService.getOwnedSupplierOrThrow(
      organizationId,
      supplierId,
    );
    return this.supplierProductsRepository.findBySupplier(supplierId);
  }

  async getSupplierProduct(
    organizationId: string,
    supplierId: string,
    associationId: string,
  ): Promise<SupplierProduct> {
    return this.getOwnedAssociationOrThrow(
      organizationId,
      supplierId,
      associationId,
    );
  }

  async updateSupplierProduct(
    organizationId: string,
    supplierId: string,
    associationId: string,
    dto: UpdateSupplierProductDto,
  ): Promise<SupplierProduct> {
    const existing = await this.getOwnedAssociationOrThrow(
      organizationId,
      supplierId,
      associationId,
    );

    const updated = this.supplierProductsRepository.create({
      ...existing,
      ...(dto.supplierSku !== undefined && { supplierSku: dto.supplierSku }),
      ...(dto.unitCost !== undefined && { unitCost: dto.unitCost.toFixed(2) }),
      ...(dto.leadTimeDays !== undefined && { leadTimeDays: dto.leadTimeDays }),
      ...(dto.minimumOrderQuantity !== undefined && {
        minimumOrderQuantity: dto.minimumOrderQuantity,
      }),
    });

    return this.supplierProductsRepository.save(updated);
  }

  async removeProductFromSupplier(
    organizationId: string,
    supplierId: string,
    associationId: string,
  ): Promise<void> {
    await this.getOwnedAssociationOrThrow(
      organizationId,
      supplierId,
      associationId,
    );
    await this.supplierProductsRepository.softDelete(associationId);
  }
}
