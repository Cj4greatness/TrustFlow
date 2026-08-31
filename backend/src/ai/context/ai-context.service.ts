import { Injectable } from '@nestjs/common';
import { AiContextRequest, AiAssembledContext } from './ai-context.types';

/**
 * AiContextService
 *
 * S7-01 §5. Ships the boundary and the allowlisting pattern — no
 * operation cases are implemented yet, since no actual AI feature
 * consumes context yet. Future work adds a case per
 * AiContextOperation, each one pulling only through existing domain
 * repositories' getOwnedXOrThrow/findAllForOrganization methods —
 * this service never issues its own SQL and never returns a raw
 * entity.
 *
 * Authorization is NOT re-implemented here — callers must already
 * have passed PermissionsGuard / hold a valid AiExecutionContext
 * before assemble() is invoked. This service only decides WHAT
 * data is included, not WHETHER the caller may see it.
 */
@Injectable()
export class AiContextService {
  assemble(request: AiContextRequest): Promise<AiAssembledContext> {
    switch (request.operation) {
      case 'order_summary':
      case 'customer_summary':
      case 'inventory_summary':
        throw new Error(
          `AI context operation "${request.operation}" has no implementation yet — ` +
            'only the assembly boundary exists so far. Implement per-operation ' +
            'allowlisted field selection when the consuming AI feature is built.',
        );
      default: {
        const _exhaustive: never = request.operation;
        throw new Error(
          `Unhandled AI context operation: ${String(_exhaustive)}`,
        );
      }
    }
  }
}
