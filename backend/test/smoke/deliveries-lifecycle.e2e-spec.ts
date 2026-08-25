import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { randomUUID } from 'crypto';
import { AppModule } from '../../src/app.module';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';

/**
 * Deliveries — Full Chain, State Machine, RBAC & Tenant Isolation (e2e)
 *
 * Sprint 6 CTO Directive §37, §40. HTTP-level, matching product-
 * inventory-rbac.e2e-spec.ts's pattern — DELIVERY_* permissions are
 * actually assigned in the matrix, so real guard-stack assertions
 * are both possible and required.
 *
 * §40 requirements covered: correct org, valid Order reference,
 * valid transition succeeds, invalid transition fails, unauthorized
 * assignment fails, authorized assignment succeeds, no backward
 * movement from terminal states, cross-tenant access fails,
 * timestamps recorded correctly.
 */

interface AuthResponseBody {
  accessToken: string;
}
interface OrganizationResponseBody {
  id: string;
}
interface InvitationResponseBody {
  token: string;
}
interface CustomerResponseBody {
  id: string;
}
interface AddressResponseBody {
  id: string;
}
interface ProductResponseBody {
  id: string;
}
interface OrderResponseBody {
  id: string;
  shippingAddressId: string | null;
}
interface DeliveryResponseBody {
  id: string;
  orderId: string;
  status: string;
  assignedDeliveryPerson: string | null;
  trackingReference: string | null;
  pickupAt: string | null;
  deliveredAt: string | null;
  failureReason: string | null;
  cancellationReason: string | null;
  deliveryAddressLine1: string;
  deliveryAddressCity: string;
  deliveryAddressCountry: string;
}

