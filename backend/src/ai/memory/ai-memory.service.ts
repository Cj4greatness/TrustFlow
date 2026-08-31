import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AIMemory } from './entities/ai-memory.entity';
import { MemoryScope, AIMemoryRecord } from './ai-memory.types';

/**
 * AiMemoryService
 *
 * S7-01 §7. Backed by the ai_memory table. One row per
 * (organizationId, userId, key) — set() upserts via the unique
 * constraint, so repeated writes to the same key overwrite rather
 * than accumulate.
 *
 * Business data (Orders, Invoices, Payments, Customers, Inventory)
 * must never be written here — this service is reserved for
 * intentionally-retained conversational/preference context only
 * (directive §6). Enforcing that boundary is a design/review
 * responsibility of callers, not something this service checks
 * mechanically.
 */
@Injectable()
export class AiMemoryService {
  constructor(
    @InjectRepository(AIMemory)
    private readonly memoryRepository: Repository<AIMemory>,
  ) {}

  async get(scope: MemoryScope, key: string): Promise<AIMemoryRecord | null> {
    const record = await this.memoryRepository.findOne({
      where: {
        organizationId: scope.organizationId,
        userId: scope.userId,
        key,
      },
    });
    if (!record) return null;
    return {
      key: record.key,
      content: record.content,
      metadata: record.metadata,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  async set(
    scope: MemoryScope,
    key: string,
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const existing = await this.memoryRepository.findOne({
      where: {
        organizationId: scope.organizationId,
        userId: scope.userId,
        key,
      },
    });

    if (existing) {
      existing.content = content;
      existing.metadata = metadata ?? null;
      await this.memoryRepository.save(existing);
      return;
    }

    const record = this.memoryRepository.create({
      organizationId: scope.organizationId,
      userId: scope.userId,
      key,
      content,
      metadata: metadata ?? null,
    });
    await this.memoryRepository.save(record);
  }

  async delete(scope: MemoryScope, key: string): Promise<void> {
    await this.memoryRepository.delete({
      organizationId: scope.organizationId,
      userId: scope.userId,
      key,
    });
  }
}
