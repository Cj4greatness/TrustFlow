import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrders1786899920239 implements MigrationInterface {
  name = 'AddOrders1786899920239';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "order_counters" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "organization_id" uuid NOT NULL, "last_number" integer NOT NULL DEFAULT '0', CONSTRAINT "UQ_4e34fba47c0377f90df49f76f88" UNIQUE ("organization_id"), CONSTRAINT "REL_4e34fba47c0377f90df49f76f8" UNIQUE ("organization_id"), CONSTRAINT "PK_beaa7d64a513faaad56a84f2980" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."orders_status_enum" AS ENUM('draft', 'confirmed', 'processing', 'completed', 'cancelled')`,
    );
    await queryRunner.query(
      `CREATE TABLE "orders" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "organization_id" uuid NOT NULL, "customer_id" uuid NOT NULL, "order_number" character varying(20) NOT NULL, "status" "public"."orders_status_enum" NOT NULL DEFAULT 'draft', "subtotal" numeric(12,2) NOT NULL DEFAULT '0', "discount" numeric(12,2) NOT NULL DEFAULT '0', "total" numeric(12,2) NOT NULL DEFAULT '0', "notes" text, "created_by" uuid NOT NULL, CONSTRAINT "PK_710e2d4957aa5878dfe94e4ac2f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_84d25fd67d9618d36231818239" ON "orders"  ("organization_id", "order_number") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_3b13df1eb3b062fd5ed4ebc53b" ON "orders"  ("organization_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "order_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "organization_id" uuid NOT NULL, "order_id" uuid NOT NULL, "product_id" uuid NOT NULL, "product_name" character varying(255) NOT NULL, "sku" character varying(100) NOT NULL, "unit_price" numeric(12,2) NOT NULL, "quantity" integer NOT NULL, "subtotal" numeric(12,2) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_005269d8574e6fac0493715c308" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_145532db85752b29c57d2b7b1f" ON "order_items"  ("order_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_802a16c8fc5876b4ffc1cfc11e" ON "order_items"  ("organization_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "order_counters" ADD CONSTRAINT "FK_4e34fba47c0377f90df49f76f88" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "FK_3b13df1eb3b062fd5ed4ebc53bf" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "FK_772d0ce0473ac2ccfa26060dbe9" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "FK_574a2f0932043d4e4baf188ee05" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" ADD CONSTRAINT "FK_145532db85752b29c57d2b7b1f1" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" ADD CONSTRAINT "FK_9263386c35b6b242540f9493b00" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "order_items" DROP CONSTRAINT "FK_9263386c35b6b242540f9493b00"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" DROP CONSTRAINT "FK_145532db85752b29c57d2b7b1f1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT "FK_574a2f0932043d4e4baf188ee05"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT "FK_772d0ce0473ac2ccfa26060dbe9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT "FK_3b13df1eb3b062fd5ed4ebc53bf"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_counters" DROP CONSTRAINT "FK_4e34fba47c0377f90df49f76f88"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_802a16c8fc5876b4ffc1cfc11e"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_145532db85752b29c57d2b7b1f"`,
    );
    await queryRunner.query(`DROP TABLE "order_items"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_3b13df1eb3b062fd5ed4ebc53b"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_84d25fd67d9618d36231818239"`,
    );
    await queryRunner.query(`DROP TABLE "orders"`);
    await queryRunner.query(`DROP TYPE "public"."orders_status_enum"`);
    await queryRunner.query(`DROP TABLE "order_counters"`);
  }
}
