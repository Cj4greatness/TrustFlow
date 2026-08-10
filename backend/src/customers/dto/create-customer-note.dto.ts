import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Fields a caller provides when adding a note to a customer. There
 * is deliberately no UpdateCustomerNoteDto — CustomerNote is
 * append-only by design (see the entity's doc comment), so no
 * update endpoint will be built against it in Sprint 4.
 *
 * customerId, organizationId, and authorId are excluded — customerId
 * and organizationId come from route params, authorId from the
 * authenticated user.
 *
 * No existing entity in the codebase has a `text`-type column, so
 * there's no established validation precedent to mirror here. A
 * MaxLength(5000) bound is applied as a defensive default; worth a
 * deliberate decision (not this DTO layer) if notes need to be
 * longer.
 */
export class CreateCustomerNoteDto {
  @ApiProperty({
    example: 'Customer requested a call back next Tuesday about pricing.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  body: string;
}
