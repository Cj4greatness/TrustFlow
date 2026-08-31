import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRefreshTokenHashToUsers1784839819506 implements MigrationInterface {
  name = 'AddRefreshTokenHashToUsers1784839819506';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "refresh_token_hash" character varying(255)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "refresh_token_hash"`,
    );
  }
}
