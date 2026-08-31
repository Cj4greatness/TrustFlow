import { Injectable, NotFoundException } from '@nestjs/common';
import {
  SuppliersRepository,
  PaginatedSuppliers,
} from './suppliers.repository';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { SupplierQueryDto } from './dto/supplier-query.dto';
import { Supplier, SupplierStatus } from './entities/supplier.entity';

@Injectable()
export class SuppliersService {
  constructor(private readonly suppliersRepository: SuppliersRepository) {}

  /**
   * Tenant-isolation check, same pattern as
   * ProductsService.getOwnedProductOrThrow. Public —
   * SupplierProductsService calls this via an injected
   * SuppliersService to verify supplier ownership.
   */
  async getOwnedSupplierOrThrow(
    organizationId: string,
    supplierId: string,
  ): Promise<Supplier> {
    const supplier = await this.suppliersRepository.findById(supplierId);
    if (!supplier || supplier.organizationId !== organizationId) {
      throw new NotFoundException('Supplier not found in this organization');
    }
    return supplier;
  }

  async createSupplier(
    organizationId: string,
    dto: CreateSupplierDto,
    createdByUserId: string,
  ): Promise<Supplier> {
    const supplier = this.suppliersRepository.create({
      organizationId,
      name: dto.name,
      contactName: dto.contactName ?? null,
      email: dto.email ?? null,
      phone: dto.phone ?? null,
      address: dto.address ?? null,
      notes: dto.notes ?? null,
      status: dto.status ?? SupplierStatus.ACTIVE,
      createdBy: createdByUserId,
    });

    return this.suppliersRepository.save(supplier);
  }

  async listSuppliers(
    organizationId: string,
    query: SupplierQueryDto,
  ): Promise<PaginatedSuppliers> {
    return this.suppliersRepository.findByOrganization(organizationId, query);
  }

  async getSupplier(
    organizationId: string,
    supplierId: string,
  ): Promise<Supplier> {
    return this.getOwnedSupplierOrThrow(organizationId, supplierId);
  }

  async updateSupplier(
    organizationId: string,
    supplierId: string,
    dto: UpdateSupplierDto,
  ): Promise<Supplier> {
    const existing = await this.getOwnedSupplierOrThrow(
      organizationId,
      supplierId,
    );

    const updated = this.suppliersRepository.create({
      ...existing,
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.contactName !== undefined && { contactName: dto.contactName }),
      ...(dto.email !== undefined && { email: dto.email }),
      ...(dto.phone !== undefined && { phone: dto.phone }),
      ...(dto.address !== undefined && { address: dto.address }),
      ...(dto.notes !== undefined && { notes: dto.notes }),
      ...(dto.status !== undefined && { status: dto.status }),
    });

    return this.suppliersRepository.save(updated);
  }

  async deleteSupplier(
    organizationId: string,
    supplierId: string,
  ): Promise<void> {
    await this.getOwnedSupplierOrThrow(organizationId, supplierId);
    await this.suppliersRepository.softDelete(supplierId);
  }
}
