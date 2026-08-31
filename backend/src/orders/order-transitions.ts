import { OrderStatus } from './entities/order.entity';

/**
 * The complete, locked allowed-transitions table for Order.status,
 * per Orders Directive v1 §2/§18 (explicitly confirmed: PROCESSING
 * is mandatory, no CONFIRMED->COMPLETED skip). COMPLETED and
 * CANCELLED are terminal — neither appears as a key, since nothing
 * transitions out of them.
 */
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.DRAFT]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  [OrderStatus.CONFIRMED]: [OrderStatus.PROCESSING, OrderStatus.CANCELLED],
  [OrderStatus.PROCESSING]: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
  [OrderStatus.COMPLETED]: [],
  [OrderStatus.CANCELLED]: [],
};

export function isTransitionAllowed(
  from: OrderStatus,
  to: OrderStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/**
 * Whether cancelling from this status requires restoring inventory.
 * Only CONFIRMED and PROCESSING orders have had inventory deducted
 * (at CONFIRM time) — a DRAFT order cancelled never touched
 * inventory at all, so there's nothing to restore. Directive v1 §8.
 */
export function cancellationRequiresInventoryRestore(
  from: OrderStatus,
): boolean {
  return from === OrderStatus.CONFIRMED || from === OrderStatus.PROCESSING;
}
