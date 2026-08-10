import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Customer } from './customer.entity';

export enum CustomerAddressType {
  BILLING = 'billing',
  SHIPPING = 'shipping',
  OTHER = 'other',
}

/**
 * CustomerAddress
 *
 * organizationId is denormalized here rather than reached via the
 * customer relation. This is deliberate: it's what keeps the
 * tenant-isolation check on child rows a single-column comparison
 * (address.organizationId !== currentOrganizationId) instead of a
 * join back through Customer — the same shape of gap the Sprint 3
 * RBAC audit found in listMembers(), where a check was missing on a
 * path one join removed from the obviously-guarded one.
 */
@Entity('customer_addresses')
@Index(['organizationId'])
@Index(['customerId'])
export class CustomerAddress extends BaseEntity {
  @Column({ type: 'uuid', name: 'customer_id' })
  customerId: string;

  @ManyToOne(() => Customer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId: string;

  @Column({
    type: 'enum',
    enum: CustomerAddressType,
    default: CustomerAddressType.OTHER,
  })
  type: CustomerAddressType;

  @Column({ type: 'varchar', length: 255, name: 'line1' })
  line1: string;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'line2' })
  line2: string | null;

  @Column({ type: 'varchar', length: 100 })
  city: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  state: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true, name: 'postal_code' })
  postalCode: string | null;

  @Column({ type: 'varchar', length: 100 })
  country: string;

  @Column({ type: 'boolean', default: false, name: 'is_default' })
  isDefault: boolean;
}
