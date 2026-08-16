import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Supplier } from './entities/supplier.entity';
import { SupplierQueryDto } from './dto/supplier-query.dto';

export interface PaginatedSuppliers {
  data: Supplier[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Encapsulates all direct database access for Supplier, matching
 * ProductsRepository's shape exactly.
 */
@Injectable()
export class SuppliersRepository {
  constructor(
    @InjectRepository(Supplier)
    private readonly repository: Repository<Supplier>,
  ) {}

  create(data: Partial<Supplier>): Supplier {
    return this.repository.create(data);
  }

  save(supplier: Supplier): Promise<Supplier> {
    return this.repository.save(supplier);
  }

  findById(id: string): Promise<Supplier | null> {
    return this.repository.findOne({ where: { id } });
  }

  /**
   * Backs listSuppliers(). Uses createQueryBuilder for ILIKE-based
   * free-text search, same reasoning as CustomersRepository/
   * ProductsRepository — deleted_at IS NULL must be explicit here.
   */
  async findByOrganization(
    organizationId: string,
    query: SupplierQueryDto,
  ): Promise<PaginatedSuppliers> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.repository
      .createQueryBuilder('supplier')
      .where('supplier.organization_id = :organizationId', { organizationId })
      .andWhere('supplier.deleted_at IS NULL');

    if (query.status) {
      qb.andWhere('supplier.status = :status', { status: query.status });
    }

    if (query.search) {
      qb.andWhere(
        '(supplier.name ILIKE :search OR supplier.email ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }

    qb.orderBy('supplier.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    };
  }

  async softDelete(id: string): Promise<void> {
    await this.repository.softDelete({ id });
  }
}
