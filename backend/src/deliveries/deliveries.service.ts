import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { Delivery, DeliveryStatus } from './entities/delivery.entity';
import { DeliveriesRepository } from './deliveries.repository';
import { Order } from '../orders/entities/order.entity';
import { CustomerAddress } from '../customers/entities/customer-address.entity';
import { AssignDeliveryDto } from './dto/assign-delivery.dto';
import { FailDeliveryDto } from './dto/fail-delivery.dto';
import { CancelDeliveryDto } from './dto/cancel-delivery.dto';

/**
 * Explicit allowed-transition table, matching order-transitions.ts's
 * pattern exactly. Per Sprint 6 CTO Directive §25: primary path
 * PENDING -> ASSIGNED -> PICKED_UP -> IN_TRANSIT -> DELIVERED.
 * Exceptional: PENDING/ASSIGNED -> CANCELLED, IN_TRANSIT -> FAILED.
 * Everything else (e.g. DELIVERED -> IN_TRANSIT, CANCELLED ->
 * ASSIGNED, FAILED -> DELIVERED) is invalid.
 */
const ALLOWED_TRANSITIONS: Record<DeliveryStatus, DeliveryStatus[]> = {
  [DeliveryStatus.PENDING]: [DeliveryStatus.ASSIGNED, DeliveryStatus.CANCELLED],
  [DeliveryStatus.ASSIGNED]: [
    DeliveryStatus.PICKED_UP,
    DeliveryStatus.CANCELLED,
  ],
  [DeliveryStatus.PICKED_UP]: [DeliveryStatus.IN_TRANSIT],
  [DeliveryStatus.IN_TRANSIT]: [
    DeliveryStatus.DELIVERED,
    DeliveryStatus.FAILED,
  ],
  [DeliveryStatus.DELIVERED]: [],
  [DeliveryStatus.FAILED]: [],
  [DeliveryStatus.CANCELLED]: [],
};

