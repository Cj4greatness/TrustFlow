import { Injectable } from '@nestjs/common';
import { EntityManager, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Product } from './entities/product.entity';
import { ProductQueryDto } from './dto/product-query.dto';

export interface PaginatedProducts {
  data: Product[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class ProductsRepository {
  constructor(
    @InjectRepository(Product)
    private readonly repository: Repository<Product>,
  ) {}

  create(data: Partial<Product>): Product {
    return this.repository.create(data);
  }

  save(product: Product): Promise<Product> {
    return this.repository.save(product);
  }

  findById(id: string): Promise<Product | null> {
    return this.repository.findOne({ where: { id } });
  }

  async existsByOrganizationAndSku(
    organizationId: string,
    sku: string,
    excludeProductId?: string,
  ): Promise<boolean> {
    const qb = this.repository
      .createQueryBuilder('product')
      .where('product.organization_id = :organizationId', { organizationId })
      .andWhere('product.sku = :sku', { sku })
      .andWhere('product.deleted_at IS NULL');

    if (excludeProductId) {
      qb.andWhere('product.id != :excludeProductId', { excludeProductId });
    }

    return (await qb.getCount()) > 0;
  }

  async findByOrganization(
    organizationId: string,
    query: ProductQueryDto,
  ): Promise<PaginatedProducts> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.repository
      .createQueryBuilder('product')
      .where('product.organization_id = :organizationId', { organizationId })
      .andWhere('product.deleted_at IS NULL');

    if (query.status) {
      qb.andWhere('product.status = :status', { status: query.status });
    }

    if (query.search) {
      qb.andWhere('(product.name ILIKE :search OR product.sku ILIKE :search)', {
        search: `%${query.search}%`,
      });
    }

    qb.orderBy('product.created_at', 'DESC')
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

  /**
   * Same operations as above, but bound to a transactional
   * EntityManager rather than this repository's own connection —
   * used by ProductsService.createProduct() so the product and its
   * initial Inventory row commit or roll back together as a single
   * atomic unit, mirroring OrganizationsRepository.withTransaction().
   */
  withTransaction(manager: EntityManager) {
    const transactionalRepo = manager.getRepository(Product);
    return {
      create: (data: Partial<Product>) => transactionalRepo.create(data),
      save: (product: Product) => transactionalRepo.save(product),
    };
  }
}
