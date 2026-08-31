import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { AppModule } from '../../src/app.module';
import { AiGatewayService } from '../../src/ai/gateway/ai.gateway';
import { AIProviderUnavailableError } from '../../src/ai/gateway/ai-provider.interface';
import { AiUsageService } from '../../src/ai/usage/ai-usage.service';
import {
  AIUsage,
  AIUsageStatus,
} from '../../src/ai/usage/entities/ai-usage.entity';
import { AiMemoryService } from '../../src/ai/memory/ai-memory.service';
import { AiToolRegistry } from '../../src/ai/tools/ai-tool.registry';
import {
  AiTool,
  AiToolNotFoundError,
  AiToolInputValidationError,
  AiToolUnauthorizedError,
} from '../../src/ai/tools/ai-tool.interface';
import { Permission } from '../../src/authorization/permissions.enum';
import { OrganizationRole } from '../../src/organization-members/entities/organization-member.entity';
import { UsersService } from '../../src/users/users.service';
import { OrganizationsService } from '../../src/organizations/organizations.service';
import { PasswordService } from '../../src/security/password.service';

/**
 * AI Foundation — Gateway, Usage, Memory, Tool Registry (e2e)
 *
 * Calls the AI Foundation services directly, not through HTTP — no
 * controller exists yet (S7-01 open item resolved: no route surface
 * until a real feature consumes it). This suite proves the security
 * boundary the Sprint 7 directive requires (§17): Gateway
 * success/failure + usage recording, tenant isolation on AIUsage and
 * AIMemory, and Tool Registry authorization enforcement.
 *
 * AI_PROVIDER resolves to UnconfiguredProvider in this environment
 * (no ANTHROPIC_API_KEY configured for tests), which is exactly what
 * we want to exercise here: the Gateway's failure path, not a live
 * call to Anthropic.
 */
