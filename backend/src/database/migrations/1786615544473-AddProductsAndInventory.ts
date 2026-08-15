import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductsAndInventory1786615544473 implements MigrationInterface {
  name = 'AddProductsAndInventory1786615544473';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."products_status_enum" AS ENUM('active', 'archived')`,
    );
    await queryRunner.query(
      `CREATE TABLE "products" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "organization_id" uuid NOT NULL, "name" character varying(255) NOT NULL, "description" text, "sku" character varying(100) NOT NULL, "category" character varying(100), "unit" character varying(50), "selling_price" numeric(12,2) NOT NULL, "cost_price" numeric(12,2), "status" "public"."products_status_enum" NOT NULL DEFAULT 'active', "created_by" uuid NOT NULL, CONSTRAINT "PK_0806c755e0aca124e67c0cf6d7d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_af2de3c748623d6c8ba9c22625" ON "products"  ("organization_id", "sku") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_2d404aa7aa4a0404eafd184091" ON "products"  ("organization_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "inventories" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "organization_id" uuid NOT NULL, "product_id" uuid NOT NULL, "quantity" integer NOT NULL DEFAULT '0', "low_stock_threshold" integer, CONSTRAINT "REL_92fc0c77bab4a656b9619322c6" UNIQUE ("product_id"), CONSTRAINT "PK_7b1946392ffdcb50cfc6ac78c0e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_92fc0c77bab4a656b9619322c6" ON "inventories"  ("product_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9662abc41c8b7a1386f69614d2" ON "inventories"  ("organization_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."inventory_movements_type_enum" AS ENUM('add', 'remove')`,
    );
    await queryRunner.query(
      `CREATE TABLE "inventory_movements" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "organization_id" uuid NOT NULL, "inventory_id" uuid NOT NULL, "type" "public"."inventory_movements_type_enum" NOT NULL, "quantity" integer NOT NULL, "reason" character varying(500) NOT NULL, "created_by" uuid NOT NULL, CONSTRAINT "PK_d7597827c1dcffae889db3ab873" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_7c5f8fa417b520f26f911c3c6b" ON "inventory_movements"  ("inventory_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_6359abd2ae30de509501923763" ON "inventory_movements"  ("organization_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ADD CONSTRAINT "FK_2d404aa7aa4a0404eafd1840915" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ADD CONSTRAINT "FK_c1af9b47239151e255f62e03247" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventories" ADD CONSTRAINT "FK_9662abc41c8b7a1386f69614d26" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventories" ADD CONSTRAINT "FK_92fc0c77bab4a656b9619322c62" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventory_movements" ADD CONSTRAINT "FK_7c5f8fa417b520f26f911c3c6b5" FOREIGN KEY ("inventory_id") REFERENCES "inventories"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventory_movements" ADD CONSTRAINT "FK_4a137ccc372acb73821c4dd3991" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "inventory_movements" DROP CONSTRAINT "FK_4a137ccc372acb73821c4dd3991"`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventory_movements" DROP CONSTRAINT "FK_7c5f8fa417b520f26f911c3c6b5"`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventories" DROP CONSTRAINT "FK_92fc0c77bab4a656b9619322c62"`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventories" DROP CONSTRAINT "FK_9662abc41c8b7a1386f69614d26"`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" DROP CONSTRAINT "FK_c1af9b47239151e255f62e03247"`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" DROP CONSTRAINT "FK_2d404aa7aa4a0404eafd1840915"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_6359abd2ae30de509501923763"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_7c5f8fa417b520f26f911c3c6b"`,
    );
    await queryRunner.query(`DROP TABLE "inventory_movements"`);
    await queryRunner.query(
      `DROP TYPE "public"."inventory_movements_type_enum"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_9662abc41c8b7a1386f69614d2"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_92fc0c77bab4a656b9619322c6"`,
    );
    await queryRunner.query(`DROP TABLE "inventories"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_2d404aa7aa4a0404eafd184091"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_af2de3c748623d6c8ba9c22625"`,
    );
    await queryRunner.query(`DROP TABLE "products"`);
    await queryRunner.query(`DROP TYPE "public"."products_status_enum"`);
  }
}
