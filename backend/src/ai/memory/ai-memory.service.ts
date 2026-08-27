import { Injectable } from '@nestjs/common';
import { MemoryScope, AIMemoryRecord } from './ai-memory.types';

/**
 * AiMemoryService
 *
 * S7-01 §7. Interface is locked; persistence is NOT — whether this
 * is actually backed by a database table, or ships boundary-only,
 * is still an open decision. This implementation intentionally
 * throws rather than silently no-op'ing, so nothing can accidentally
 * depend on memory "working" before that decision is made and a real
 * backing store (an AIMemory entity + migration, per directive §13)
 * is implemented.
 *
 * Business data (Orders, Invoices, Payments, Customers, Inventory)
 * must never be written here — this service is reserved for
 * intentionally-retained conversational/preference context only
 * (directive §6).
 */
/* eslint-disable @typescript-eslint/no-unused-vars -- documented
   interface params, kept for the future real implementation */
@Injectable()
export class AiMemoryService {
  get(scope: MemoryScope, key: string): Promise<AIMemoryRecord | null> {
    throw new Error('AiMemoryService has no backing store yet.');
  }

  set(
    scope: MemoryScope,
    key: string,
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    throw new Error('AiMemoryService has no backing store yet.');
  }

  delete(scope: MemoryScope, key: string): Promise<void> {
    throw new Error('AiMemoryService has no backing store yet.');
  }
}
/* eslint-enable @typescript-eslint/no-unused-vars */