describe('AI Foundation — Gateway, Usage, Memory, Tool Registry (e2e)', () => {
  let app: INestApplication;
  let aiGatewayService: AiGatewayService;
  let aiUsageService: AiUsageService;
  let aiMemoryService: AiMemoryService;
  let aiToolRegistry: AiToolRegistry;
  let usageRepository: Repository<AIUsage>;
  let orgAId: string;
  let orgBId: string;
  let userId: string;

  const runId = randomUUID().slice(0, 8);

  interface TestToolInput {
    foo: string;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    aiGatewayService = app.get(AiGatewayService);
    aiUsageService = app.get(AiUsageService);
    aiMemoryService = app.get(AiMemoryService);
    aiToolRegistry = app.get(AiToolRegistry);
    usageRepository = app.get(getRepositoryToken(AIUsage));

    const usersService = app.get(UsersService);
    const organizationsService = app.get(OrganizationsService);
    const passwordService = app.get(PasswordService);

    const passwordHash = await passwordService.hash('SecurePass123');
    const user = await usersService.create(
      {
        firstName: 'AI',
        lastName: 'Tester',
        email: `ai-tester.${runId}@example.com`,
        password: 'SecurePass123',
      },
      passwordHash,
    );
    userId = user.id;

    const orgA = await organizationsService.createWithOwner(
      { name: `AI Test Org A ${runId}`, country: 'Nigeria', currency: 'NGN' },
      userId,
    );
    orgAId = orgA.id;

    const orgB = await organizationsService.createWithOwner(
      { name: `AI Test Org B ${runId}`, country: 'Nigeria', currency: 'NGN' },
      userId,
    );
    orgBId = orgB.id;

    const testTool: AiTool<TestToolInput, { result: string }> = {
      name: 'test_adjust_inventory',
      description: 'Test-only tool gated on INVENTORY_ADJUST.',
      inputSchema: { type: 'object', properties: { foo: { type: 'string' } } },
      outputSchema: {
        type: 'object',
        properties: { result: { type: 'string' } },
      },
      requiredPermission: Permission.INVENTORY_ADJUST,
      classification: 'mutation',
      validateInput: (value): value is TestToolInput =>
        typeof value === 'object' &&
        value !== null &&
        typeof (value as { foo?: unknown }).foo === 'string',
      execute: (input) => Promise.resolve({ result: `adjusted:${input.foo}` }),
    };
    aiToolRegistry.register(testTool);
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  describe('Gateway', () => {
    it('fails loud through UnconfiguredProvider and records a FAILURE usage row', async () => {
      await expect(
        aiGatewayService.generate(
          { systemPrompt: 'test', messages: [{ role: 'user', content: 'hi' }] },
          { organizationId: orgAId, userId },
        ),
      ).rejects.toThrow(AIProviderUnavailableError);

      const failures = await usageRepository.find({
        where: {
          organizationId: orgAId,
          userId,
          status: AIUsageStatus.FAILURE,
        },
      });
      expect(failures.length).toBeGreaterThan(0);
      expect(failures[0].errorCategory).toBe('unavailable');
    });
  });

  describe('Usage tracking — tenant isolation', () => {
    it("keeps Org A's usage rows invisible when queried under Org B", async () => {
      const requestId = randomUUID();
      await aiUsageService.record({
        organizationId: orgAId,
        userId,
        provider: 'test',
        model: 'test-model',
        requestId,
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
        estimatedCostCents: null,
        latencyMs: 100,
        status: AIUsageStatus.SUCCESS,
      });

      const orgARows = await usageRepository.find({
        where: { organizationId: orgAId, requestId },
      });
      const orgBRows = await usageRepository.find({
        where: { organizationId: orgBId, requestId },
      });

      expect(orgARows.length).toBe(1);
      expect(orgBRows.length).toBe(0);
    });
  });

  describe('Memory — scoping and persistence', () => {
    it('stores and retrieves a value scoped to org + user', async () => {
      await aiMemoryService.set(
        { organizationId: orgAId, userId },
        'preference:tone',
        'concise',
      );

      const record = await aiMemoryService.get(
        { organizationId: orgAId, userId },
        'preference:tone',
      );
      expect(record?.content).toBe('concise');
    });

    it("keeps Org A's memory invisible when queried under Org B", async () => {
      await aiMemoryService.set(
        { organizationId: orgAId, userId },
        'preference:isolation-check',
        'org-a-value',
      );

      const crossOrgRead = await aiMemoryService.get(
        { organizationId: orgBId, userId },
        'preference:isolation-check',
      );
      expect(crossOrgRead).toBeNull();
    });

    it('upserts rather than duplicating on repeated set() calls with the same key', async () => {
      const scope = { organizationId: orgAId, userId };
      await aiMemoryService.set(scope, 'preference:upsert-check', 'first');
      await aiMemoryService.set(scope, 'preference:upsert-check', 'second');

      const record = await aiMemoryService.get(
        scope,
        'preference:upsert-check',
      );
      expect(record?.content).toBe('second');
    });

    it('deletes a stored value', async () => {
      const scope = { organizationId: orgAId, userId };
      await aiMemoryService.set(scope, 'preference:delete-check', 'temp');
      await aiMemoryService.delete(scope, 'preference:delete-check');

      const record = await aiMemoryService.get(
        scope,
        'preference:delete-check',
      );
      expect(record).toBeNull();
    });
  });

  describe('Tool Registry — authorization boundary', () => {
    it('executes a tool when the role holds the required permission', async () => {
      const result = await aiToolRegistry.execute(
        'test_adjust_inventory',
        { foo: 'bar' },
        {
          organizationId: orgAId,
          memberId: userId,
          role: OrganizationRole.MANAGER,
          requestId: randomUUID(),
        },
      );
      expect(result).toEqual({ result: 'adjusted:bar' });
    });

    it('rejects execution when the role lacks the required permission', async () => {
      await expect(
        aiToolRegistry.execute(
          'test_adjust_inventory',
          { foo: 'bar' },
          {
            organizationId: orgAId,
            memberId: userId,
            role: OrganizationRole.STAFF,
            requestId: randomUUID(),
          },
        ),
      ).rejects.toThrow(AiToolUnauthorizedError);
    });

    it('rejects execution of an unregistered tool', async () => {
      await expect(
        aiToolRegistry.execute(
          'nonexistent_tool',
          {},
          {
            organizationId: orgAId,
            memberId: userId,
            role: OrganizationRole.OWNER,
            requestId: randomUUID(),
          },
        ),
      ).rejects.toThrow(AiToolNotFoundError);
    });

    it('rejects malformed input before authorization is even checked', async () => {
      await expect(
        aiToolRegistry.execute(
          'test_adjust_inventory',
          { foo: 123 },
          {
            organizationId: orgAId,
            memberId: userId,
            role: OrganizationRole.STAFF,
            requestId: randomUUID(),
          },
        ),
      ).rejects.toThrow(AiToolInputValidationError);
    });
  });
});
