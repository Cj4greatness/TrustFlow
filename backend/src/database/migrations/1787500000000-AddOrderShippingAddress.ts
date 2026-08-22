import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrderShippingAddress1787500000000 implements MigrationInterface {
  name = 'AddOrderShippingAddress1787500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" ADD "shipping_address_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "FK_orders_shipping_address_id" FOREIGN KEY ("shipping_address_id") REFERENCES "customer_addresses"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT "FK_orders_shipping_address_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP COLUMN "shipping_address_id"`,
    );
  }
}
