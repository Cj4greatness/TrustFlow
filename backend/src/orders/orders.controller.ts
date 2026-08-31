import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { OrderQueryDto } from './dto/order-query.dto';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { Permissions } from '../authorization/decorators/permissions.decorator';
import { Permission } from '../authorization/permissions.enum';

interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}

@ApiTags('orders')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@Controller('organizations/:id/orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @Permissions(Permission.ORDER_CREATE)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a DRAFT order' })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  createOrder(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Body() dto: CreateOrderDto,
    @Req() req: RequestWithUser,
  ) {
    return this.ordersService.createOrder(organizationId, dto, req.user.id);
  }

  @Get()
  @Permissions(Permission.ORDER_READ)
  @ApiOperation({ summary: 'List orders in an organization' })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  listOrders(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Query() query: OrderQueryDto,
  ) {
    return this.ordersService.listOrders(organizationId, query);
  }

  @Get(':orderId')
  @Permissions(Permission.ORDER_READ)
  @ApiOperation({ summary: 'Get a single order' })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  @ApiParam({ name: 'orderId', description: 'Order UUID' })
  getOrder(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    return this.ordersService.getOrder(organizationId, orderId);
  }

  @Patch(':orderId')
  @Permissions(Permission.ORDER_UPDATE)
  @ApiOperation({ summary: 'Update a DRAFT order' })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  @ApiParam({ name: 'orderId', description: 'Order UUID' })
  updateOrder(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: UpdateOrderDto,
  ) {
    return this.ordersService.updateOrder(organizationId, orderId, dto);
  }

  @Delete(':orderId')
  @Permissions(Permission.ORDER_UPDATE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a DRAFT order (true removal, not cancellation)',
  })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  @ApiParam({ name: 'orderId', description: 'Order UUID' })
  async deleteOrder(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ): Promise<void> {
    await this.ordersService.deleteOrder(organizationId, orderId);
  }

  @Post(':orderId/confirm')
  @Permissions(Permission.ORDER_CONFIRM)
  @ApiOperation({ summary: 'Confirm an order, deducting inventory atomically' })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  @ApiParam({ name: 'orderId', description: 'Order UUID' })
  confirmOrder(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Req() req: RequestWithUser,
  ) {
    return this.ordersService.confirmOrder(
      organizationId,
      orderId,
      req.user.id,
    );
  }

  @Post(':orderId/process')
  @Permissions(Permission.ORDER_PROCESS)
  @ApiOperation({ summary: 'Move a CONFIRMED order to PROCESSING' })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  @ApiParam({ name: 'orderId', description: 'Order UUID' })
  processOrder(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    return this.ordersService.processOrder(organizationId, orderId);
  }

  @Post(':orderId/complete')
  @Permissions(Permission.ORDER_COMPLETE)
  @ApiOperation({ summary: 'Mark a PROCESSING order COMPLETED' })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  @ApiParam({ name: 'orderId', description: 'Order UUID' })
  completeOrder(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    return this.ordersService.completeOrder(organizationId, orderId);
  }

  @Post(':orderId/cancel')
  @Permissions(Permission.ORDER_CANCEL)
  @ApiOperation({
    summary: 'Cancel an order, restoring inventory if applicable',
  })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  @ApiParam({ name: 'orderId', description: 'Order UUID' })
  cancelOrder(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Req() req: RequestWithUser,
  ) {
    return this.ordersService.cancelOrder(organizationId, orderId, req.user.id);
  }
}
