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
   * Backs the duplicate-association check (Directive v1 §7:
   * "Supplier-product association should not be duplicated within
   * an organization") — mirrors the partial unique index on
   * (organizationId, supplierId, productId), giving the service a
   * friendly ConflictException instead of a raw DB constraint
   * violation.
   */
  async existsBySupplierAndProduct(
    organizationId: string,
    supplierId: string,
    productId: string,
  ): Promise<boolean> {
    const qb = this.repository
      .createQueryBuilder('sp')
      .where('sp.organization_id = :organizationId', { organizationId })
      .andWhere('sp.supplier_id = :supplierId', { supplierId })
      .andWhere('sp.product_id = :productId', { productId })
      .andWhere('sp.deleted_at IS NULL');

    return (await qb.getCount()) > 0;
  }

  async softDelete(id: string): Promise<void> {
    await this.repository.softDelete({ id });
  }
}
