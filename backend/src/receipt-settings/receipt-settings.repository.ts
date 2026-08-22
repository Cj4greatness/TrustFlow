import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { ReceiptSettings } from './entities/receipt-settings.entity';

/**
 * ReceiptSettingsRepository
 *
 * Matches InvoicesRepository/PaymentsRepository's shape — no shared
 * base-repository class exists in this codebase (confirmed via grep
 * during Sprint 5's CTO review, Gate 6).
 */
@Injectable()
export class ReceiptSettingsRepository {
  constructor(
    @InjectRepository(ReceiptSettings)
    private readonly repo: Repository<ReceiptSettings>,
  ) {}

  async findByOrganization(
    organizationId: string,
  ): Promise<ReceiptSettings | null> {
    return this.repo.findOne({ where: { organizationId } });
  }

  async create(data: Partial<ReceiptSettings>): Promise<ReceiptSettings> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async save(entity: ReceiptSettings): Promise<ReceiptSettings> {
    return this.repo.save(entity);
  }
}
