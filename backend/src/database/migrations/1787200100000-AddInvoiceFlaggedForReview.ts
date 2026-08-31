import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInvoiceFlaggedForReview1787200100000 implements MigrationInterface {
  name = 'AddInvoiceFlaggedForReview1787200100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "invoices" ADD "flagged_for_review" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "invoices" DROP COLUMN "flagged_for_review"`,
    );
  }
}
