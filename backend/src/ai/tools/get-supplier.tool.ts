import { SuppliersService } from '../../suppliers/suppliers.service';
import { Permission } from '../../authorization/permissions.enum';
import { AiTool, AiExecutionContext } from './ai-tool.interface';

export interface GetSupplierInput {
  supplierId: string;
}

export interface GetSupplierOutput {
  id: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  status: string;
}

/**
 * get_supplier
 *
 * Fourth Tool Registry entry, mirroring get_customer/get_order's
 * shape: read-only, org-scoped via
 * SuppliersService.getOwnedSupplierOrThrow (called internally by
 * getSupplier()) — no new tenant-isolation logic introduced.
 *
 * Argument order matches get_order: (organizationId, supplierId).
 *
 * Output omits organizationId (redundant) and createdBy (internal
 * bookkeeping, no obvious AI-facing use per prior tools' reasoning).
 */
export function createGetSupplierTool(
  suppliersService: SuppliersService,
): AiTool<GetSupplierInput, GetSupplierOutput> {
  return {
    name: 'get_supplier',
    description:
      "Fetch a single supplier's details by ID, scoped to the caller's organization.",
    inputSchema: {
      type: 'object',
      properties: {
        supplierId: { type: 'string', format: 'uuid' },
      },
      required: ['supplierId'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        contactName: { type: ['string', 'null'] },
        email: { type: ['string', 'null'] },
        phone: { type: ['string', 'null'] },
        address: { type: ['string', 'null'] },
        notes: { type: ['string', 'null'] },
        status: { type: 'string' },
      },
    },
    requiredPermission: Permission.SUPPLIER_READ,
    classification: 'read',
    validateInput: (value): value is GetSupplierInput =>
      typeof value === 'object' &&
      value !== null &&
      typeof (value as { supplierId?: unknown }).supplierId === 'string',
    execute: async (input, ctx: AiExecutionContext) => {
      const supplier = await suppliersService.getSupplier(
        ctx.organizationId,
        input.supplierId,
      );
      return {
        id: supplier.id,
        name: supplier.name,
        contactName: supplier.contactName,
        email: supplier.email,
        phone: supplier.phone,
        address: supplier.address,
        notes: supplier.notes,
        status: supplier.status,
      };
    },
  };
}
