/**
 * The contract every email delivery mechanism must satisfy.
 * InvitationService (and any future feature that sends email) only
 * ever depends on this interface, never on a concrete provider —
 * swapping ConsoleEmailProvider for a real provider (Resend, SES,
 * SendGrid, Postmark) later requires zero changes to the code that
 * calls it.
 */
export interface InvitationEmailPayload {
  toEmail: string;
  organizationName: string;
  inviterName: string;
  invitationLink: string;
  expiresAt: Date;
}

export interface EmailProvider {
  sendInvitation(payload: InvitationEmailPayload): Promise<void>;
}

/**
 * DI token used to inject whichever EmailProvider implementation is
 * currently configured (see EmailModule) — interfaces have no
 * runtime representation in TypeScript, so a string/symbol token is
 * needed for NestJS's dependency injection to resolve against.
 */
export const EMAIL_PROVIDER = 'EMAIL_PROVIDER';
