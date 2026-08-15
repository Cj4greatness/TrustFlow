import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Inventory } from './inventory.entity';
import { User } from '../../users/entities/user.entity';

/**
 * The direction of an inventory adjustment. Per CTO Directive v1 §7,
 * v1 only supports ADD/REMOVE — no arbitrary "set quantity" without
 * an audit trail.
 */
export enum InventoryMovementType {
  ADD = 'add',
  REMOVE = 'remove',
}

/**
 * InventoryMovement
 *
 * Append-only audit trail of every inventory adjustment (Directive
 * §7) — no update/delete endpoints will be built against this table,
 * mirroring CustomerNote's append-only design for the same reason:
 * keeping the audit trail honest.
 *
 * onDelete: 'RESTRICT' on the Inventory relation is deliberate — an
 * Inventory row cannot be deleted while movement history exists,
 * since that history must survive for future AI inventory
 * intelligence, reporting, and potential financial reconciliation.
 * v1 defines no Inventory deletion pathway at all, so this mainly
 * documents intent rather than blocking anything that would
 * otherwise happen — but it's explicit rather than left to the
 * database's default behavior.
 *
 * organizationId is denormalized for the same tenant-isolation
 * reason as Inventory/CustomerAddress/CustomerNote.
 *
 * quantity here is always a positive magnitude — direction comes
 * from `type`, not the sign of quantity. (ADD 20 vs. REMOVE 3, not
 * ADD 20 vs. ADD -3.)
 */
@Entity('inventory_movements')
@Index(['organizationId'])
@Index(['inventoryId'])
export class InventoryMovement extends BaseEntity {
  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId: string;

  @Column({ type: 'uuid', name: 'inventory_id' })
  inventoryId: string;

  @ManyToOne(() => Inventory, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'inventory_id' })
  inventory: Inventory;

  @Column({
    type: 'enum',
    enum: InventoryMovementType,
  })
  type: InventoryMovementType;

  @Column({ type: 'int' })
  quantity: number;

  @Column({ type: 'varchar', length: 500 })
  reason: string;

  @Column({ type: 'uuid', name: 'created_by' })
  createdBy: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'created_by' })
  creator: User;
}
