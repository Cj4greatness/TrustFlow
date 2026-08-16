import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SuppliersService } from './suppliers.service';
import { ProductsService } from '../products/products.service';
import { SupplierProductsRepository } from './supplier-products.repository';
import { CreateSupplierProductDto } from './dto/create-supplier-product.dto';
import { UpdateSupplierProductDto } from './dto/update-supplier-product.dto';
import { SupplierProduct } from './entities/supplier-product.entity';

@Injectable()
export class SupplierProductsService {
  constructor(
    private readonly suppliersService: SuppliersService,
    private readonly productsService: ProductsService,
    private readonly supplierProductsRepository: SupplierProductsRepository,
  ) {}

  /**
   * Confirms the association belongs to the organization AND the
   * supplied supplierId, mirroring
   * CustomersService.getOwnedAddressOrThrow's nested-ownership-chain
   * pattern.
   */
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

  /**
   * Associates a product with a supplier. Enforces Directive v1 §7:
   * "A Supplier cannot be associated with a Product belonging to
   * another organization" (via ProductsService.getOwnedProductOrThrow)
   * and "Supplier-product association should not be duplicated
   * within an organization" (via the pre-insert existence check,
   * backed by the partial unique index as a defense-in-depth layer).
   */
  async addProductToSupplier(
    organizationId: string,
    supplierId: string,
    dto: CreateSupplierProductDto,
  ): Promise<SupplierProduct> {
    await this.suppliersService.getOwnedSupplierOrThrow(
      organizationId,
      supplierId,
    );
    // Confirms the product belongs to this organization too — the
    // cross-tenant check the directive explicitly calls for.
    await this.productsService.getOwnedProductOrThrow(
      organizationId,
      dto.productId,
    );

    const alreadyAssociated =
      await this.supplierProductsRepository.existsBySupplierAndProduct(
        organizationId,
        supplierId,
        dto.productId,
      );
    if (alreadyAssociated) {
      throw new ConflictException(
        'This product is already associated with this supplier',
      );
    }

    const association = this.supplierProductsRepository.create({
      organizationId,
      supplierId,
      productId: dto.productId,
      supplierSku: dto.supplierSku ?? null,
      unitCost: dto.unitCost !== undefined ? dto.unitCost.toFixed(2) : null,
      leadTimeDays: dto.leadTimeDays ?? null,
      minimumOrderQuantity: dto.minimumOrderQuantity ?? null,
    });

    return this.supplierProductsRepository.save(association);
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
