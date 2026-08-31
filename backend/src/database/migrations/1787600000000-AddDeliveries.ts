import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDeliveries1787600000000 implements MigrationInterface {
  name = 'AddDeliveries1787600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."deliveries_status_enum" AS ENUM('pending', 'assigned', 'picked_up', 'in_transit', 'delivered', 'failed', 'cancelled')`,
    );

    await queryRunner.query(
      `CREATE TABLE "deliveries" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "organization_id" uuid NOT NULL, "order_id" uuid NOT NULL, "customer_id" uuid NOT NULL, "status" "public"."deliveries_status_enum" NOT NULL DEFAULT 'pending', "delivery_address_line1" character varying(255) NOT NULL, "delivery_address_line2" character varying(255), "delivery_address_city" character varying(100) NOT NULL, "delivery_address_state" character varying(100), "delivery_address_postal_code" character varying(20), "delivery_address_country" character varying(100) NOT NULL, "tracking_reference" character varying(255), "assigned_delivery_person" character varying(255), "pickup_at" TIMESTAMP WITH TIME ZONE, "delivered_at" TIMESTAMP WITH TIME ZONE, "failure_reason" text, "cancellation_reason" text, CONSTRAINT "PK_deliveries_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_deliveries_organization_id" ON "deliveries" ("organization_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_deliveries_org_order" ON "deliveries" ("organization_id", "order_id")`,
    );

    await queryRunner.query(
      `ALTER TABLE "deliveries" ADD CONSTRAINT "FK_deliveries_organization_id" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "deliveries" ADD CONSTRAINT "FK_deliveries_order_id" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "deliveries" ADD CONSTRAINT "FK_deliveries_customer_id" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "deliveries" DROP CONSTRAINT "FK_deliveries_customer_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "deliveries" DROP CONSTRAINT "FK_deliveries_order_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "deliveries" DROP CONSTRAINT "FK_deliveries_organization_id"`,
    );

    await queryRunner.query(`DROP INDEX "public"."IDX_deliveries_org_order"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_deliveries_organization_id"`,
    );
    await queryRunner.query(`DROP TABLE "deliveries"`);
    await queryRunner.query(`DROP TYPE "public"."deliveries_status_enum"`);
  }
}
