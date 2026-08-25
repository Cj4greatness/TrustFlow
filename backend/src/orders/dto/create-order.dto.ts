import { IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Fields a caller provides when creating an order. organizationId
 * (route param) and createdBy (authenticated user) excluded, per
 * convention. subtotal/discount/total are deliberately absent —
 * Directive v1 §14 rules 7-8: totals are server-calculated, never
 * client-trusted. discount is not specified anywhere in the
 * directive as client-settable, so it isn't exposed here either;
 * it's service-computed (currently always 0 — no discount rule
 * exists yet in v1).
 *
 * Items are NOT created here — per Directive §11, order items are
 * managed through their own nested endpoint
 * (POST /organizations/:id/orders/:orderId/items), not embedded in
 * order creation. An order can exist with zero items only in DRAFT
 * (Directive §18 item 8: must have >=1 item before confirmation).
 *
 * shippingAddressId (Sprint 6): optional at creation — ratified:
 * not required until the Order moves to PROCESSING (that's when
 * Delivery auto-creates and genuinely needs a real address).
 */
export class CreateOrderDto {
  @ApiProperty({ description: 'UUID of the customer placing this order' })
  @IsUUID()
  customerId: string;

  @ApiPropertyOptional({ example: 'Rush delivery requested' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    description:
      'UUID of the CustomerAddress to ship this order to (can also be set later while DRAFT)',
  })
  @IsOptional()
  @IsUUID()
  shippingAddressId?: string;
}
