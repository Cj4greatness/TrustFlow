import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReceiptSettings1787300000000 implements MigrationInterface {
  name = 'AddReceiptSettings1787300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "receipt_settings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "organization_id" uuid NOT NULL, "display_name" character varying(255) NOT NULL, "accent_color" character varying(7) NOT NULL, CONSTRAINT "PK_receipt_settings_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_receipt_settings_org_unique" ON "receipt_settings" ("organization_id") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "receipt_settings" ADD CONSTRAINT "FK_receipt_settings_organization_id" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "receipt_settings" DROP CONSTRAINT "FK_receipt_settings_organization_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_receipt_settings_org_unique"`,
    );
    await queryRunner.query(`DROP TABLE "receipt_settings"`);
  }
}
