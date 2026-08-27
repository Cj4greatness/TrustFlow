import { Permission } from '../../authorization/permissions.enum';

/**
 * AiExecutionContext
 *
 * S7-01 §6. Sourced from the same guard-populated request object
 * every controller already uses (CurrentMember/CurrentOrganization).
 * Tools never resolve organization/member context themselves.
 */
export interface AiExecutionContext {
  organizationId: string;
  memberId: string;
  role: string;
  requestId: string;
}

export type AiToolClassification = 'read' | 'mutation';

/**
 * AiTool
 *
 * S7-01 §6 / directive §4. Every AI-callable operation is an
 * explicitly registered tool — the AI layer never gets arbitrary
 * service-method or database access (directive §4, §11.7).
 *
 * execute() MUST call into the existing domain service layer (e.g.
 * InventoryService.adjust()), never a repository or the database
 * directly. This is what guarantees a tool can't bypass the
 * transactions, row locks, and state-machine checks that already
 * live in that domain's service — the same guarantee the HTTP API
 * gets from calling the service layer.
 *
 * requiredPermission reuses the existing Permission enum — no
 * separate "AI permission" tier. A tool never grants a member
 * capability they don't already have via the ordinary permission
 * matrix (directive §11).
 */
export interface AiTool<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  /** JSON Schema describing TInput, exposed to the provider as a tool definition. */
  inputSchema: Record<string, unknown>;
  /** JSON Schema describing TOutput, for documentation/validation. */
  outputSchema: Record<string, unknown>;
  requiredPermission: Permission;
  classification: AiToolClassification;
  /** Runtime input validator — rejects malformed input before execute() runs. */
  validateInput: (value: unknown) => value is TInput;
  execute(input: TInput, ctx: AiExecutionContext): Promise<TOutput>;
}

export class AiToolNotFoundError extends Error {}
export class AiToolInputValidationError extends Error {}
export class AiToolUnauthorizedError extends Error {}
