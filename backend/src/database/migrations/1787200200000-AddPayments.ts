import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPayments1787200200000 implements MigrationInterface {
  name = 'AddPayments1787200200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."payments_method_enum" AS ENUM('manual')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."payments_status_enum" AS ENUM('pending', 'success', 'failed')`,
    );

    await queryRunner.query(
      `CREATE TABLE "payments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "organization_id" uuid NOT NULL, "invoice_id" uuid NOT NULL, "amount" bigint NOT NULL, "currency" character varying(3) NOT NULL DEFAULT 'NGN', "method" "public"."payments_method_enum" NOT NULL DEFAULT 'manual', "provider_reference" character varying(255), "status" "public"."payments_status_enum" NOT NULL DEFAULT 'pending', "confirmed_by" uuid, "confirmed_at" TIMESTAMP WITH TIME ZONE, "created_by" uuid NOT NULL, CONSTRAINT "PK_payments_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payments_organization_id" ON "payments" ("organization_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payments_org_invoice" ON "payments" ("organization_id", "invoice_id")`,
    );

    await queryRunner.query(
      `ALTER TABLE "payments" ADD CONSTRAINT "FK_payments_organization_id" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ADD CONSTRAINT "FK_payments_invoice_id" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ADD CONSTRAINT "FK_payments_confirmed_by" FOREIGN KEY ("confirmed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ADD CONSTRAINT "FK_payments_created_by" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payments" DROP CONSTRAINT "FK_payments_created_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" DROP CONSTRAINT "FK_payments_confirmed_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" DROP CONSTRAINT "FK_payments_invoice_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" DROP CONSTRAINT "FK_payments_organization_id"`,
    );

    await queryRunner.query(`DROP INDEX "public"."IDX_payments_org_invoice"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_payments_organization_id"`,
    );
    await queryRunner.query(`DROP TABLE "payments"`);

    await queryRunner.query(`DROP TYPE "public"."payments_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."payments_method_enum"`);
  }
}
