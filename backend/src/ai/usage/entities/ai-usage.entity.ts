import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Organization } from '../../../organizations/entities/organization.entity';

/**
 * AIUsageStatus
 *
 * S7-01 §8. Recorded by AiGatewayService after every provider call,
 * success or failure — directive §17 requires failed requests to
 * record an appropriate status, not just successes.
 */
export enum AIUsageStatus {
  SUCCESS = 'success',
  FAILURE = 'failure',
}

/**
 * AIUsage
 *
 * S7-01 §8 / Sprint 7 directive §13. Tracks AI provider consumption
 * for future subscription limits, billing, monitoring, and abuse
 * prevention (directive §7). This entity is purely observational —
 * it is never read by domain business logic, only written by
 * AiGatewayService and read by future usage/billing reporting.
 *
 * organizationId is required (not nullable) — every AI request is
 * always made in the context of an authenticated organization
 * member, same tenant-ownership requirement as every other entity
 * in the codebase (directive §11).
 *
 * userId is intentionally a plain string column, not a FK to
 * OrganizationMember — usage records must survive membership
 * removal for audit/billing history, same reasoning as why
 * Delivery.assignedDeliveryPerson isn't an FK.
 */
@Entity('ai_usage')
export class AIUsage extends BaseEntity {
  @Column({ name: 'organization_id', type: 'uuid' })
  @Index()
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ name: 'user_id', type: 'uuid' })
  @Index()
  userId: string;

  @Column({ type: 'varchar', length: 64 })
  provider: string;

  @Column({ type: 'varchar', length: 128 })
  model: string;

  /** Correlates this usage row back to the originating AI request for tracing. */
  @Column({ name: 'request_id', type: 'uuid' })
  @Index()
  requestId: string;

  @Column({ name: 'input_tokens', type: 'integer', default: 0 })
  inputTokens: number;

  @Column({ name: 'output_tokens', type: 'integer', default: 0 })
  outputTokens: number;

  @Column({ name: 'total_tokens', type: 'integer', default: 0 })
  totalTokens: number;

  /** In USD cents; null if the provider didn't report pricing data for this call. */
  @Column({ name: 'estimated_cost_cents', type: 'integer', nullable: true })
  estimatedCostCents: number | null;

  @Column({ name: 'latency_ms', type: 'integer' })
  latencyMs: number;

  @Column({ type: 'enum', enum: AIUsageStatus })
  status: AIUsageStatus;

  /** Set only when status is FAILURE — a coarse category, never raw provider error text (no prompt/response leakage into this table). */
  @Column({
    name: 'error_category',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  errorCategory: string | null;
}
