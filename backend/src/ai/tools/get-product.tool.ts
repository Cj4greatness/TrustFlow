import { ProductsService } from '../../products/products.service';
import { Permission } from '../../authorization/permissions.enum';
import { AiTool, AiExecutionContext } from './ai-tool.interface';

export interface GetProductInput {
  productId: string;
}

export interface GetProductOutput {
  id: string;
  name: string;
  description: string | null;
  sku: string;
  category: string | null;
  unit: string | null;
  sellingPrice: string;
  costPrice: string | null;
  status: string;
}

/**
 * get_product
 *
 * Sixth Tool Registry entry, mirroring get_customer/get_order's
 * shape: read-only, org-scoped via
 * ProductsService.getOwnedProductOrThrow (called internally by
 * getProduct()) — no new tenant-isolation logic introduced.
 *
 * Argument order matches get_order/get_supplier:
 * (organizationId, productId).
 *
 * costPrice is included deliberately — margin-sensitive, but
 * PRODUCT_READ already gates access to it via the regular API, so
 * this introduces no new exposure (confirmed decision, not a
 * default carried over from prior tools).
 *
 * Inventory (quantity/lowStockThreshold) is a separate entity/
 * service and is out of scope here — same reasoning as get_order
 * excluding line items. A get_inventory tool can be added
 * separately if needed.
 *
 * Output omits organizationId (redundant) and createdBy (internal
 * bookkeeping, no obvious AI-facing use per prior tools' reasoning).
 */
export function createGetProductTool(
  productsService: ProductsService,
): AiTool<GetProductInput, GetProductOutput> {
  return {
    name: 'get_product',
    description:
      "Fetch a single product's details by ID, scoped to the caller's organization.",
    inputSchema: {
      type: 'object',
      properties: {
        productId: { type: 'string', format: 'uuid' },
      },
      required: ['productId'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        description: { type: ['string', 'null'] },
        sku: { type: 'string' },
        category: { type: ['string', 'null'] },
        unit: { type: ['string', 'null'] },
        sellingPrice: { type: 'string' },
        costPrice: { type: ['string', 'null'] },
        status: { type: 'string' },
      },
    },
    requiredPermission: Permission.PRODUCT_READ,
    classification: 'read',
    validateInput: (value): value is GetProductInput =>
      typeof value === 'object' &&
      value !== null &&
      typeof (value as { productId?: unknown }).productId === 'string',
    execute: async (input, ctx: AiExecutionContext) => {
      const product = await productsService.getProduct(
        ctx.organizationId,
        input.productId,
      );
      return {
        id: product.id,
        name: product.name,
        description: product.description,
        sku: product.sku,
        category: product.category,
        unit: product.unit,
        sellingPrice: product.sellingPrice,
        costPrice: product.costPrice,
        status: product.status,
      };
    },
  };
}
