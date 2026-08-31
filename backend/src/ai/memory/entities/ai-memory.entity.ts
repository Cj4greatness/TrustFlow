import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Organization } from '../../../organizations/entities/organization.entity';

/**
 * AIMemory
 *
 * S7-01 §7 / §13. Backing store for AiMemoryService. Explicitly
 * org/user scoped — never cross-tenant or platform-global, matching
 * the organizationId-on-every-entity pattern used everywhere else.
 *
 * One row per (organizationId, userId, key) — set() upserts, so a
 * key is overwritten rather than accumulating duplicate rows. The
 * unique constraint enforces that at the database level, not just
 * in application code.
 *
 * This table is reserved for intentionally-retained conversational/
 * preference context only (directive §6). Business data (Orders,
 * Invoices, Payments, Customers, Inventory) must never be written
 * here — that boundary is a review responsibility, not something
 * this entity can enforce mechanically.
 */
@Entity('ai_memory')
@Unique('UQ_ai_memory_org_user_key', ['organizationId', 'userId', 'key'])
export class AIMemory extends BaseEntity {
  @Column({ name: 'organization_id', type: 'uuid' })
  @Index()
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ name: 'user_id', type: 'uuid' })
  @Index()
  userId: string;

  @Column({ type: 'varchar', length: 256 })
  key: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;
}
