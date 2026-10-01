import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSessionDisplacementColumns1790889307573 implements MigrationInterface {
  name = 'AddSessionDisplacementColumns1790889307573';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN "displaced_refresh_token_hash" varchar NULL,
      ADD COLUMN "displaced_at" timestamptz NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN "displaced_refresh_token_hash",
      DROP COLUMN "displaced_at"
    `);
  }
}
