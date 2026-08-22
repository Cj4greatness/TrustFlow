import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

/**
 * ReceiptCounter
 *
 * One row per organization — unlike InvoiceCounter, this does NOT
 * reset per year. §8's own example (TF-000001, TF-000002,
 * TF-000003) shows a plain incrementing sequence per org, no year
 * component. Confirmed against the directive text, not assumed by
 * analogy to Invoice numbering.
 */
@Entity('receipt_counters')
@Index(['organizationId'], { unique: true })
export class ReceiptCounter extends BaseEntity {
  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId: string;

  @Column({ type: 'int', name: 'last_number', default: 0 })
  lastNumber: number;
}
