import { IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Only quantity is updatable on an existing order item — per
 * Directive §18 item 7 (confirmed: DRAFT item quantities can
 * change). productId/productName/sku/unitPrice are immutable once
 * set: changing the product would effectively mean removing this
 * item and adding a different one, not "updating" it. Quantity is
 * required (not optional) since it's the only field — an empty
 * PATCH body would be meaningless here, unlike DTOs with several
 * optional fields.
 */
export class UpdateOrderItemDto {
  @ApiProperty({ example: 5, description: 'New quantity for this item' })
  @IsInt()
  @Min(1)
  quantity: number;
}
