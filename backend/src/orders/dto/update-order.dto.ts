import { IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Fields a caller can update on a DRAFT order. Per Directive v1 §14
 * rule 5, updates are only meaningful while status === DRAFT — the
 * service layer enforces that, not this DTO. customerId is left
 * updatable (no directive language forbidding it) with the same
 * organization-ownership check applied as at creation. status is
 * deliberately excluded — status changes go through the dedicated
 * confirm/cancel/process/complete actions, not a generic PATCH.
 *
 * shippingAddressId (Sprint 6): optional here even though it becomes
 * REQUIRED before processOrder() can succeed — ratified this
 * session: settable any time while DRAFT (like notes), validated as
 * required only at the PROCESSING transition, not at creation or
 * every update.
 */
export class UpdateOrderDto {
  @ApiPropertyOptional({
    description: 'UUID of a different customer for this order',
  })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({ example: 'Updated delivery instructions' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    description: 'UUID of the CustomerAddress to ship this order to',
  })
  @IsOptional()
  @IsUUID()
  shippingAddressId?: string;
}
