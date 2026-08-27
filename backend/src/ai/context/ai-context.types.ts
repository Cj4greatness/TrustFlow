/**
 * S7-01 §5. AiContextService assembles exactly one of these per
 * request — never a raw entity/database dump. Each operation type
 * defines its own explicit allowlist of fields; adding a new
 * operation means adding a new case, not widening an existing one.
 */
export type AiContextOperation =
  'order_summary' | 'customer_summary' | 'inventory_summary';

export interface AiContextRequest {
  organizationId: string;
  memberId: string;
  role: string;
  operation: AiContextOperation;
  /** Operation-specific identifiers, e.g. { orderId } for 'order_summary'. */
  params: Record<string, string>;
}

export interface AiAssembledContext {
  operation: AiContextOperation;
  /** Explicitly selected, normalized fields only — never a serialized entity. */
  data: Record<string, unknown>;
}
