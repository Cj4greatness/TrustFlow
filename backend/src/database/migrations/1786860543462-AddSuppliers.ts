import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSuppliers1786860543462 implements MigrationInterface {
  name = 'AddSuppliers1786860543462';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."suppliers_status_enum" AS ENUM('active', 'archived')`,
    );
    await queryRunner.query(
      `CREATE TABLE "suppliers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "organization_id" uuid NOT NULL, "name" character varying(255) NOT NULL, "contact_name" character varying(255), "email" character varying(255), "phone" character varying(50), "address" text, "notes" text, "status" "public"."suppliers_status_enum" NOT NULL DEFAULT 'active', "created_by" uuid NOT NULL, CONSTRAINT "PK_b70ac51766a9e3144f778cfe81e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_3e9f69576d3622550efafbd6e4" ON "suppliers"  ("organization_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "supplier_products" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "organization_id" uuid NOT NULL, "supplier_id" uuid NOT NULL, "product_id" uuid NOT NULL, "supplier_sku" character varying(100), "unit_cost" numeric(12,2), "lead_time_days" integer, "minimum_order_quantity" integer, CONSTRAINT "PK_651e91706e362ef7393457c347e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_2c9670900abd9f75cc5e8d0f2a" ON "supplier_products"  ("organization_id", "supplier_id", "product_id") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9ff2b133160a708a047cbce49d" ON "supplier_products"  ("product_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_4286173e1486a5c528f89dc798" ON "supplier_products"  ("supplier_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_495579e22f41ebc733f247f1c5" ON "supplier_products"  ("organization_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "suppliers" ADD CONSTRAINT "FK_3e9f69576d3622550efafbd6e4b" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "suppliers" ADD CONSTRAINT "FK_4be40fae84ce82ed3baef4a49fa" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "supplier_products" ADD CONSTRAINT "FK_495579e22f41ebc733f247f1c59" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "supplier_products" ADD CONSTRAINT "FK_4286173e1486a5c528f89dc798c" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "supplier_products" ADD CONSTRAINT "FK_9ff2b133160a708a047cbce49d2" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "supplier_products" DROP CONSTRAINT "FK_9ff2b133160a708a047cbce49d2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "supplier_products" DROP CONSTRAINT "FK_4286173e1486a5c528f89dc798c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "supplier_products" DROP CONSTRAINT "FK_495579e22f41ebc733f247f1c59"`,
    );
    await queryRunner.query(
      `ALTER TABLE "suppliers" DROP CONSTRAINT "FK_4be40fae84ce82ed3baef4a49fa"`,
    );
    await queryRunner.query(
      `ALTER TABLE "suppliers" DROP CONSTRAINT "FK_3e9f69576d3622550efafbd6e4b"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_495579e22f41ebc733f247f1c5"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_4286173e1486a5c528f89dc798"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_9ff2b133160a708a047cbce49d"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_2c9670900abd9f75cc5e8d0f2a"`,
    );
    await queryRunner.query(`DROP TABLE "supplier_products"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_3e9f69576d3622550efafbd6e4"`,
    );
    await queryRunner.query(`DROP TABLE "suppliers"`);
    await queryRunner.query(`DROP TYPE "public"."suppliers_status_enum"`);
  }
}
