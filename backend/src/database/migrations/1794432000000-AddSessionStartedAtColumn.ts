import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSessionStartedAtColumn1794432000000 implements MigrationInterface {
  name = 'AddSessionStartedAtColumn1794432000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN "session_started_at" timestamptz NULL
    `);
    await queryRunner.query(`
      UPDATE "users"
      SET "session_started_at" = COALESCE("last_login", "created_at")
      WHERE "refresh_token_hash" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Dropping this column discards session-start data that cannot be recovered.
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN "session_started_at"
    `);
  }
}
