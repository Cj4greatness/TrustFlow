import { Injectable, NotFoundException } from '@nestjs/common';
import { AiContextRequest, AiAssembledContext } from './ai-context.types';
import { OrdersService } from '../../orders/orders.service';
import { CustomersService } from '../../customers/customers.service';
import { InventoryRepository } from '../../products/inventory.repository';

/**
 * AiContextService
 *
 * S7-01 §5. Assembles exactly one of AiContextOperation per request —
 * never a raw entity/database dump. Each case below pulls only
 * through existing domain services'/repositories' getOwnedXOrThrow-
 * style methods; the one exception is InventoryRepository.
 * findByOrganization(), added alongside this implementation — a
 * direct find() on an indexed column, not a custom query, following
 * the same pattern as other repos' findByOrganization/
 * findAllForOrganization methods.
 *
 * Authorization is NOT re-implemented here — callers must already
 * have passed PermissionsGuard / hold a valid AiExecutionContext
 * before assemble() is invoked. This service only decides WHAT
 * data is included, not WHETHER the caller may see it.
 */
@Injectable()
export class AiContextService {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly customersService: CustomersService,
    private readonly inventoryRepository: InventoryRepository,
  ) {}

  async assemble(request: AiContextRequest): Promise<AiAssembledContext> {
    switch (request.operation) {
      case 'order_summary':
        return this.assembleOrderSummary(request);
      case 'customer_summary':
        return this.assembleCustomerSummary(request);
      case 'inventory_summary':
        return this.assembleInventorySummary(request);
      default: {
        const _exhaustive: never = request.operation;
        throw new Error(
          `Unhandled AI context operation: ${String(_exhaustive)}`,
        );
      }
    }
  }

  private async assembleOrderSummary(
    request: AiContextRequest,
  ): Promise<AiAssembledContext> {
    const orderId = request.params.orderId;
    if (!orderId) {
      throw new Error('order_summary requires params.orderId');
    }

    const order = await this.ordersService.getOrder(
      request.organizationId,
      orderId,
    );

    const customer = await this.customersService.getCustomer(
      request.organizationId,
      order.customerId,
    );
    if (!customer) {
      throw new NotFoundException(
        `Customer ${order.customerId} not found for order ${orderId}`,
      );
    }

    const items = await this.ordersService.listOrderItems(
      request.organizationId,
      orderId,
    );

    return {
      operation: 'order_summary',
      data: {
        orderNumber: order.orderNumber,
        status: order.status,
        customerName: customer.displayName,
        itemCount: items.length,
        total: order.total,
      },
    };
  }

  private async assembleCustomerSummary(
    request: AiContextRequest,
  ): Promise<AiAssembledContext> {
    const customerId = request.params.customerId;
    if (!customerId) {
      throw new Error('customer_summary requires params.customerId');
    }

    const customer = await this.customersService.getCustomer(
      request.organizationId,
      customerId,
    );
    if (!customer) {
      throw new NotFoundException(`Customer ${customerId} not found`);
    }

    return {
      operation: 'customer_summary',
      data: {
        displayName: customer.displayName,
        customerType: customer.customerType,
        status: customer.status,
        email: customer.email,
        phone: customer.phone,
      },
    };
  }

  private async assembleInventorySummary(
    request: AiContextRequest,
  ): Promise<AiAssembledContext> {
    const inventories = await this.inventoryRepository.findByOrganization(
      request.organizationId,
    );

    const totalSkus = inventories.length;
    const lowStockCount = inventories.filter(
      (inv) =>
        inv.lowStockThreshold !== null && inv.quantity <= inv.lowStockThreshold,
    ).length;
    const outOfStockCount = inventories.filter(
      (inv) => inv.quantity === 0,
    ).length;

    return {
      operation: 'inventory_summary',
      data: {
        totalSkus,
        lowStockCount,
        outOfStockCount,
      },
    };
  }
}
