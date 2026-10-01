import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SupplierProduct } from './entities/supplier-product.entity';

/**
 * Encapsulates all direct database access for SupplierProduct.
 */
@Injectable()
export class SupplierProductsRepository {
  constructor(
    @InjectRepository(SupplierProduct)
    private readonly repository: Repository<SupplierProduct>,
  ) {}

  create(data: Partial<SupplierProduct>): SupplierProduct {
    return this.repository.create(data);
  }

  save(supplierProduct: SupplierProduct): Promise<SupplierProduct> {
    return this.repository.save(supplierProduct);
  }

  findById(id: string): Promise<SupplierProduct | null> {
    return this.repository.findOne({ where: { id } });
  }

  findBySupplier(supplierId: string): Promise<SupplierProduct[]> {
    return this.repository.find({
      where: { supplierId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Backs addProductToSupplier()'s unique-violation race recovery —
   * fetches the association a concurrent winner just inserted, so
   * the loser can return it instead of surfacing the raw DB error.
   * Also backs the up-front idempotent-return check in
   * addProductToSupplier() (returns the existing association if the
   * pair is already associated, rather than throwing).
   */
  async findBySupplierAndProduct(
    organizationId: string,
    supplierId: string,
    productId: string,
  ): Promise<SupplierProduct | null> {
    return this.repository.findOne({
      where: { organizationId, supplierId, productId },
    });
  }

  async softDelete(id: string): Promise<void> {
    await this.repository.softDelete({ id });
  }
}
