import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Organization } from '../../organizations/entities/organization.entity';

/**
 * ReceiptSettings
 *
 * Sprint 6 CTO Directive §9-§12: organization-owned receipt branding
 * configuration, intentionally minimal — displayName + accentColor,
 * nothing more. At most one active row per organization.
 *
 * Configuration vs. truth (§3): this entity controls what FUTURE
 * receipts look like. It does NOT retroactively change receipts
 * already issued — those snapshot displayName/accentColor onto
 * themselves at issue time (see Receipt entity's
 * displayNameSnapshot/accentColorSnapshot). Changing a row here must
 * never alter a previously issued Receipt.
 *
 * Unique-per-org via a partial index (WHERE deleted_at IS NULL),
 * matching the supplier_products convention for soft-deletable
 * unique constraints — not a plain unique column, since that would
 * make it impossible to recreate settings after any future soft
 * delete. No delete endpoint exists in v1; this is precautionary
 * consistency with the rest of the codebase, not a stated
 * requirement of the directive.
 */
@Entity('receipt_settings')
export class ReceiptSettings extends BaseEntity {
  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ type: 'varchar', length: 255, name: 'display_name' })
  displayName: string;

  @Column({ type: 'varchar', length: 7, name: 'accent_color' })
  accentColor: string;
}
