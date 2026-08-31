import { Module } from '@nestjs/common';
import { EMAIL_PROVIDER } from './interfaces/email-provider.interface';
import { ConsoleEmailProvider } from './providers/console-email.provider';

/**
 * Wires whichever EmailProvider implementation is active behind the
 * EMAIL_PROVIDER token. Today that's always ConsoleEmailProvider;
 * swapping to a real provider later (or selecting one based on
 * NODE_ENV) only requires changing the `useClass` line below —
 * nothing that injects EMAIL_PROVIDER elsewhere needs to change.
 */
@Module({
  providers: [
    {
      provide: EMAIL_PROVIDER,
      useClass: ConsoleEmailProvider,
    },
  ],
  exports: [EMAIL_PROVIDER],
})
export class EmailModule {}
