import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCustomers1786227392936 implements MigrationInterface {
  name = 'AddCustomers1786227392936';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."customers_customer_type_enum" AS ENUM('individual', 'business')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."customers_status_enum" AS ENUM('lead', 'active', 'inactive', 'archived')`,
    );
    await queryRunner.query(
      `CREATE TABLE "customers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "organization_id" uuid NOT NULL, "customer_type" "public"."customers_customer_type_enum" NOT NULL, "display_name" character varying(255) NOT NULL, "first_name" character varying(255), "last_name" character varying(255), "company_name" character varying(255), "email" character varying(255), "phone" character varying(50), "status" "public"."customers_status_enum" NOT NULL DEFAULT 'lead', "source" character varying(100), "created_by" uuid NOT NULL, CONSTRAINT "PK_133ec679a801fab5e070f73d3ea" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_b3cfe093db953971fc323f5a43" ON "customers"  ("organization_id", "email") WHERE "email" IS NOT NULL AND "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d2fc0e42b07d01fafc3fbb2bee" ON "customers"  ("organization_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."customer_addresses_type_enum" AS ENUM('billing', 'shipping', 'other')`,
    );
    await queryRunner.query(
      `CREATE TABLE "customer_addresses" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "customer_id" uuid NOT NULL, "organization_id" uuid NOT NULL, "type" "public"."customer_addresses_type_enum" NOT NULL DEFAULT 'other', "line1" character varying(255) NOT NULL, "line2" character varying(255), "city" character varying(100) NOT NULL, "state" character varying(100), "postal_code" character varying(20), "country" character varying(100) NOT NULL, "is_default" boolean NOT NULL DEFAULT false, CONSTRAINT "PK_336bda7b0a0cd04241f719fc834" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_6be4e1a698f5c3f2c2e4c75c18" ON "customer_addresses"  ("customer_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_6de213aa6d839a973311d50167" ON "customer_addresses"  ("organization_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "customer_notes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "customer_id" uuid NOT NULL, "organization_id" uuid NOT NULL, "author_id" uuid NOT NULL, "body" text NOT NULL, CONSTRAINT "PK_8a41bce1fe0094bd7a9c5266cc8" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b77784184daa7589018ac4e840" ON "customer_notes"  ("customer_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_39a24f2c7d43d57ff5db923df8" ON "customer_notes"  ("organization_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "customers" ADD CONSTRAINT "FK_d2fc0e42b07d01fafc3fbb2bee3" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "customer_addresses" ADD CONSTRAINT "FK_6be4e1a698f5c3f2c2e4c75c186" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "customer_notes" ADD CONSTRAINT "FK_b77784184daa7589018ac4e8402" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "customer_notes" ADD CONSTRAINT "FK_47c55f85a0e85d5c3d00e34552e" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "customer_notes" DROP CONSTRAINT "FK_47c55f85a0e85d5c3d00e34552e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "customer_notes" DROP CONSTRAINT "FK_b77784184daa7589018ac4e8402"`,
    );
    await queryRunner.query(
      `ALTER TABLE "customer_addresses" DROP CONSTRAINT "FK_6be4e1a698f5c3f2c2e4c75c186"`,
    );
    await queryRunner.query(
      `ALTER TABLE "customers" DROP CONSTRAINT "FK_d2fc0e42b07d01fafc3fbb2bee3"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_39a24f2c7d43d57ff5db923df8"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_b77784184daa7589018ac4e840"`,
    );
    await queryRunner.query(`DROP TABLE "customer_notes"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_6de213aa6d839a973311d50167"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_6be4e1a698f5c3f2c2e4c75c18"`,
    );
    await queryRunner.query(`DROP TABLE "customer_addresses"`);
    await queryRunner.query(
      `DROP TYPE "public"."customer_addresses_type_enum"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_d2fc0e42b07d01fafc3fbb2bee"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_b3cfe093db953971fc323f5a43"`,
    );
    await queryRunner.query(`DROP TABLE "customers"`);
    await queryRunner.query(`DROP TYPE "public"."customers_status_enum"`);
    await queryRunner.query(
      `DROP TYPE "public"."customers_customer_type_enum"`,
    );
  }
}
