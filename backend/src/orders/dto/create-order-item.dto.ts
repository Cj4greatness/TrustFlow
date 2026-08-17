import { IsInt, IsUUID, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Fields a caller provides when adding an item to a DRAFT order.
 * Deliberately minimal: only productId and quantity. productName,
 * sku, and unitPrice are NEVER client-supplied — per Directive v1
 * §3/§9, they're snapshotted server-side from the live Product at
 * creation time. Accepting them from the client would let a caller
 * fabricate a price, directly undermining rule #8 ("client-provided
 * totals must not be trusted") one layer down.
 *
 * organizationId and orderId come from route params
 * (:id, :orderId).
 */
export class CreateOrderItemDto {
  @ApiProperty({ description: 'UUID of the product being ordered' })
  @IsUUID()
  productId: string;

  @ApiProperty({ example: 3, description: 'Quantity ordered' })
  @IsInt()
  @Min(1)
  quantity: number;
}
