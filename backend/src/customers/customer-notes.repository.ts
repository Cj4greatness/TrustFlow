import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CustomerNote } from './entities/customer-note.entity';

/**
 * No update/delete methods — CustomerNote is append-only by design
 * (see the entity's doc comment and CustomerNotesController, which
 * has no PATCH/DELETE routes to back one anyway).
 */
@Injectable()
export class CustomerNotesRepository {
  constructor(
    @InjectRepository(CustomerNote)
    private readonly repository: Repository<CustomerNote>,
  ) {}

  create(data: Partial<CustomerNote>): CustomerNote {
    return this.repository.create(data);
  }

  save(note: CustomerNote): Promise<CustomerNote> {
    return this.repository.save(note);
  }

  findByCustomer(customerId: string): Promise<CustomerNote[]> {
    return this.repository.find({
      where: { customerId },
      relations: { author: true },
      order: { createdAt: 'DESC' },
    });
  }
}
