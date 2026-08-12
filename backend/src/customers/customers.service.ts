import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CustomersRepository,
  PaginatedCustomers,
} from './customers.repository';
import { CustomerAddressesRepository } from './customer-addresses.repository';
import { CustomerNotesRepository } from './customer-notes.repository';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CustomerQueryDto } from './dto/customer-query.dto';
import { CreateCustomerAddressDto } from './dto/create-customer-address.dto';
import { UpdateCustomerAddressDto } from './dto/update-customer-address.dto';
import { CreateCustomerNoteDto } from './dto/create-customer-note.dto';
import {
  Customer,
  CustomerStatus,
  CustomerType,
} from './entities/customer.entity';
import {
  CustomerAddress,
  CustomerAddressType,
} from './entities/customer-address.entity';
import { CustomerNote } from './entities/customer-note.entity';

@Injectable()
export class CustomersService {
  constructor(
    private readonly customersRepository: CustomersRepository,
    private readonly customerAddressesRepository: CustomerAddressesRepository,
    private readonly customerNotesRepository: CustomerNotesRepository,
  ) {}

  // -----------------------------------------------------------------
  // Tenant-isolation helpers
  //
  // Referenced from CustomersController's doc comment: PermissionsGuard
  // only confirms the actor has the right permission within :id
  // (organizationId) — it does NOT confirm the target row actually
  // belongs to that organization. Every method below that touches an
  // existing row goes through one of these first, mirroring the manual
  // organizationId re-check pattern established in
  // OrganizationMembersService (removeMember, updateMemberRole).
  // -----------------------------------------------------------------

  private async getOwnedCustomerOrThrow(
    organizationId: string,
    customerId: string,
  ): Promise<Customer> {
    const customer = await this.customersRepository.findById(customerId);
    if (!customer || customer.organizationId !== organizationId) {
      throw new NotFoundException('Customer not found in this organization');
    }
    return customer;
  }

  private async getOwnedAddressOrThrow(
    organizationId: string,
    customerId: string,
    addressId: string,
  ): Promise<CustomerAddress> {
    // Confirms the customer itself belongs to the organization first —
    // otherwise a caller could probe for an address's existence under
    // a customerId belonging to a different org.
    await this.getOwnedCustomerOrThrow(organizationId, customerId);

    const address = await this.customerAddressesRepository.findById(addressId);
    if (
      !address ||
      address.organizationId !== organizationId ||
      address.customerId !== customerId
    ) {
      throw new NotFoundException('Address not found for this customer');
    }
    return address;
  }

  // -----------------------------------------------------------------
  // Customer
  // -----------------------------------------------------------------

  /**
   * Computes displayName per the entity's doc comment: always
   * populated by the service layer so list views never need to
   * branch on customerType. Caller-supplied displayName always wins;
   * otherwise derived from firstName/lastName (INDIVIDUAL) or
   * companyName (BUSINESS).
   */
  private computeDisplayName(input: {
    displayName?: string;
    customerType: CustomerType;
    firstName?: string | null;
    lastName?: string | null;
    companyName?: string | null;
  }): string {
    if (input.displayName) {
      return input.displayName;
    }

    if (input.customerType === CustomerType.INDIVIDUAL) {
      const name = [input.firstName, input.lastName]
        .filter(Boolean)
        .join(' ')
        .trim();
      if (!name) {
        throw new BadRequestException(
          'An individual customer needs a displayName, or a firstName/lastName to derive one from',
        );
      }
      return name;
    }

    if (!input.companyName) {
      throw new BadRequestException(
        'A business customer needs a displayName, or a companyName to derive one from',
      );
    }
    return input.companyName;
  }

  async createCustomer(
    organizationId: string,
    dto: CreateCustomerDto,
    createdByUserId: string,
  ): Promise<Customer> {
    if (dto.email) {
      const emailTaken =
        await this.customersRepository.existsByOrganizationAndEmail(
          organizationId,
          dto.email,
        );
      if (emailTaken) {
        throw new ConflictException(
          'A customer with this email already exists in this organization',
        );
      }
    }

    const displayName = this.computeDisplayName({
      displayName: dto.displayName,
      customerType: dto.customerType,
      firstName: dto.firstName,
      lastName: dto.lastName,
      companyName: dto.companyName,
    });

    const customer = this.customersRepository.create({
      organizationId,
      customerType: dto.customerType,
      displayName,
      firstName: dto.firstName ?? null,
      lastName: dto.lastName ?? null,
      companyName: dto.companyName ?? null,
      email: dto.email ?? null,
      phone: dto.phone ?? null,
      status: dto.status ?? CustomerStatus.LEAD,
      source: dto.source ?? null,
      createdBy: createdByUserId,
    });

    return this.customersRepository.save(customer);
  }

  async listCustomers(
    organizationId: string,
    query: CustomerQueryDto,
  ): Promise<PaginatedCustomers> {
    return this.customersRepository.findByOrganization(organizationId, query);
  }

  async getCustomer(
    organizationId: string,
    customerId: string,
  ): Promise<Customer> {
    return this.getOwnedCustomerOrThrow(organizationId, customerId);
  }

