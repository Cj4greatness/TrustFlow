import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

/**
 * InvoiceCounter
 *
 * One row per (organization, year). RATIFIED numbering format is
 * year-prefixed and resets to 1 each calendar year per organization
 * — e.g. INV-2026-000123, then INV-2027-000001 on the first invoice
 * of the following year. That's why this is keyed on (organizationId,
 * year), not organizationId alone.
 *
 * Concurrency: InvoicesService.nextInvoiceNumber() acquires this row
 * with a pessimistic write lock inside the same transaction as the
 * Invoice insert, same approach as OrderCounter /
 * InventoryService.adjustInventory().
 *
 * NOT YET MIGRATED: no migration exists for this table yet (or
 * `invoices`/`invoice_line_items`). The (organizationId, year) unique
 * constraint below must be reflected in that migration, since
 * nextInvoiceNumber() relies on it for its ON CONFLICT upsert.
 */
@Entity('invoice_counters')
@Index(['organizationId', 'year'], { unique: true })
export class InvoiceCounter extends BaseEntity {
  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId: string;

  @Column({ type: 'int' })
  year: number;

  @Column({ type: 'int', name: 'last_number', default: 0 })
  lastNumber: number;
}
