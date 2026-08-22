import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReceipts1787400000000 implements MigrationInterface {
  name = 'AddReceipts1787400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."receipts_status_enum" AS ENUM('issued', 'voided')`,
    );

    await queryRunner.query(
      `CREATE TABLE "receipt_counters" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "organization_id" uuid NOT NULL, "last_number" integer NOT NULL DEFAULT 0, CONSTRAINT "PK_receipt_counters_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_receipt_counters_org_unique" ON "receipt_counters" ("organization_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "receipt_counters" ADD CONSTRAINT "FK_receipt_counters_organization_id" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE TABLE "receipts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "organization_id" uuid NOT NULL, "payment_id" uuid NOT NULL, "order_id" uuid, "invoice_id" uuid, "customer_id" uuid, "receipt_number" character varying(20) NOT NULL, "amount" bigint NOT NULL, "currency" character varying(3) NOT NULL DEFAULT 'NGN', "payment_date" TIMESTAMP WITH TIME ZONE NOT NULL, "display_name_snapshot" character varying(255) NOT NULL, "accent_color_snapshot" character varying(7) NOT NULL, "status" "public"."receipts_status_enum" NOT NULL DEFAULT 'issued', "issued_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_receipts_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_receipts_organization_id" ON "receipts" ("organization_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_receipts_org_receipt_number" ON "receipts" ("organization_id", "receipt_number")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_receipts_org_payment" ON "receipts" ("organization_id", "payment_id")`,
    );

    await queryRunner.query(
      `ALTER TABLE "receipts" ADD CONSTRAINT "FK_receipts_organization_id" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "receipts" ADD CONSTRAINT "FK_receipts_payment_id" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "receipts" ADD CONSTRAINT "FK_receipts_order_id" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "receipts" ADD CONSTRAINT "FK_receipts_invoice_id" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "receipts" ADD CONSTRAINT "FK_receipts_customer_id" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "receipts" DROP CONSTRAINT "FK_receipts_customer_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "receipts" DROP CONSTRAINT "FK_receipts_invoice_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "receipts" DROP CONSTRAINT "FK_receipts_order_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "receipts" DROP CONSTRAINT "FK_receipts_payment_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "receipts" DROP CONSTRAINT "FK_receipts_organization_id"`,
    );

    await queryRunner.query(`DROP INDEX "public"."IDX_receipts_org_payment"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_receipts_org_receipt_number"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_receipts_organization_id"`,
    );
    await queryRunner.query(`DROP TABLE "receipts"`);
    await queryRunner.query(`DROP TYPE "public"."receipts_status_enum"`);

    await queryRunner.query(
      `ALTER TABLE "receipt_counters" DROP CONSTRAINT "FK_receipt_counters_organization_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_receipt_counters_org_unique"`,
    );
    await queryRunner.query(`DROP TABLE "receipt_counters"`);
  }
}