function isTransitionAllowed(
  from: DeliveryStatus,
  to: DeliveryStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/**
 * DeliveriesService
 *
 * RATIFIED: Delivery creation is automatic when an Order moves to
 * PROCESSING (not CONFIRMED, unlike Invoice) — createDeliveryForOrder()
 * runs inside OrdersService.processOrder()'s transaction, using a
 * manager parameter, not its own transaction — same non-negotiable
 * shape as InvoicesService.createInvoiceForOrder(): a lost/failed
 * Delivery creation must roll back the whole PROCESSING transition,
 * not leave a PROCESSING order with no Delivery.
 *
 * One Delivery per Order (ratified), enforced by the DB unique index
 * on (organizationId, orderId) — this method doesn't pre-check for
 * an existing Delivery the way Invoice's does, because the only
 * caller (processOrder) already only reaches PROCESSING once per
 * Order (DRAFT->CONFIRMED->PROCESSING is a one-way, non-repeatable
 * path per order-transitions.ts), so a duplicate-creation race isn't
 * a realistic scenario the way concurrent Payments are.
 */
@Injectable()
export class DeliveriesService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly deliveriesRepository: DeliveriesRepository,
  ) {}

  async createDeliveryForOrder(
    order: Order,
    manager: EntityManager,
  ): Promise<Delivery> {
    if (!order.shippingAddressId) {
      throw new BadRequestException(
        `Order ${order.id} has no shippingAddressId — required before moving to PROCESSING`,
      );
    }

    const address = await manager.findOne(CustomerAddress, {
      where: {
        id: order.shippingAddressId,
        organizationId: order.organizationId,
      },
    });
    if (!address) {
      throw new NotFoundException(
        `CustomerAddress ${order.shippingAddressId} not found`,
      );
    }

    const delivery = manager.create(Delivery, {
      organizationId: order.organizationId,
      orderId: order.id,
      customerId: order.customerId,
      status: DeliveryStatus.PENDING,
      deliveryAddressLine1: address.line1,
      deliveryAddressLine2: address.line2,
      deliveryAddressCity: address.city,
      deliveryAddressState: address.state,
      deliveryAddressPostalCode: address.postalCode,
      deliveryAddressCountry: address.country,
      trackingReference: null,
      assignedDeliveryPerson: null,
      pickupAt: null,
      deliveredAt: null,
      failureReason: null,
      cancellationReason: null,
    });

    return manager.save(Delivery, delivery);
  }

  async getDelivery(id: string, organizationId: string): Promise<Delivery> {
    return this.deliveriesRepository.getOwnedDeliveryOrThrow(
      id,
      organizationId,
    );
  }

  async listDeliveries(organizationId: string): Promise<Delivery[]> {
    return this.deliveriesRepository.findAllForOrganization(organizationId);
  }

  async lockDeliveryForOrder(
    manager: EntityManager,
    orderId: string,
    organizationId: string,
  ): Promise<Delivery | null> {
    const order = await manager.getRepository(Order).findOne({
      where: { id: orderId, organizationId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!order) {
      throw new NotFoundException('Order not found in this organization');
    }

    return manager.getRepository(Delivery).findOne({
      where: { orderId, organizationId },
      lock: { mode: 'pessimistic_write' },
    });
  }

  async cancelPendingDeliveryInTransaction(
    manager: EntityManager,
    delivery: Delivery,
    cancellationReason: string,
  ): Promise<Delivery> {
    return this.transitionLockedDelivery(
      manager,
      delivery,
      DeliveryStatus.CANCELLED,
      (lockedDelivery) => {
        lockedDelivery.cancellationReason = cancellationReason;
      },
    );
  }

  /**
   * §27: assignment is deliberately minimal — a free-text
   * trackingReference/assignedDeliveryPerson pair, no driver entity.
   * PENDING -> ASSIGNED only.
   */
  async assignDelivery(
    id: string,
    organizationId: string,
    dto: AssignDeliveryDto,
  ): Promise<Delivery> {
    return this.transitionDelivery(
      id,
      organizationId,
      DeliveryStatus.ASSIGNED,
      (delivery) => {
        delivery.assignedDeliveryPerson = dto.assignedDeliveryPerson;
        if (dto.trackingReference !== undefined) {
          delivery.trackingReference = dto.trackingReference;
        }
      },
    );
  }

  async markPickedUp(id: string, organizationId: string): Promise<Delivery> {
    return this.transitionDelivery(
      id,
      organizationId,
      DeliveryStatus.PICKED_UP,
      (delivery) => {
        delivery.pickupAt = new Date();
      },
    );
  }

  async markInTransit(id: string, organizationId: string): Promise<Delivery> {
    return this.transitionDelivery(
      id,
      organizationId,
      DeliveryStatus.IN_TRANSIT,
    );
  }

  async markDelivered(id: string, organizationId: string): Promise<Delivery> {
    return this.transitionDelivery(
      id,
      organizationId,
      DeliveryStatus.DELIVERED,
      (delivery) => {
        delivery.deliveredAt = new Date();
      },
    );
  }

  async markFailed(
    id: string,
    organizationId: string,
    dto: FailDeliveryDto,
  ): Promise<Delivery> {
    return this.transitionDelivery(
      id,
      organizationId,
      DeliveryStatus.FAILED,
      (delivery) => {
        delivery.failureReason = dto.failureReason;
      },
    );
  }

  async cancelDelivery(
    id: string,
    organizationId: string,
    dto: CancelDeliveryDto,
  ): Promise<Delivery> {
    return this.transitionDelivery(
      id,
      organizationId,
      DeliveryStatus.CANCELLED,
      (delivery) => {
        delivery.cancellationReason = dto.cancellationReason;
      },
    );
  }

  private async transitionDelivery(
    id: string,
    organizationId: string,
    to: DeliveryStatus,
    update?: (delivery: Delivery) => void,
  ): Promise<Delivery> {
    const delivery = await this.deliveriesRepository.getOwnedDeliveryOrThrow(
      id,
      organizationId,
    );
    this.assertTransitionAllowed(delivery, to);

    return this.dataSource.transaction(async (manager) => {
      const lockedDelivery = await this.lockDeliveryForOrder(
        manager,
        delivery.orderId,
        organizationId,
      );
      if (!lockedDelivery || lockedDelivery.id !== id) {
        throw new NotFoundException(`Delivery ${id} not found`);
      }

      return this.transitionLockedDelivery(manager, lockedDelivery, to, update);
    });
  }

  private transitionLockedDelivery(
    manager: EntityManager,
    delivery: Delivery,
    to: DeliveryStatus,
    update?: (delivery: Delivery) => void,
  ): Promise<Delivery> {
    this.assertTransitionAllowed(delivery, to);
    delivery.status = to;
    update?.(delivery);
    return manager.getRepository(Delivery).save(delivery);
  }

  private assertTransitionAllowed(
    delivery: Delivery,
    to: DeliveryStatus,
  ): void {
    if (!isTransitionAllowed(delivery.status, to)) {
      throw new BadRequestException(
        `Cannot transition delivery from ${delivery.status} to ${to}`,
      );
    }
  }
}
