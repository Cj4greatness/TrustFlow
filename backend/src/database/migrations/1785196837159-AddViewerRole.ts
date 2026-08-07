import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddViewerRole1785196837159 implements MigrationInterface {
  name = 'AddViewerRole1785196837159';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."organization_members_role_enum" ADD VALUE 'viewer'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."invitations_role_enum" ADD VALUE 'viewer'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."invitations_role_enum_old" AS ENUM('owner', 'admin', 'manager', 'staff')`,
    );
    await queryRunner.query(
      `ALTER TABLE "invitations" ALTER COLUMN "role" TYPE "public"."invitations_role_enum_old" USING "role"::"text"::"public"."invitations_role_enum_old"`,
    );
    await queryRunner.query(`DROP TYPE "public"."invitations_role_enum"`);
    await queryRunner.query(
      `ALTER TYPE "public"."invitations_role_enum_old" RENAME TO "invitations_role_enum"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."organization_members_role_enum_old" AS ENUM('owner', 'admin', 'manager', 'staff')`,
    );
    await queryRunner.query(
      `ALTER TABLE "organization_members" ALTER COLUMN "role" TYPE "public"."organization_members_role_enum_old" USING "role"::"text"::"public"."organization_members_role_enum_old"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."organization_members_role_enum"`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."organization_members_role_enum_old" RENAME TO "organization_members_role_enum"`,
    );
  }
}
