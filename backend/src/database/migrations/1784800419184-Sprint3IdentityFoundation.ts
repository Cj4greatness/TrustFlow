import { MigrationInterface, QueryRunner } from 'typeorm';

export class Sprint3IdentityFoundation1784800419184 implements MigrationInterface {
  name = 'Sprint3IdentityFoundation1784800419184';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."users_status_enum" AS ENUM('active', 'invited', 'suspended', 'deactivated')`,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "first_name" character varying(100) NOT NULL, "last_name" character varying(100) NOT NULL, "email" character varying(255) NOT NULL, "password_hash" character varying(255) NOT NULL, "phone" character varying(30), "avatar" character varying(500), "status" "public"."users_status_enum" NOT NULL DEFAULT 'active', "email_verified" boolean NOT NULL DEFAULT false, "last_login" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_97672ac88f789774dd47f7c8be" ON "users"  ("email") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."organizations_subscription_plan_enum" AS ENUM('trial', 'starter', 'growth', 'enterprise')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."organizations_status_enum" AS ENUM('active', 'suspended', 'pending_setup', 'cancelled')`,
    );
    await queryRunner.query(
      `CREATE TABLE "organizations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "name" character varying(255) NOT NULL, "slug" character varying(255) NOT NULL, "industry" character varying(255), "country" character varying(255), "timezone" character varying(100), "currency" character varying(10) NOT NULL DEFAULT 'NGN', "logo" character varying(500), "subscription_plan" "public"."organizations_subscription_plan_enum" NOT NULL DEFAULT 'trial', "status" "public"."organizations_status_enum" NOT NULL DEFAULT 'pending_setup', CONSTRAINT "UQ_963693341bd612aa01ddf3a4b68" UNIQUE ("slug"), CONSTRAINT "PK_6b031fcd0863e3f6b44230163f9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_963693341bd612aa01ddf3a4b6" ON "organizations"  ("slug") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."audit_logs_action_enum" AS ENUM('user.login', 'user.logout', 'user.registered', 'organization.created', 'role.changed', 'password.reset', 'invitation.sent', 'invitation.accepted')`,
    );
    await queryRunner.query(
      `CREATE TABLE "audit_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid, "organization_id" uuid, "action" "public"."audit_logs_action_enum" NOT NULL, "ip_address" character varying(45), "user_agent" character varying(500), "metadata" jsonb, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_1bb179d048bbc581caa3b013439" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cee5459245f652b75eb2759b4c" ON "audit_logs"  ("action") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_145f35b204c731ba7fc1a0be0e" ON "audit_logs"  ("organization_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_bd2726fd31b35443f2245b93ba" ON "audit_logs"  ("user_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."organization_members_role_enum" AS ENUM('owner', 'admin', 'manager', 'staff')`,
    );
    await queryRunner.query(
      `CREATE TABLE "organization_members" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "organization_id" uuid NOT NULL, "user_id" uuid NOT NULL, "role" "public"."organization_members_role_enum" NOT NULL DEFAULT 'staff', "joined_at" TIMESTAMP WITH TIME ZONE NOT NULL, "invited_by" uuid, CONSTRAINT "PK_c2b39d5d072886a4d9c8105eb9a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_f4812f00736e35131a65d6032d" ON "organization_members"  ("organization_id", "user_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD CONSTRAINT "FK_bd2726fd31b35443f2245b93ba0" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD CONSTRAINT "FK_145f35b204c731ba7fc1a0be0e7" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "organization_members" ADD CONSTRAINT "FK_7062a4fbd9bab22ffd918e5d3d9" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "organization_members" ADD CONSTRAINT "FK_89bde91f78d36ca41e9515d91c6" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "organization_members" DROP CONSTRAINT "FK_89bde91f78d36ca41e9515d91c6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organization_members" DROP CONSTRAINT "FK_7062a4fbd9bab22ffd918e5d3d9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" DROP CONSTRAINT "FK_145f35b204c731ba7fc1a0be0e7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" DROP CONSTRAINT "FK_bd2726fd31b35443f2245b93ba0"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f4812f00736e35131a65d6032d"`,
    );
    await queryRunner.query(`DROP TABLE "organization_members"`);
    await queryRunner.query(
      `DROP TYPE "public"."organization_members_role_enum"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_bd2726fd31b35443f2245b93ba"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_145f35b204c731ba7fc1a0be0e"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_cee5459245f652b75eb2759b4c"`,
    );
    await queryRunner.query(`DROP TABLE "audit_logs"`);
    await queryRunner.query(`DROP TYPE "public"."audit_logs_action_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_963693341bd612aa01ddf3a4b6"`,
    );
    await queryRunner.query(`DROP TABLE "organizations"`);
    await queryRunner.query(`DROP TYPE "public"."organizations_status_enum"`);
    await queryRunner.query(
      `DROP TYPE "public"."organizations_subscription_plan_enum"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_97672ac88f789774dd47f7c8be"`,
    );
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "public"."users_status_enum"`);
  }
}
