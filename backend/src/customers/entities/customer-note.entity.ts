import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Customer } from './customer.entity';
import { User } from '../../users/entities/user.entity';

/**
 * CustomerNote
 *
 * Append-only by design for Sprint 4: no update/delete endpoints
 * will be built against this table, keeping the audit trail honest.
 * (If editable notes are ever needed, that should be a deliberate
 * later decision, not an oversight — mirroring how membership-rules
 * exceptions are documented rather than silently introduced.)
 *
 * organizationId is denormalized for the same reason as on
 * CustomerAddress: it keeps the tenant-isolation check on this
 * table a direct column comparison rather than a join through
 * Customer.
 *
 * authorId carries a full FK relation to User (onDelete: CASCADE),
 * matching Invitation.invitedBy — unlike Customer.createdBy, a note
 * has no independent business value once both the note and its
 * author are gone, so cascading here doesn't risk orphaning
 * standalone business data the way it would on Customer itself.
 */
@Entity('customer_notes')
@Index(['organizationId'])
@Index(['customerId'])
export class CustomerNote extends BaseEntity {
  @Column({ type: 'uuid', name: 'customer_id' })
  customerId: string;

  @ManyToOne(() => Customer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId: string;

  @Column({ type: 'uuid', name: 'author_id' })
  authorId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'author_id' })
  author: User;

  @Column({ type: 'text' })
  body: string;
}