  async updateCustomer(
    organizationId: string,
    customerId: string,
    dto: UpdateCustomerDto,
  ): Promise<Customer> {
    const existing = await this.getOwnedCustomerOrThrow(
      organizationId,
      customerId,
    );

    if (dto.email && dto.email !== existing.email) {
      const emailTaken =
        await this.customersRepository.existsByOrganizationAndEmail(
          organizationId,
          dto.email,
          customerId,
        );
      if (emailTaken) {
        throw new ConflictException(
          'A customer with this email already exists in this organization',
        );
      }
    }

    const nameFieldsChanged =
      dto.firstName !== undefined ||
      dto.lastName !== undefined ||
      dto.companyName !== undefined;

    const displayName =
      dto.displayName !== undefined
        ? dto.displayName
        : nameFieldsChanged
          ? this.computeDisplayName({
              customerType: dto.customerType ?? existing.customerType,
              firstName:
                dto.firstName !== undefined
                  ? dto.firstName
                  : existing.firstName,
              lastName:
                dto.lastName !== undefined ? dto.lastName : existing.lastName,
              companyName:
                dto.companyName !== undefined
                  ? dto.companyName
                  : existing.companyName,
            })
          : existing.displayName;

    const updated = this.customersRepository.create({
      ...existing,
      ...(dto.customerType !== undefined && { customerType: dto.customerType }),
      displayName,
      ...(dto.firstName !== undefined && { firstName: dto.firstName }),
      ...(dto.lastName !== undefined && { lastName: dto.lastName }),
      ...(dto.companyName !== undefined && { companyName: dto.companyName }),
      ...(dto.email !== undefined && { email: dto.email }),
      ...(dto.phone !== undefined && { phone: dto.phone }),
      ...(dto.status !== undefined && { status: dto.status }),
      ...(dto.source !== undefined && { source: dto.source }),
    });

    return this.customersRepository.save(updated);
  }

  async deleteCustomer(
    organizationId: string,
    customerId: string,
  ): Promise<void> {
    await this.getOwnedCustomerOrThrow(organizationId, customerId);
    await this.customersRepository.softDelete(customerId);
  }

  // -----------------------------------------------------------------
  // Customer addresses
  // -----------------------------------------------------------------

  async addAddress(
    organizationId: string,
    customerId: string,
    dto: CreateCustomerAddressDto,
  ): Promise<CustomerAddress> {
    await this.getOwnedCustomerOrThrow(organizationId, customerId);

    // NOTE: no enforcement of "at most one isDefault address per
    // customer" — not specified for Sprint 4. Flagging as an open
    // question rather than inventing enforcement logic that wasn't
    // asked for (same category of decision as displayName above).
    const address = this.customerAddressesRepository.create({
      customerId,
      organizationId,
      type: dto.type ?? CustomerAddressType.OTHER,
      line1: dto.line1,
      line2: dto.line2 ?? null,
      city: dto.city,
      state: dto.state ?? null,
      postalCode: dto.postalCode ?? null,
      country: dto.country,
      isDefault: dto.isDefault ?? false,
    });

    return this.customerAddressesRepository.save(address);
  }

  async listAddresses(
    organizationId: string,
    customerId: string,
  ): Promise<CustomerAddress[]> {
    await this.getOwnedCustomerOrThrow(organizationId, customerId);
    return this.customerAddressesRepository.findByCustomer(customerId);
  }

  async updateAddress(
    organizationId: string,
    customerId: string,
    addressId: string,
    dto: UpdateCustomerAddressDto,
  ): Promise<CustomerAddress> {
    const existing = await this.getOwnedAddressOrThrow(
      organizationId,
      customerId,
      addressId,
    );

    const updated = this.customerAddressesRepository.create({
      ...existing,
      ...(dto.type !== undefined && { type: dto.type }),
      ...(dto.line1 !== undefined && { line1: dto.line1 }),
      ...(dto.line2 !== undefined && { line2: dto.line2 }),
      ...(dto.city !== undefined && { city: dto.city }),
      ...(dto.state !== undefined && { state: dto.state }),
      ...(dto.postalCode !== undefined && { postalCode: dto.postalCode }),
      ...(dto.country !== undefined && { country: dto.country }),
      ...(dto.isDefault !== undefined && { isDefault: dto.isDefault }),
    });

    return this.customerAddressesRepository.save(updated);
  }

  async deleteAddress(
    organizationId: string,
    customerId: string,
    addressId: string,
  ): Promise<void> {
    await this.getOwnedAddressOrThrow(organizationId, customerId, addressId);
    await this.customerAddressesRepository.softDelete(addressId);
  }

  // -----------------------------------------------------------------
  // Customer notes
  // -----------------------------------------------------------------

  async addNote(
    organizationId: string,
    customerId: string,
    dto: CreateCustomerNoteDto,
    authorId: string,
  ): Promise<CustomerNote> {
    await this.getOwnedCustomerOrThrow(organizationId, customerId);

    const note = this.customerNotesRepository.create({
      customerId,
      organizationId,
      authorId,
      body: dto.body,
    });

    return this.customerNotesRepository.save(note);
  }

  async listNotes(
    organizationId: string,
    customerId: string,
  ): Promise<CustomerNote[]> {
    await this.getOwnedCustomerOrThrow(organizationId, customerId);
    return this.customerNotesRepository.findByCustomer(customerId);
  }
}
