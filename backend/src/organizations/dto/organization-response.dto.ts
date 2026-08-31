import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';
import {
  OrganizationStatus,
  SubscriptionPlan,
} from '../entities/organization.entity';

@Exclude()
export class OrganizationResponseDto {
  @Expose()
  @ApiProperty()
  id: string;

  @Expose()
  @ApiProperty()
  name: string;

  @Expose()
  @ApiProperty()
  slug: string;

  @Expose()
  @ApiProperty({ required: false, nullable: true })
  industry: string | null;

  @Expose()
  @ApiProperty({ required: false, nullable: true })
  country: string | null;

  @Expose()
  @ApiProperty({ required: false, nullable: true })
  timezone: string | null;

  @Expose()
  @ApiProperty()
  currency: string;

  @Expose()
  @ApiProperty({ required: false, nullable: true })
  logo: string | null;

  @Expose()
  @ApiProperty({ enum: SubscriptionPlan })
  subscriptionPlan: SubscriptionPlan;

  @Expose()
  @ApiProperty({ enum: OrganizationStatus })
  status: OrganizationStatus;

  @Expose()
  @ApiProperty()
  createdAt: Date;

  constructor(partial: Partial<OrganizationResponseDto>) {
    Object.assign(this, partial);
  }
}
