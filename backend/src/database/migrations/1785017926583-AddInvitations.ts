import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInvitations1785017926583 implements MigrationInterface {
  name = 'AddInvitations1785017926583';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."invitations_role_enum" AS ENUM('owner', 'admin', 'manager', 'staff')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."invitations_channel_enum" AS ENUM('email', 'whatsapp', 'sms', 'link')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."invitations_status_enum" AS ENUM('pending', 'accepted', 'expired', 'revoked')`,
    );
    await queryRunner.query(
      `CREATE TABLE "invitations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "organization_id" uuid NOT NULL, "invited_email" character varying(255) NOT NULL, "role" "public"."invitations_role_enum" NOT NULL DEFAULT 'staff', "token" uuid NOT NULL, "channel" "public"."invitations_channel_enum" NOT NULL DEFAULT 'email', "status" "public"."invitations_status_enum" NOT NULL DEFAULT 'pending', "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "invited_by" uuid NOT NULL, "accepted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_e577dcf9bb6d084373ed3998509" UNIQUE ("token"), CONSTRAINT "PK_5dec98cfdfd562e4ad3648bbb07" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_abe12038e3ef696cdfea465ff8" ON "invitations"  ("invited_email") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_42d1dbb4d85dc3643fdc6560af" ON "invitations"  ("organization_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_e577dcf9bb6d084373ed399850" ON "invitations"  ("token") `,
    );
    await queryRunner.query(
      `ALTER TABLE "invitations" ADD CONSTRAINT "FK_42d1dbb4d85dc3643fdc6560af0" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "invitations" ADD CONSTRAINT "FK_29b1cef6891d9b9d4e35f793b81" FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "invitations" DROP CONSTRAINT "FK_29b1cef6891d9b9d4e35f793b81"`,
    );
    await queryRunner.query(
      `ALTER TABLE "invitations" DROP CONSTRAINT "FK_42d1dbb4d85dc3643fdc6560af0"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_e577dcf9bb6d084373ed399850"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_42d1dbb4d85dc3643fdc6560af"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_abe12038e3ef696cdfea465ff8"`,
    );
    await queryRunner.query(`DROP TABLE "invitations"`);
    await queryRunner.query(`DROP TYPE "public"."invitations_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."invitations_channel_enum"`);
    await queryRunner.query(`DROP TYPE "public"."invitations_role_enum"`);
  }
}
