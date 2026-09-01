import { OrdersService } from '../../orders/orders.service';
import { Permission } from '../../authorization/permissions.enum';
import { AiTool, AiExecutionContext } from './ai-tool.interface';

export interface GetOrderInput {
  orderId: string;
}

export interface GetOrderOutput {
  id: string;
  orderNumber: string;
  customerId: string;
  status: string;
  subtotal: string;
  discount: string;
  total: string;
  notes: string | null;
}

/**
 * get_order
 *
 * Second Tool Registry entry, mirroring get_customer's shape:
 * read-only, org-scoped via OrdersService.getOwnedOrderOrThrow
 * (called internally by getOrder()) — no new tenant-isolation
 * logic introduced. Unlike getCustomer(), getOrder() always
 * throws NotFoundException rather than returning null, so no
 * separate not-found check is needed here.
 *
 * Header-only for v1 — order line items are a separate concern
 * (OrdersService.listOrderItems) and are deliberately left out of
 * scope; a get_order_items tool can be added later if needed
 * rather than folding a second internal call into this one.
 *
 * Output omits organizationId (redundant — already org-scoped),
 * shippingAddressId and createdBy (internal bookkeeping, no
 * obvious AI-facing use per the same reasoning as get_customer).
 */
export function createGetOrderTool(
  ordersService: OrdersService,
): AiTool<GetOrderInput, GetOrderOutput> {
  return {
    name: 'get_order',
    description:
      "Fetch a single order's details by ID, scoped to the caller's organization.",
    inputSchema: {
      type: 'object',
      properties: {
        orderId: { type: 'string', format: 'uuid' },
      },
      required: ['orderId'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        orderNumber: { type: 'string' },
        customerId: { type: 'string' },
        status: { type: 'string' },
        subtotal: { type: 'string' },
        discount: { type: 'string' },
        total: { type: 'string' },
        notes: { type: ['string', 'null'] },
      },
    },
    requiredPermission: Permission.ORDER_READ,
    classification: 'read',
    validateInput: (value): value is GetOrderInput =>
      typeof value === 'object' &&
      value !== null &&
      typeof (value as { orderId?: unknown }).orderId === 'string',
    execute: async (input, ctx: AiExecutionContext) => {
      const order = await ordersService.getOrder(
        ctx.organizationId,
        input.orderId,
      );
      return {
        id: order.id,
        orderNumber: order.orderNumber,
        customerId: order.customerId,
        status: order.status,
        subtotal: order.subtotal,
        discount: order.discount,
        total: order.total,
        notes: order.notes,
      };
    },
  };
}
