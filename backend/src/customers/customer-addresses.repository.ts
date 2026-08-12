import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CustomerAddress } from './entities/customer-address.entity';

@Injectable()
export class CustomerAddressesRepository {
  constructor(
    @InjectRepository(CustomerAddress)
    private readonly repository: Repository<CustomerAddress>,
  ) {}

  create(data: Partial<CustomerAddress>): CustomerAddress {
    return this.repository.create(data);
  }

  save(address: CustomerAddress): Promise<CustomerAddress> {
    return this.repository.save(address);
  }

  findById(id: string): Promise<CustomerAddress | null> {
    return this.repository.findOne({ where: { id } });
  }

  findByCustomer(customerId: string): Promise<CustomerAddress[]> {
    return this.repository.find({
      where: { customerId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Soft-deletes rather than hard-deletes, for consistency with
   * every other BaseEntity-derived table (Customer, User). Nothing
   * currently reads deleted addresses back — flag to the CTO if a
   * hard delete is actually intended here.
   */
  async softDelete(id: string): Promise<void> {
    await this.repository.softDelete({ id });
  }
}
