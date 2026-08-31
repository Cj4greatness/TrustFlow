import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAiUsage1787700000000 implements MigrationInterface {
  name = 'AddAiUsage1787700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."ai_usage_status_enum" AS ENUM('success', 'failure')`,
    );

    await queryRunner.query(
      `CREATE TABLE "ai_usage" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "organization_id" uuid NOT NULL, "user_id" uuid NOT NULL, "provider" character varying(64) NOT NULL, "model" character varying(128) NOT NULL, "request_id" uuid NOT NULL, "input_tokens" integer NOT NULL DEFAULT 0, "output_tokens" integer NOT NULL DEFAULT 0, "total_tokens" integer NOT NULL DEFAULT 0, "estimated_cost_cents" integer, "latency_ms" integer NOT NULL, "status" "public"."ai_usage_status_enum" NOT NULL, "error_category" character varying(64), CONSTRAINT "PK_ai_usage_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ai_usage_organization_id" ON "ai_usage" ("organization_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ai_usage_user_id" ON "ai_usage" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ai_usage_request_id" ON "ai_usage" ("request_id")`,
    );

    await queryRunner.query(
      `ALTER TABLE "ai_usage" ADD CONSTRAINT "FK_ai_usage_organization_id" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ai_usage" DROP CONSTRAINT "FK_ai_usage_organization_id"`,
    );

    await queryRunner.query(`DROP INDEX "public"."IDX_ai_usage_request_id"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ai_usage_user_id"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ai_usage_organization_id"`,
    );
    await queryRunner.query(`DROP TABLE "ai_usage"`);
    await queryRunner.query(`DROP TYPE "public"."ai_usage_status_enum"`);
  }
}
