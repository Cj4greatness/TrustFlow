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
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { OrdersService } from './orders.service';
import { CreateOrderItemDto } from './dto/create-order-item.dto';
import { UpdateOrderItemDto } from './dto/update-order-item.dto';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { Permissions } from '../authorization/decorators/permissions.decorator';
import { Permission } from '../authorization/permissions.enum';

@ApiTags('orders')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@Controller('organizations/:id/orders/:orderId/items')
export class OrderItemsController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @Permissions(Permission.ORDER_UPDATE)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add an item to a DRAFT order' })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  @ApiParam({ name: 'orderId', description: 'Order UUID' })
  addItem(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: CreateOrderItemDto,
  ) {
    return this.ordersService.addOrderItem(organizationId, orderId, dto);
  }

  @Get()
  @Permissions(Permission.ORDER_READ)
  @ApiOperation({ summary: "List an order's items" })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  @ApiParam({ name: 'orderId', description: 'Order UUID' })
  listItems(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    return this.ordersService.listOrderItems(organizationId, orderId);
  }

  @Patch(':itemId')
  @Permissions(Permission.ORDER_UPDATE)
  @ApiOperation({ summary: 'Update an item quantity on a DRAFT order' })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  @ApiParam({ name: 'orderId', description: 'Order UUID' })
  @ApiParam({ name: 'itemId', description: 'OrderItem UUID' })
  updateItem(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateOrderItemDto,
  ) {
    return this.ordersService.updateOrderItem(
      organizationId,
      orderId,
      itemId,
      dto,
    );
  }

  @Delete(':itemId')
  @Permissions(Permission.ORDER_UPDATE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove an item from a DRAFT order' })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  @ApiParam({ name: 'orderId', description: 'Order UUID' })
  @ApiParam({ name: 'itemId', description: 'OrderItem UUID' })
  async removeItem(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ): Promise<void> {
    await this.ordersService.removeOrderItem(organizationId, orderId, itemId);
  }
}
