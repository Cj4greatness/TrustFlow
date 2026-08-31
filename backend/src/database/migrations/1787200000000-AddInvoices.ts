import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInvoices1787200000000 implements MigrationInterface {
  name = 'AddInvoices1787200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."invoices_status_enum" AS ENUM('draft', 'approved', 'issued', 'partially_paid', 'paid')`,
    );

    await queryRunner.query(
      `CREATE TABLE "invoices" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "organization_id" uuid NOT NULL, "order_id" uuid NOT NULL, "customer_id" uuid NOT NULL, "invoice_number" character varying(20) NOT NULL, "status" "public"."invoices_status_enum" NOT NULL DEFAULT 'draft', "issue_date" TIMESTAMP WITH TIME ZONE, "due_date" TIMESTAMP WITH TIME ZONE, "subtotal" bigint NOT NULL DEFAULT 0, "discount_amount" bigint NOT NULL DEFAULT 0, "tax_amount" bigint NOT NULL DEFAULT 0, "total" bigint NOT NULL DEFAULT 0, "amount_paid" bigint NOT NULL DEFAULT 0, "amount_due" bigint NOT NULL DEFAULT 0, "currency" character varying(3) NOT NULL DEFAULT 'NGN', "notes" text, "created_by" uuid NOT NULL, CONSTRAINT "PK_invoices_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_invoices_organization_id" ON "invoices" ("organization_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_invoices_org_invoice_number" ON "invoices" ("organization_id", "invoice_number")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_invoices_org_order" ON "invoices" ("organization_id", "order_id")`,
    );

    await queryRunner.query(
      `CREATE TABLE "invoice_line_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "organization_id" uuid NOT NULL, "invoice_id" uuid NOT NULL, "product_id" uuid, "description" character varying(255) NOT NULL, "quantity" integer NOT NULL, "unit_price" bigint NOT NULL DEFAULT 0, "line_total" bigint NOT NULL DEFAULT 0, CONSTRAINT "PK_invoice_line_items_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_invoice_line_items_organization_id" ON "invoice_line_items" ("organization_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_invoice_line_items_invoice_id" ON "invoice_line_items" ("invoice_id")`,
    );

    await queryRunner.query(
      `CREATE TABLE "invoice_counters" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "organization_id" uuid NOT NULL, "year" integer NOT NULL, "last_number" integer NOT NULL DEFAULT 0, CONSTRAINT "PK_invoice_counters_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_invoice_counters_org_year" ON "invoice_counters" ("organization_id", "year")`,
    );

    await queryRunner.query(
      `ALTER TABLE "invoices" ADD CONSTRAINT "FK_invoices_organization_id" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoices" ADD CONSTRAINT "FK_invoices_order_id" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoices" ADD CONSTRAINT "FK_invoices_customer_id" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoices" ADD CONSTRAINT "FK_invoices_created_by" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `ALTER TABLE "invoice_line_items" ADD CONSTRAINT "FK_invoice_line_items_organization_id" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoice_line_items" ADD CONSTRAINT "FK_invoice_line_items_invoice_id" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoice_line_items" ADD CONSTRAINT "FK_invoice_line_items_product_id" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `ALTER TABLE "invoice_counters" ADD CONSTRAINT "FK_invoice_counters_organization_id" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "invoice_counters" DROP CONSTRAINT "FK_invoice_counters_organization_id"`,
    );

    await queryRunner.query(
      `ALTER TABLE "invoice_line_items" DROP CONSTRAINT "FK_invoice_line_items_product_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoice_line_items" DROP CONSTRAINT "FK_invoice_line_items_invoice_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoice_line_items" DROP CONSTRAINT "FK_invoice_line_items_organization_id"`,
    );

    await queryRunner.query(
      `ALTER TABLE "invoices" DROP CONSTRAINT "FK_invoices_created_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoices" DROP CONSTRAINT "FK_invoices_customer_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoices" DROP CONSTRAINT "FK_invoices_order_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoices" DROP CONSTRAINT "FK_invoices_organization_id"`,
    );

    await queryRunner.query(
      `DROP INDEX "public"."IDX_invoice_counters_org_year"`,
    );
    await queryRunner.query(`DROP TABLE "invoice_counters"`);

    await queryRunner.query(
      `DROP INDEX "public"."IDX_invoice_line_items_invoice_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_invoice_line_items_organization_id"`,
    );
    await queryRunner.query(`DROP TABLE "invoice_line_items"`);

    await queryRunner.query(`DROP INDEX "public"."IDX_invoices_org_order"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_invoices_org_invoice_number"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_invoices_organization_id"`,
    );
    await queryRunner.query(`DROP TABLE "invoices"`);
    await queryRunner.query(`DROP TYPE "public"."invoices_status_enum"`);
  }
}
