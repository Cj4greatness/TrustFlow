import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ReceiptsService } from '../src/receipts/receipts.service';

function parseArgs(argv: string[]) {
  const execute = argv.includes('--execute');
  const limitArg = argv.find((arg) => arg.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.slice('--limit='.length)) : 100;
  const organizationArg = argv.find((arg) =>
    arg.startsWith('--organizationId='),
  );
  return {
    execute,
    limit: Number.isInteger(limit) && limit > 0 ? limit : 100,
    organizationId: organizationArg
      ? organizationArg.slice('--organizationId='.length)
      : undefined,
  };
}

async function main() {
  const { execute, limit, organizationId } = parseArgs(process.argv.slice(2));
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'error', 'warn'],
  });

  try {
    const receiptsService = app.get(ReceiptsService);
    const result = await receiptsService.reconcileMissingReceipts({
      execute,
      limit,
      organizationId,
    });

    console.log(
      JSON.stringify(
        {
          mode: execute ? 'execute' : 'dry-run',
          limit,
          organizationId,
          candidateCount: result.candidates.length,
          candidatePaymentIds: result.candidates.map(
            (candidate) => candidate.paymentId,
          ),
          reconciledPaymentIds: result.reconciled,
          skippedPaymentIds: result.skippedPaymentIds,
        },
        null,
        2,
      ),
    );
  } finally {
    await app.close();
  }
}

void main();
