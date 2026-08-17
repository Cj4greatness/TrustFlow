import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { OrdersRepository, PaginatedOrders } from './orders.repository';
import { OrderItemsRepository } from './order-items.repository';
import { OrderCounterRepository } from './order-counter.repository';
import { CustomersService } from '../customers/customers.service';
import { ProductsService } from '../products/products.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { OrderQueryDto } from './dto/order-query.dto';
import { CreateOrderItemDto } from './dto/create-order-item.dto';
import { UpdateOrderItemDto } from './dto/update-order-item.dto';
import { Order, OrderStatus } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { InventoryService } from '../products/inventory.service';
import { InventoryMovementType } from '../products/entities/inventory-movement.entity';
import {
  isTransitionAllowed,
  cancellationRequiresInventoryRestore,
} from './order-transitions';

const ORDER_NUMBER_PREFIX = 'TF-';
const ORDER_NUMBER_PAD_LENGTH = 6;

@Injectable()
export class OrdersService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly ordersRepository: OrdersRepository,
    private readonly orderItemsRepository: OrderItemsRepository,
    private readonly orderCounterRepository: OrderCounterRepository,
    private readonly customersService: CustomersService,
    private readonly productsService: ProductsService,
    private readonly inventoryService: InventoryService,
  ) {}

  async getOwnedOrderOrThrow(
    organizationId: string,
    orderId: string,
  ): Promise<Order> {
    const order = await this.ordersRepository.findById(orderId);
    if (!order || order.organizationId !== organizationId) {
      throw new NotFoundException('Order not found in this organization');
    }
    return order;
  }

  private formatOrderNumber(n: number): string {
    return `${ORDER_NUMBER_PREFIX}${String(n).padStart(ORDER_NUMBER_PAD_LENGTH, '0')}`;
  }

  async createOrder(
    organizationId: string,
    dto: CreateOrderDto,
    createdByUserId: string,
  ): Promise<Order> {
    await this.customersService.getOwnedCustomerOrThrow(
      organizationId,
      dto.customerId,
    );

    return this.dataSource.transaction(async (manager) => {
      const ordersRepo = this.ordersRepository.withTransaction(manager);
      const counterRepo = this.orderCounterRepository.withTransaction(manager);

      let counter =
        await counterRepo.findByOrganizationIdForUpdate(organizationId);
      if (!counter) {
        const newCounter = counterRepo.create({
          organizationId,
          lastNumber: 0,
        });
        counter = await counterRepo.save(newCounter);
      }

      const nextNumber = counter.lastNumber + 1;
      counter.lastNumber = nextNumber;
      await counterRepo.save(counter);

      const order = ordersRepo.create({
        organizationId,
        customerId: dto.customerId,
        orderNumber: this.formatOrderNumber(nextNumber),
        status: OrderStatus.DRAFT,
        subtotal: '0.00',
        discount: '0.00',
        total: '0.00',
        notes: dto.notes ?? null,
        createdBy: createdByUserId,
      });

      return ordersRepo.save(order);
    });
  }

  async listOrders(
    organizationId: string,
    query: OrderQueryDto,
  ): Promise<PaginatedOrders> {
    return this.ordersRepository.findByOrganization(organizationId, query);
  }

  async getOrder(organizationId: string, orderId: string): Promise<Order> {
    return this.getOwnedOrderOrThrow(organizationId, orderId);
  }

  async updateOrder(
    organizationId: string,
    orderId: string,
    dto: UpdateOrderDto,
  ): Promise<Order> {
    const existing = await this.getOwnedOrderOrThrow(organizationId, orderId);
    if (existing.status !== OrderStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT orders can be updated');
    }

    if (dto.customerId && dto.customerId !== existing.customerId) {
      await this.customersService.getOwnedCustomerOrThrow(
        organizationId,
        dto.customerId,
      );
    }

    const updated = this.ordersRepository.create({
      ...existing,
      ...(dto.customerId !== undefined && { customerId: dto.customerId }),
      ...(dto.notes !== undefined && { notes: dto.notes }),
    });

    return this.ordersRepository.save(updated);
  }

  async deleteOrder(organizationId: string, orderId: string): Promise<void> {
    const existing = await this.getOwnedOrderOrThrow(organizationId, orderId);
    if (existing.status !== OrderStatus.DRAFT) {
      throw new BadRequestException(
        'Only DRAFT orders can be deleted — use /cancel for CONFIRMED or PROCESSING orders',
      );
    }
    await this.ordersRepository.hardDelete(orderId);
  }

  // -----------------------------------------------------------------
  // Order items
  //
  // Every mutation (add/update/remove) and its totals recalculation
  // run inside one transaction — confirmed decision, so a crash
  // between "item saved" and "order totals updated" can never leave
  // Order.subtotal/total out of sync with its actual items.
  // -----------------------------------------------------------------

  private async recalculateOrderTotalsTx(
    orderItemsRepo: ReturnType<OrderItemsRepository['withTransaction']>,
    ordersRepo: ReturnType<OrdersRepository['withTransaction']>,
    order: Order,
  ): Promise<void> {
    const items = await orderItemsRepo.findByOrderId(order.id);
    const subtotal = items.reduce(
      (sum, item) => sum + Number(item.subtotal),
      0,
    );
    const discount = Number(order.discount);

    order.subtotal = subtotal.toFixed(2);
    order.total = (subtotal - discount).toFixed(2);
    await ordersRepo.save(order);
  }

  async addOrderItem(
    organizationId: string,
    orderId: string,
    dto: CreateOrderItemDto,
  ): Promise<OrderItem> {
    const order = await this.getOwnedOrderOrThrow(organizationId, orderId);
    if (order.status !== OrderStatus.DRAFT) {
      throw new BadRequestException(
        'Items can only be added while the order is DRAFT',
      );
    }

    const product = await this.productsService.getOwnedProductOrThrow(
      organizationId,
      dto.productId,
    );
    const unitPrice = Number(product.sellingPrice);
    const subtotal = unitPrice * dto.quantity;

    return this.dataSource.transaction(async (manager) => {
      const orderItemsRepo = this.orderItemsRepository.withTransaction(manager);
      const ordersRepo = this.ordersRepository.withTransaction(manager);

      const item = orderItemsRepo.create({
        organizationId,
        orderId,
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        unitPrice: unitPrice.toFixed(2),
        quantity: dto.quantity,
        subtotal: subtotal.toFixed(2),
      });
      const saved = await orderItemsRepo.save(item);

      await this.recalculateOrderTotalsTx(orderItemsRepo, ordersRepo, order);
      return saved;
    });
  }

  async listOrderItems(
    organizationId: string,
    orderId: string,
  ): Promise<OrderItem[]> {
    await this.getOwnedOrderOrThrow(organizationId, orderId);
    return this.orderItemsRepository.findByOrderId(orderId);
  }

  private async getOwnedItemOrThrow(
    organizationId: string,
    orderId: string,
    itemId: string,
  ): Promise<OrderItem> {
    const item = await this.orderItemsRepository.findById(itemId);
    if (
      !item ||
      item.organizationId !== organizationId ||
      item.orderId !== orderId
    ) {
      throw new NotFoundException('Order item not found for this order');
    }
    return item;
  }

  async updateOrderItem(
    organizationId: string,
    orderId: string,
    itemId: string,
    dto: UpdateOrderItemDto,
  ): Promise<OrderItem> {
    const order = await this.getOwnedOrderOrThrow(organizationId, orderId);
    if (order.status !== OrderStatus.DRAFT) {
      throw new BadRequestException(
        'Items can only be updated while the order is DRAFT',
      );
    }
    const item = await this.getOwnedItemOrThrow(
      organizationId,
      orderId,
      itemId,
    );

    return this.dataSource.transaction(async (manager) => {
      const orderItemsRepo = this.orderItemsRepository.withTransaction(manager);
      const ordersRepo = this.ordersRepository.withTransaction(manager);

      item.quantity = dto.quantity;
      item.subtotal = (Number(item.unitPrice) * dto.quantity).toFixed(2);
      const saved = await orderItemsRepo.save(item);

      await this.recalculateOrderTotalsTx(orderItemsRepo, ordersRepo, order);
      return saved;
    });
  }

  async removeOrderItem(
    organizationId: string,
    orderId: string,
    itemId: string,
  ): Promise<void> {
    const order = await this.getOwnedOrderOrThrow(organizationId, orderId);
    if (order.status !== OrderStatus.DRAFT) {
      throw new BadRequestException(
        'Items can only be removed while the order is DRAFT',
      );
    }
    await this.getOwnedItemOrThrow(organizationId, orderId, itemId);

    await this.dataSource.transaction(async (manager) => {
      const orderItemsRepo = this.orderItemsRepository.withTransaction(manager);
      const ordersRepo = this.ordersRepository.withTransaction(manager);

      await orderItemsRepo.hardDelete(itemId);
      await this.recalculateOrderTotalsTx(orderItemsRepo, ordersRepo, order);
    });
  }

  // -----------------------------------------------------------------
  // Status transitions
  // -----------------------------------------------------------------

  private assertTransitionAllowed(order: Order, to: OrderStatus): void {
    if (!isTransitionAllowed(order.status, to)) {
      throw new BadRequestException(
        `Cannot transition order from ${order.status} to ${to}`,
      );
    }
  }

  async confirmOrder(
    organizationId: string,
    orderId: string,
    createdByUserId: string,
  ): Promise<Order> {
    const order = await this.getOwnedOrderOrThrow(organizationId, orderId);
    this.assertTransitionAllowed(order, OrderStatus.CONFIRMED);

    const items = await this.orderItemsRepository.findByOrderId(orderId);
    if (items.length === 0) {
      throw new BadRequestException('Cannot confirm an order with no items');
    }

    return this.dataSource.transaction(async (manager) => {
      const ordersRepo = this.ordersRepository.withTransaction(manager);

      for (const item of items) {
        await this.inventoryService.adjustInventory(
          organizationId,
          item.productId,
          {
            type: InventoryMovementType.REMOVE,
            quantity: item.quantity,
            reason: `Order ${order.orderNumber} confirmed`,
          },
          createdByUserId,
          manager,
        );
      }

      const lockedOrder = await ordersRepo.findByIdForUpdate(orderId);
      if (!lockedOrder) {
        throw new NotFoundException('Order not found');
      }
      lockedOrder.status = OrderStatus.CONFIRMED;
      return ordersRepo.save(lockedOrder);
    });
  }

  async processOrder(organizationId: string, orderId: string): Promise<Order> {
    const order = await this.getOwnedOrderOrThrow(organizationId, orderId);
    this.assertTransitionAllowed(order, OrderStatus.PROCESSING);

    order.status = OrderStatus.PROCESSING;
    return this.ordersRepository.save(order);
  }

  async completeOrder(organizationId: string, orderId: string): Promise<Order> {
    const order = await this.getOwnedOrderOrThrow(organizationId, orderId);
    this.assertTransitionAllowed(order, OrderStatus.COMPLETED);

    order.status = OrderStatus.COMPLETED;
    return this.ordersRepository.save(order);
  }

  async cancelOrder(
    organizationId: string,
    orderId: string,
    createdByUserId: string,
  ): Promise<Order> {
    const order = await this.getOwnedOrderOrThrow(organizationId, orderId);
    this.assertTransitionAllowed(order, OrderStatus.CANCELLED);

    const needsRestore = cancellationRequiresInventoryRestore(order.status);
    const items = needsRestore
      ? await this.orderItemsRepository.findByOrderId(orderId)
      : [];

    return this.dataSource.transaction(async (manager) => {
      const ordersRepo = this.ordersRepository.withTransaction(manager);

      for (const item of items) {
        await this.inventoryService.adjustInventory(
          organizationId,
          item.productId,
          {
            type: InventoryMovementType.ADD,
            quantity: item.quantity,
            reason: `Order ${order.orderNumber} cancelled — inventory restored`,
          },
          createdByUserId,
          manager,
        );
      }

      const lockedOrder = await ordersRepo.findByIdForUpdate(orderId);
      if (!lockedOrder) {
        throw new NotFoundException('Order not found');
      }
      lockedOrder.status = OrderStatus.CANCELLED;
      return ordersRepo.save(lockedOrder);
    });
  }
}
