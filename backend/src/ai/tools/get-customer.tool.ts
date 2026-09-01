import { NotFoundException } from '@nestjs/common';
import { CustomersService } from '../../customers/customers.service';
import { Permission } from '../../authorization/permissions.enum';
import { AiTool, AiExecutionContext } from './ai-tool.interface';

export interface GetCustomerInput {
  customerId: string;
}

export interface GetCustomerOutput {
  id: string;
  customerType: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  source: string | null;
}

/**
 * get_customer
 *
 * The first real Tool Registry entry — read-only, low-risk, and a
 * full exercise of the pipeline: Tool Registry validates input and
 * checks CUSTOMER_READ (held by every role per the permission
 * matrix), then execute() calls straight into the existing
 * CustomersService.getCustomer(), which itself enforces tenant
 * ownership via getOwnedCustomerOrThrow — nothing new to bypass.
 *
 * Output is deliberately a subset of the Customer entity: business-
 * relevant fields only. organizationId is omitted (redundant — the
 * tool is already org-scoped) and createdBy/timestamps are omitted
 * as internal bookkeeping an AI response has no obvious use for.
 */
export function createGetCustomerTool(
  customersService: CustomersService,
): AiTool<GetCustomerInput, GetCustomerOutput> {
  return {
    name: 'get_customer',
    description:
      "Fetch a single customer's details by ID, scoped to the caller's organization.",
    inputSchema: {
      type: 'object',
      properties: {
        customerId: { type: 'string', format: 'uuid' },
      },
      required: ['customerId'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        customerType: { type: 'string' },
        displayName: { type: 'string' },
        firstName: { type: ['string', 'null'] },
        lastName: { type: ['string', 'null'] },
        companyName: { type: ['string', 'null'] },
        email: { type: ['string', 'null'] },
        phone: { type: ['string', 'null'] },
        status: { type: 'string' },
        source: { type: ['string', 'null'] },
      },
    },
    requiredPermission: Permission.CUSTOMER_READ,
    classification: 'read',
    validateInput: (value): value is GetCustomerInput =>
      typeof value === 'object' &&
      value !== null &&
      typeof (value as { customerId?: unknown }).customerId === 'string',
    execute: async (input, ctx: AiExecutionContext) => {
      const customer = await customersService.getCustomer(
        ctx.organizationId,
        input.customerId,
      );
      if (!customer) {
        throw new NotFoundException(`Customer ${input.customerId} not found`);
      }
      return {
        id: customer.id,
        customerType: customer.customerType,
        displayName: customer.displayName,
        firstName: customer.firstName,
        lastName: customer.lastName,
        companyName: customer.companyName,
        email: customer.email,
        phone: customer.phone,
        status: customer.status,
        source: customer.source,
      };
    },
  };
}
