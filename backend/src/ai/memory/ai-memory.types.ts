/**
 * S7-01 §7. Memory is explicitly org/user scoped — never a
 * cross-tenant or platform-global scope. This mirrors the
 * organizationId-on-every-entity pattern used everywhere else.
 */
export interface MemoryScope {
  organizationId: string;
  userId: string;
}

export interface AIMemoryRecord {
  key: string;
  content: string;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}
