import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRefreshTokenRotationColumns1790783603814 implements MigrationInterface {
  name = 'AddRefreshTokenRotationColumns1790783603814';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN "previous_refresh_token_hash" varchar NULL,
      ADD COLUMN "refresh_token_rotated_at" timestamptz NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN "previous_refresh_token_hash",
      DROP COLUMN "refresh_token_rotated_at"
    `);
  }
}
