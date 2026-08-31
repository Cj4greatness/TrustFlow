import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCustomerCreatedByFk1786391499403 implements MigrationInterface {
  name = 'AddCustomerCreatedByFk1786391499403';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "customers" ADD CONSTRAINT "FK_8f138f284609b045dc64c91757a" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "customers" DROP CONSTRAINT "FK_8f138f284609b045dc64c91757a"`,
    );
  }
}