describe('Deliveries — Full Chain, State Machine, RBAC & Tenant Isolation (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;

  const runId = randomUUID().slice(0, 8);
  const PASSWORD = 'SecurePass123';

  const ownerEmail = `dl-owner.${runId}@example.com`;
  const adminEmail = `dl-admin.${runId}@example.com`;
  const managerEmail = `dl-manager.${runId}@example.com`;
  const staffEmail = `dl-staff.${runId}@example.com`;
  const viewerEmail = `dl-viewer.${runId}@example.com`;
  const orgBOwnerEmail = `dl-orgb-owner.${runId}@example.com`;

  let ownerToken: string;
  let adminToken: string;
  let managerToken: string;
  let staffToken: string;
  let viewerToken: string;
  let orgBOwnerToken: string;

  let orgAId: string;
  let orgBId: string;
  let customerAId: string;

  const registerAndLogin = async (
    email: string,
    firstName: string,
  ): Promise<string> => {
    await request(server).post('/auth/register').send({
      email,
      password: PASSWORD,
      firstName,
      lastName: 'Test',
    });
    const loginRes = await request(server)
      .post('/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return (loginRes.body as AuthResponseBody).accessToken;
  };

  const inviteAndAccept = async (
    inviteeEmail: string,
    inviteeToken: string,
    role: string,
  ): Promise<void> => {
    const inviteRes = await request(server)
      .post(`/organizations/${orgAId}/invitations`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: inviteeEmail, role })
      .expect(201);
    const invite = inviteRes.body as InvitationResponseBody;
    await request(server)
      .post(`/organizations/invitations/${invite.token}/accept`)
      .set('Authorization', `Bearer ${inviteeToken}`)
      .expect(204);
  };

  /**
   * Full chain helper: creates an address for the shared customer,
   * a product, an order with that address attached, adds one item,
   * confirms it (Invoice auto-creates, irrelevant here), then
   * processes it (Delivery auto-creates PENDING) — returns the
   * resulting Delivery.
   */
  const createProcessedOrderWithDelivery =
    async (): Promise<DeliveryResponseBody> => {
      const addressRes = await request(server)
        .post(`/organizations/${orgAId}/customers/${customerAId}/addresses`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          line1: '12 Admiralty Way',
          city: 'Lekki',
          country: 'Nigeria',
        })
        .expect(201);
      const address = addressRes.body as AddressResponseBody;

      const productRes = await request(server)
        .post(`/organizations/${orgAId}/products`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: 'Delivery Chain Product',
          sku: `DL-${randomUUID().slice(0, 8)}`,
          sellingPrice: 500,
        })
        .expect(201);
      const product = productRes.body as ProductResponseBody;

      await request(server)
        .post(
          `/organizations/${orgAId}/products/${product.id}/inventory/adjustments`,
        )
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ type: 'add', quantity: 20, reason: 'Seed stock' })
        .expect(201);

      const orderRes = await request(server)
        .post(`/organizations/${orgAId}/orders`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ customerId: customerAId, shippingAddressId: address.id })
        .expect(201);
      const order = orderRes.body as OrderResponseBody;

      await request(server)
        .post(`/organizations/${orgAId}/orders/${order.id}/items`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ productId: product.id, quantity: 2 })
        .expect(201);

      await request(server)
        .post(`/organizations/${orgAId}/orders/${order.id}/confirm`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(201);

      await request(server)
        .post(`/organizations/${orgAId}/orders/${order.id}/process`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(201);

      const deliveriesRes = await request(server)
        .get(`/organizations/${orgAId}/deliveries`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      const deliveries = deliveriesRes.body as DeliveryResponseBody[];
      const delivery = deliveries.find((d) => d.orderId === order.id);
      if (!delivery)
        throw new Error('Expected auto-created delivery not found');
      return delivery;
    };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    server = app.getHttpServer();

    ownerToken = await registerAndLogin(ownerEmail, 'DLOwner');
    adminToken = await registerAndLogin(adminEmail, 'DLAdmin');
    managerToken = await registerAndLogin(managerEmail, 'DLManager');
    staffToken = await registerAndLogin(staffEmail, 'DLStaff');
    viewerToken = await registerAndLogin(viewerEmail, 'DLViewer');
    orgBOwnerToken = await registerAndLogin(orgBOwnerEmail, 'DLOrgBOwner');

    const orgARes = await request(server)
      .post('/organizations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: `Deliveries Org A ${runId}`,
        country: 'Nigeria',
        currency: 'NGN',
      })
      .expect(201);
    orgAId = (orgARes.body as OrganizationResponseBody).id;

    const orgBRes = await request(server)
      .post('/organizations')
      .set('Authorization', `Bearer ${orgBOwnerToken}`)
      .send({
        name: `Deliveries Org B ${runId}`,
        country: 'Nigeria',
        currency: 'NGN',
      })
      .expect(201);
    orgBId = (orgBRes.body as OrganizationResponseBody).id;

    await inviteAndAccept(adminEmail, adminToken, 'admin');
    await inviteAndAccept(managerEmail, managerToken, 'manager');
    await inviteAndAccept(staffEmail, staffToken, 'staff');
    await inviteAndAccept(viewerEmail, viewerToken, 'viewer');

    const customerRes = await request(server)
      .post(`/organizations/${orgAId}/customers`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        customerType: 'individual',
        firstName: 'Delivery',
        lastName: 'Customer',
      })
      .expect(201);
    customerAId = (customerRes.body as CustomerResponseBody).id;
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  describe('shippingAddressId requirement — §26/ratified decision', () => {
    it('rejects processing an order with no shippingAddressId set', async () => {
      const productRes = await request(server)
        .post(`/organizations/${orgAId}/products`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: 'No Address Product',
          sku: `NOADDR-${runId}`,
          sellingPrice: 100,
        })
        .expect(201);
      const product = productRes.body as ProductResponseBody;
      await request(server)
        .post(
          `/organizations/${orgAId}/products/${product.id}/inventory/adjustments`,
        )
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ type: 'add', quantity: 10, reason: 'Seed stock' })
        .expect(201);

      const orderRes = await request(server)
        .post(`/organizations/${orgAId}/orders`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ customerId: customerAId })
        .expect(201);
      const order = orderRes.body as OrderResponseBody;
      expect(order.shippingAddressId).toBeNull();

      await request(server)
        .post(`/organizations/${orgAId}/orders/${order.id}/items`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ productId: product.id, quantity: 1 })
        .expect(201);
      await request(server)
        .post(`/organizations/${orgAId}/orders/${order.id}/confirm`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(201);

      await request(server)
        .post(`/organizations/${orgAId}/orders/${order.id}/process`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(400);
    });
  });

  describe('Full chain — auto-creation on PROCESSING', () => {
    it(
      'creates a PENDING delivery with the correct snapshotted address ' +
        'when an order moves to PROCESSING',
      async () => {
        const delivery = await createProcessedOrderWithDelivery();

        expect(delivery.status).toBe('pending');
        expect(delivery.deliveryAddressLine1).toBe('12 Admiralty Way');
        expect(delivery.deliveryAddressCity).toBe('Lekki');
        expect(delivery.deliveryAddressCountry).toBe('Nigeria');
        expect(delivery.assignedDeliveryPerson).toBeNull();
      },
    );
  });

  describe('State machine — §25', () => {
    it('walks the full primary path: PENDING -> ASSIGNED -> PICKED_UP -> IN_TRANSIT -> DELIVERED', async () => {
      const delivery = await createProcessedOrderWithDelivery();

      const assignRes = await request(server)
        .post(`/organizations/${orgAId}/deliveries/${delivery.id}/assign`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          assignedDeliveryPerson: 'GIG Logistics - Rider #42',
          trackingReference: 'GIG-12345',
        })
        .expect(201);
      expect((assignRes.body as DeliveryResponseBody).status).toBe('assigned');

      const pickupRes = await request(server)
        .post(`/organizations/${orgAId}/deliveries/${delivery.id}/pickup`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(201);
      expect((pickupRes.body as DeliveryResponseBody).status).toBe('picked_up');
      expect((pickupRes.body as DeliveryResponseBody).pickupAt).not.toBeNull();

      const transitRes = await request(server)
        .post(`/organizations/${orgAId}/deliveries/${delivery.id}/in-transit`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(201);
      expect((transitRes.body as DeliveryResponseBody).status).toBe(
        'in_transit',
      );

      const deliveredRes = await request(server)
        .post(`/organizations/${orgAId}/deliveries/${delivery.id}/deliver`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(201);
      expect((deliveredRes.body as DeliveryResponseBody).status).toBe(
        'delivered',
      );
      expect(
        (deliveredRes.body as DeliveryResponseBody).deliveredAt,
      ).not.toBeNull();
    });

    it('rejects skipping a state (PENDING straight to PICKED_UP)', async () => {
      const delivery = await createProcessedOrderWithDelivery();

      await request(server)
        .post(`/organizations/${orgAId}/deliveries/${delivery.id}/pickup`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(400);
    });

    it('rejects moving backward from a terminal state (DELIVERED -> IN_TRANSIT)', async () => {
      const delivery = await createProcessedOrderWithDelivery();
      await request(server)
        .post(`/organizations/${orgAId}/deliveries/${delivery.id}/assign`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ assignedDeliveryPerson: 'Courier X' })
        .expect(201);
      await request(server)
        .post(`/organizations/${orgAId}/deliveries/${delivery.id}/pickup`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(201);
      await request(server)
        .post(`/organizations/${orgAId}/deliveries/${delivery.id}/in-transit`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(201);
      await request(server)
        .post(`/organizations/${orgAId}/deliveries/${delivery.id}/deliver`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(201);

      await request(server)
        .post(`/organizations/${orgAId}/deliveries/${delivery.id}/in-transit`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(400);
    });

    it('allows IN_TRANSIT -> FAILED with a reason recorded', async () => {
      const delivery = await createProcessedOrderWithDelivery();
      await request(server)
        .post(`/organizations/${orgAId}/deliveries/${delivery.id}/assign`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ assignedDeliveryPerson: 'Courier Y' })
        .expect(201);
      await request(server)
        .post(`/organizations/${orgAId}/deliveries/${delivery.id}/pickup`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(201);
      await request(server)
        .post(`/organizations/${orgAId}/deliveries/${delivery.id}/in-transit`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(201);

      const failRes = await request(server)
        .post(`/organizations/${orgAId}/deliveries/${delivery.id}/fail`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ failureReason: 'Recipient unreachable after 3 attempts' })
        .expect(201);
      const failed = failRes.body as DeliveryResponseBody;
      expect(failed.status).toBe('failed');
      expect(failed.failureReason).toBe(
        'Recipient unreachable after 3 attempts',
      );
    });

    it('allows PENDING -> CANCELLED with a reason recorded, and rejects further transitions', async () => {
      const delivery = await createProcessedOrderWithDelivery();

      const cancelRes = await request(server)
        .post(`/organizations/${orgAId}/deliveries/${delivery.id}/cancel`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ cancellationReason: 'Customer requested cancellation' })
        .expect(201);
      const cancelled = cancelRes.body as DeliveryResponseBody;
      expect(cancelled.status).toBe('cancelled');
      expect(cancelled.cancellationReason).toBe(
        'Customer requested cancellation',
      );

      await request(server)
        .post(`/organizations/${orgAId}/deliveries/${delivery.id}/assign`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ assignedDeliveryPerson: 'Should Fail' })
        .expect(400);
    });
  });

  describe('RBAC', () => {
    it('allows Viewer to read deliveries', async () => {
      await request(server)
        .get(`/organizations/${orgAId}/deliveries`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(200);
    });

    it('forbids Staff from assigning a delivery', async () => {
      const delivery = await createProcessedOrderWithDelivery();
      await request(server)
        .post(`/organizations/${orgAId}/deliveries/${delivery.id}/assign`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ assignedDeliveryPerson: 'Should Fail' })
        .expect(403);
    });

    it('allows Manager to assign and transition a delivery', async () => {
      const delivery = await createProcessedOrderWithDelivery();
      await request(server)
        .post(`/organizations/${orgAId}/deliveries/${delivery.id}/assign`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ assignedDeliveryPerson: 'Manager Assigned Courier' })
        .expect(201);
      await request(server)
        .post(`/organizations/${orgAId}/deliveries/${delivery.id}/pickup`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(201);
    });

    it('forbids Manager from cancelling a delivery', async () => {
      const delivery = await createProcessedOrderWithDelivery();
      await request(server)
        .post(`/organizations/${orgAId}/deliveries/${delivery.id}/cancel`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ cancellationReason: 'Should fail' })
        .expect(403);
    });

    it('allows Admin to cancel a delivery', async () => {
      const delivery = await createProcessedOrderWithDelivery();
      await request(server)
        .post(`/organizations/${orgAId}/deliveries/${delivery.id}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ cancellationReason: 'Admin cancelled' })
        .expect(201);
    });
  });

  describe('Tenant isolation', () => {
    it("forbids Org B's owner from reading Org A's deliveries", async () => {
      await request(server)
        .get(`/organizations/${orgAId}/deliveries`)
        .set('Authorization', `Bearer ${orgBOwnerToken}`)
        .expect(403);
    });

    it("forbids Org B's owner from reaching a specific Org A delivery by ID", async () => {
      const delivery = await createProcessedOrderWithDelivery();
      await request(server)
        .get(`/organizations/${orgAId}/deliveries/${delivery.id}`)
        .set('Authorization', `Bearer ${orgBOwnerToken}`)
        .expect(403);
    });

    it("forbids Org B's owner from assigning Org A's delivery", async () => {
      const delivery = await createProcessedOrderWithDelivery();
      await request(server)
        .post(`/organizations/${orgAId}/deliveries/${delivery.id}/assign`)
        .set('Authorization', `Bearer ${orgBOwnerToken}`)
        .send({ assignedDeliveryPerson: 'Hostile Assignment' })
        .expect(403);
    });

    it("Org B's own deliveries list is unaffected by Org A's activity", async () => {
      const res = await request(server)
        .get(`/organizations/${orgBId}/deliveries`)
        .set('Authorization', `Bearer ${orgBOwnerToken}`)
        .expect(200);
      const orgBDeliveries = res.body as DeliveryResponseBody[];
      expect(orgBDeliveries).toHaveLength(0);
    });
  });
});
