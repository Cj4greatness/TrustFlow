import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { DeliveriesService } from './deliveries.service';
import { AssignDeliveryDto } from './dto/assign-delivery.dto';
import { FailDeliveryDto } from './dto/fail-delivery.dto';
import { CancelDeliveryDto } from './dto/cancel-delivery.dto';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { Permissions } from '../authorization/decorators/permissions.decorator';
import { Permission } from '../authorization/permissions.enum';

/**
 * DeliveriesController
 *
 * No POST create endpoint — Delivery creation is fully automatic
 * when an Order moves to PROCESSING (OrdersService.processOrder()),
 * matching the Invoice/Receipt precedent already established this
 * session. DELIVERY_CREATE exists in the permission enum but is
 * deliberately never assigned to any role — dead config, since no
 * controller here ever checks it.
 */
@ApiTags('deliveries')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@Controller('organizations/:id/deliveries')
export class DeliveriesController {
  constructor(private readonly deliveriesService: DeliveriesService) {}

  @Get()
  @Permissions(Permission.DELIVERY_READ)
  @ApiOperation({ summary: 'List deliveries in an organization' })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  findAll(@Param('id', ParseUUIDPipe) organizationId: string) {
    return this.deliveriesService.listDeliveries(organizationId);
  }

  @Get(':deliveryId')
  @Permissions(Permission.DELIVERY_READ)
  @ApiOperation({ summary: 'Get a single delivery' })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  @ApiParam({ name: 'deliveryId', description: 'Delivery UUID' })
  findOne(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
  ) {
    return this.deliveriesService.getDelivery(deliveryId, organizationId);
  }

  @Post(':deliveryId/assign')
  @Permissions(Permission.DELIVERY_ASSIGN)
  @ApiOperation({
    summary: 'Assign a delivery person/courier (PENDING -> ASSIGNED)',
  })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  @ApiParam({ name: 'deliveryId', description: 'Delivery UUID' })
  assign(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
    @Body() dto: AssignDeliveryDto,
  ) {
    return this.deliveriesService.assignDelivery(
      deliveryId,
      organizationId,
      dto,
    );
  }

  @Post(':deliveryId/pickup')
  @Permissions(Permission.DELIVERY_TRANSITION)
  @ApiOperation({ summary: 'Mark picked up (ASSIGNED -> PICKED_UP)' })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  @ApiParam({ name: 'deliveryId', description: 'Delivery UUID' })
  pickup(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
  ) {
    return this.deliveriesService.markPickedUp(deliveryId, organizationId);
  }

  @Post(':deliveryId/in-transit')
  @Permissions(Permission.DELIVERY_TRANSITION)
  @ApiOperation({ summary: 'Mark in transit (PICKED_UP -> IN_TRANSIT)' })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  @ApiParam({ name: 'deliveryId', description: 'Delivery UUID' })
  inTransit(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
  ) {
    return this.deliveriesService.markInTransit(deliveryId, organizationId);
  }

  @Post(':deliveryId/deliver')
  @Permissions(Permission.DELIVERY_TRANSITION)
  @ApiOperation({ summary: 'Mark delivered (IN_TRANSIT -> DELIVERED)' })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  @ApiParam({ name: 'deliveryId', description: 'Delivery UUID' })
  deliver(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
  ) {
    return this.deliveriesService.markDelivered(deliveryId, organizationId);
  }

  @Post(':deliveryId/fail')
  @Permissions(Permission.DELIVERY_TRANSITION)
  @ApiOperation({ summary: 'Mark failed (IN_TRANSIT -> FAILED)' })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  @ApiParam({ name: 'deliveryId', description: 'Delivery UUID' })
  fail(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
    @Body() dto: FailDeliveryDto,
  ) {
    return this.deliveriesService.markFailed(deliveryId, organizationId, dto);
  }

  @Post(':deliveryId/cancel')
  @Permissions(Permission.DELIVERY_CANCEL)
  @ApiOperation({
    summary: 'Cancel a delivery (PENDING/ASSIGNED -> CANCELLED)',
  })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  @ApiParam({ name: 'deliveryId', description: 'Delivery UUID' })
  cancel(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
    @Body() dto: CancelDeliveryDto,
  ) {
    return this.deliveriesService.cancelDelivery(
      deliveryId,
      organizationId,
      dto,
    );
  }
}
