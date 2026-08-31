import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { InventoryMovementType } from '../entities/inventory-movement.entity';

/**
 * Fields a caller provides when adjusting a product's inventory.
 * Per CTO Directive v1 §7, there is no arbitrary "set quantity"
 * operation — only explicit ADD/REMOVE adjustments with a reason,
 * each producing an InventoryMovement audit record.
 *
 * quantity is always a positive magnitude here — direction comes
 * from `type`, matching the InventoryMovement entity's own
 * convention (ADD 20 vs. REMOVE 3, not ADD 20 vs. ADD -3).
 *
 * organizationId, productId/inventoryId, and createdBy are excluded
 * — they come from route params and the authenticated user,
 * matching the Customer module's DTO convention.
 */
export class AdjustInventoryDto {
  @ApiProperty({
    enum: InventoryMovementType,
    example: InventoryMovementType.ADD,
  })
  @IsEnum(InventoryMovementType)
  type: InventoryMovementType;

  @ApiProperty({
    example: 20,
    description: 'Positive magnitude of the adjustment',
  })
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiProperty({ example: 'New delivery from supplier' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
