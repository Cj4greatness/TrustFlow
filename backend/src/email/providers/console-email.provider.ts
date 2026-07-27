import { Injectable, Logger } from '@nestjs/common';
import {
  EmailProvider,
  InvitationEmailPayload,
} from '../interfaces/email-provider.interface';

/**
 * Development-only EmailProvider that logs the invitation to the
 * console instead of actually sending anything. Lets the entire
 * invitation business workflow be built and tested end-to-end before
 * a real email provider is integrated (Communications module) —
 * swapping this out later touches only EmailModule's wiring, nothing
 * in InvitationService.
 */
@Injectable()
export class ConsoleEmailProvider implements EmailProvider {
  private readonly logger = new Logger(ConsoleEmailProvider.name);

  async sendInvitation(payload: InvitationEmailPayload): Promise<void> {
    const message = [
      '============================',
      'INVITATION EMAIL',
      '',
      `To: ${payload.toEmail}`,
      `Organization: ${payload.organizationName}`,
      `Invited by: ${payload.inviterName}`,
      `Invitation Link: ${payload.invitationLink}`,
      `Expires: ${payload.expiresAt.toISOString()}`,
      '============================',
    ].join('\n');

    this.logger.log(`\n${message}`);
    return Promise.resolve();
  }
}
