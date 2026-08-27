import { Injectable } from '@nestjs/common';
import { AuthorizationService } from '../../authorization/authorization.service';
import { OrganizationRole } from '../../organization-members/entities/organization-member.entity';
import {
  AiTool,
  AiExecutionContext,
  AiToolNotFoundError,
  AiToolInputValidationError,
  AiToolUnauthorizedError,
} from './ai-tool.interface';

/**
 * AiToolRegistry
 *
 * S7-01 §6. Tools register themselves here (via register(), called
 * from each tool's own module at bootstrap — no tools are registered
 * yet, this is the mechanism future work uses).
 *
 * execute() is the only entry point the Gateway/Context layers use
 * to run a tool. It always, in order:
 *   1. resolves the tool by name (404-equivalent if unknown)
 *   2. validates input against the tool's schema
 *   3. checks ctx.role against tool.requiredPermission via the
 *      existing AuthorizationService — identical check the
 *      PermissionsGuard performs for HTTP routes, just invoked
 *      programmatically
 *   4. calls execute(), which itself must go through the existing
 *      domain service layer
 *
 * No tool execution can skip step 3. This is the enforcement point
 * for directive §5's authorization boundary.
 */
@Injectable()
export class AiToolRegistry {
  private readonly tools = new Map<string, AiTool>();

  constructor(private readonly authorizationService: AuthorizationService) {}

  register(tool: AiTool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`AI tool "${tool.name}" is already registered.`);
    }
    this.tools.set(tool.name, tool);
  }

  list(): Pick<
    AiTool,
    'name' | 'description' | 'inputSchema' | 'classification'
  >[] {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      classification: tool.classification,
    }));
  }

  async execute(
    toolName: string,
    rawInput: unknown,
    ctx: AiExecutionContext,
  ): Promise<unknown> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new AiToolNotFoundError(`Unknown AI tool: "${toolName}"`);
    }

    if (!tool.validateInput(rawInput)) {
      throw new AiToolInputValidationError(
        `Input for AI tool "${toolName}" failed schema validation.`,
      );
    }

    const role = ctx.role as OrganizationRole;
    if (!this.authorizationService.can(role, tool.requiredPermission)) {
      throw new AiToolUnauthorizedError(
        `Role "${ctx.role}" lacks permission "${tool.requiredPermission}" required by AI tool "${toolName}".`,
      );
    }

    return tool.execute(rawInput, ctx);
  }
}
