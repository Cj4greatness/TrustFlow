import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentIdempotencyKey1787200300000 implements MigrationInterface {
  name = 'AddPaymentIdempotencyKey1787200300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payments" ADD "idempotency_key" character varying(255)`,
    );
    // Backfill any pre-existing rows (none expected in dev, but this
    // keeps the NOT NULL step safe if any exist) before enforcing NOT NULL.
    await queryRunner.query(
      `UPDATE "payments" SET "idempotency_key" = "id"::text WHERE "idempotency_key" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ALTER COLUMN "idempotency_key" SET NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_payments_org_idempotency_key" ON "payments" ("organization_id", "idempotency_key")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_payments_org_idempotency_key"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" DROP COLUMN "idempotency_key"`,
    );
  }
}
