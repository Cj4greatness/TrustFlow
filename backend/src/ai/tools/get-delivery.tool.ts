import { DeliveriesService } from '../../deliveries/deliveries.service';
import { Permission } from '../../authorization/permissions.enum';
import { AiTool, AiExecutionContext } from './ai-tool.interface';

export interface GetDeliveryInput {
  deliveryId: string;
}

export interface GetDeliveryOutput {
  id: string;
  orderId: string;
  customerId: string;
  status: string;
  trackingReference: string | null;
  assignedDeliveryPerson: string | null;
  deliveryAddressLine1: string;
  deliveryAddressLine2: string | null;
  deliveryAddressCity: string;
  deliveryAddressState: string | null;
  deliveryAddressPostalCode: string | null;
  deliveryAddressCountry: string;
  pickupAt: Date | null;
  deliveredAt: Date | null;
  failureReason: string | null;
  cancellationReason: string | null;
}

/**
 * get_delivery
 *
 * Fifth Tool Registry entry, mirroring get_customer/get_order's
 * shape: read-only, org-scoped via
 * DeliveriesRepository.getOwnedDeliveryOrThrow (called internally by
 * getDelivery()) — no new tenant-isolation logic introduced.
 *
 * NOTE: DeliveriesService.getDelivery() takes (id, organizationId) —
 * the REVERSE argument order from get_order/get_supplier's
 * (organizationId, id). Preserved here exactly as the service
 * defines it, same as get_invoice.
 *
 * Address fields, tracking/assignment, and status-transition
 * timestamps/reasons are all included since they're the primary
 * business-relevant content of a Delivery (unlike Order/Customer,
 * there's no deeper "line items" concern being deliberately
 * excluded here — this is the full useful surface of the entity).
 * organizationId and createdBy-equivalent fields omitted per prior
 * tools' reasoning (delivery has no createdBy field on this entity).
 */
export function createGetDeliveryTool(
  deliveriesService: DeliveriesService,
): AiTool<GetDeliveryInput, GetDeliveryOutput> {
  return {
    name: 'get_delivery',
    description:
      "Fetch a single delivery's details by ID, scoped to the caller's organization.",
    inputSchema: {
      type: 'object',
      properties: {
        deliveryId: { type: 'string', format: 'uuid' },
      },
      required: ['deliveryId'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        orderId: { type: 'string' },
        customerId: { type: 'string' },
        status: { type: 'string' },
        trackingReference: { type: ['string', 'null'] },
        assignedDeliveryPerson: { type: ['string', 'null'] },
        deliveryAddressLine1: { type: 'string' },
        deliveryAddressLine2: { type: ['string', 'null'] },
        deliveryAddressCity: { type: 'string' },
        deliveryAddressState: { type: ['string', 'null'] },
        deliveryAddressPostalCode: { type: ['string', 'null'] },
        deliveryAddressCountry: { type: 'string' },
        pickupAt: { type: ['string', 'null'], format: 'date-time' },
        deliveredAt: { type: ['string', 'null'], format: 'date-time' },
        failureReason: { type: ['string', 'null'] },
        cancellationReason: { type: ['string', 'null'] },
      },
    },
    requiredPermission: Permission.DELIVERY_READ,
    classification: 'read',
    validateInput: (value): value is GetDeliveryInput =>
      typeof value === 'object' &&
      value !== null &&
      typeof (value as { deliveryId?: unknown }).deliveryId === 'string',
    execute: async (input, ctx: AiExecutionContext) => {
      const delivery = await deliveriesService.getDelivery(
        input.deliveryId,
        ctx.organizationId,
      );
      return {
        id: delivery.id,
        orderId: delivery.orderId,
        customerId: delivery.customerId,
        status: delivery.status,
        trackingReference: delivery.trackingReference,
        assignedDeliveryPerson: delivery.assignedDeliveryPerson,
        deliveryAddressLine1: delivery.deliveryAddressLine1,
        deliveryAddressLine2: delivery.deliveryAddressLine2,
        deliveryAddressCity: delivery.deliveryAddressCity,
        deliveryAddressState: delivery.deliveryAddressState,
        deliveryAddressPostalCode: delivery.deliveryAddressPostalCode,
        deliveryAddressCountry: delivery.deliveryAddressCountry,
        pickupAt: delivery.pickupAt,
        deliveredAt: delivery.deliveredAt,
        failureReason: delivery.failureReason,
        cancellationReason: delivery.cancellationReason,
      };
    },
  };
}
