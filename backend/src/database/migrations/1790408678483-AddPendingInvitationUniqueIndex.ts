import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPendingInvitationUniqueIndex1790408678483 implements MigrationInterface {
  name = 'AddPendingInvitationUniqueIndex1790408678483';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_65f97fd1bc175fdf8c60d4e276" ON "invitations" ("organization_id", "invited_email") WHERE "status" = 'pending'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_65f97fd1bc175fdf8c60d4e276"`,
    );
  }
}
