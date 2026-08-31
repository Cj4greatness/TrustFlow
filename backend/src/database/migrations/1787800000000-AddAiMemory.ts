import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAiMemory1787800000000 implements MigrationInterface {
  name = 'AddAiMemory1787800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "ai_memory" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "organization_id" uuid NOT NULL, "user_id" uuid NOT NULL, "key" character varying(256) NOT NULL, "content" text NOT NULL, "metadata" jsonb, CONSTRAINT "UQ_ai_memory_org_user_key" UNIQUE ("organization_id", "user_id", "key"), CONSTRAINT "PK_ai_memory_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ai_memory_organization_id" ON "ai_memory" ("organization_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ai_memory_user_id" ON "ai_memory" ("user_id")`,
    );

    await queryRunner.query(
      `ALTER TABLE "ai_memory" ADD CONSTRAINT "FK_ai_memory_organization_id" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ai_memory" DROP CONSTRAINT "FK_ai_memory_organization_id"`,
    );

    await queryRunner.query(`DROP INDEX "public"."IDX_ai_memory_user_id"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ai_memory_organization_id"`,
    );
    await queryRunner.query(`DROP TABLE "ai_memory"`);
  }
}
