import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer } from './entities/customer.entity';
import { CustomerQueryDto } from './dto/customer-query.dto';

export interface PaginatedCustomers {
  data: Customer[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Encapsulates all direct database access for Customer, following
 * the same shape as UsersRepository/OrganizationsRepository: plain
 * CRUD + purpose-named finders, no query logic in the service layer.
 */
@Injectable()
export class CustomersRepository {
  constructor(
    @InjectRepository(Customer)
    private readonly repository: Repository<Customer>,
  ) {}

  create(data: Partial<Customer>): Customer {
    return this.repository.create(data);
  }

  save(customer: Customer): Promise<Customer> {
    return this.repository.save(customer);
  }

  findById(id: string): Promise<Customer | null> {
    return this.repository.findOne({ where: { id } });
  }

  /**
   * Checks for an existing, non-deleted customer with this email
   * within the organization — mirrors the partial unique index on
   * (organizationId, email), giving the service a friendly
   * ConflictException instead of surfacing a raw DB constraint
   * violation. excludeCustomerId lets updateCustomer() check without
   * tripping over the customer's own current email.
   */
  async existsByOrganizationAndEmail(
    organizationId: string,
    email: string,
    excludeCustomerId?: string,
  ): Promise<boolean> {
    const qb = this.repository
      .createQueryBuilder('customer')
      .where('customer.organization_id = :organizationId', { organizationId })
      .andWhere('customer.email = :email', { email })
      .andWhere('customer.deleted_at IS NULL');

    if (excludeCustomerId) {
      qb.andWhere('customer.id != :excludeCustomerId', { excludeCustomerId });
    }

    return (await qb.getCount()) > 0;
  }

  /**
   * Backs listCustomers(). Uses createQueryBuilder rather than the
   * repository's find() because find() has no support for the
   * ILIKE-based free-text search below — note this means deleted_at
   * IS NULL must be filtered explicitly here, since (unlike
   * find()/findOne()) createQueryBuilder does not auto-exclude
   * soft-deleted rows.
   */
  async findByOrganization(
    organizationId: string,
    query: CustomerQueryDto,
  ): Promise<PaginatedCustomers> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.repository
      .createQueryBuilder('customer')
      .where('customer.organization_id = :organizationId', { organizationId })
      .andWhere('customer.deleted_at IS NULL');

    if (query.status) {
      qb.andWhere('customer.status = :status', { status: query.status });
    }

    if (query.search) {
      qb.andWhere(
        '(customer.display_name ILIKE :search OR customer.email ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }

    qb.orderBy('customer.created_at', 'DESC')
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
