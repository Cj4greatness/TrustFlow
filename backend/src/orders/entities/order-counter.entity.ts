import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';

/**
 * OrderCounter
 *
 * One row per organization, tracking the last-issued order number.
 * Not exposed via any API — purely internal state consumed by
 * OrdersService.createOrder(), which locks this row with
 * pessimistic_write inside the order-creation transaction, exactly
 * mirroring the concurrency-safe pattern proven in
 * InventoryService.adjustInventory(). No BaseEntity — this isn't a
 * business record with a lifecycle, just a counter.
 */
@Entity('order_counters')
export class OrderCounter {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'organization_id', unique: true })
  organizationId: string;

  @OneToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ type: 'int', name: 'last_number', default: 0 })
  lastNumber: number;
}
