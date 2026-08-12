import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { CustomersService } from './customers.service';
import { CreateCustomerAddressDto } from './dto/create-customer-address.dto';
import { UpdateCustomerAddressDto } from './dto/update-customer-address.dto';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { Permissions } from '../authorization/decorators/permissions.decorator';
import { Permission } from '../authorization/permissions.enum';

/**
 * Addresses use the same CUSTOMER_* permissions as the parent
 * customer rather than their own permission set — an address has no
 * independent access-control meaning apart from the customer it
 * belongs to (unlike CustomerNote, which the locked matrix does give
 * its own CUSTOMER_NOTE_* permissions).
 */
@ApiTags('customers')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@Controller('organizations/:id/customers/:customerId/addresses')
export class CustomerAddressesController {
  constructor(private readonly customersService: CustomersService) {}

  @Post()
  @Permissions(Permission.CUSTOMER_UPDATE)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add an address to a customer' })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  @ApiParam({ name: 'customerId', description: 'Customer UUID' })
  addAddress(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Body() dto: CreateCustomerAddressDto,
  ) {
    return this.customersService.addAddress(organizationId, customerId, dto);
  }

  @Get()
  @Permissions(Permission.CUSTOMER_READ)
  @ApiOperation({ summary: "List a customer's addresses" })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  @ApiParam({ name: 'customerId', description: 'Customer UUID' })
  listAddresses(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('customerId', ParseUUIDPipe) customerId: string,
  ) {
    return this.customersService.listAddresses(organizationId, customerId);
  }

  @Patch(':addressId')
  @Permissions(Permission.CUSTOMER_UPDATE)
  @ApiOperation({ summary: 'Update a customer address' })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  @ApiParam({ name: 'customerId', description: 'Customer UUID' })
  @ApiParam({ name: 'addressId', description: 'Address UUID' })
  updateAddress(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Param('addressId', ParseUUIDPipe) addressId: string,
    @Body() dto: UpdateCustomerAddressDto,
  ) {
    return this.customersService.updateAddress(
      organizationId,
      customerId,
      addressId,
      dto,
    );
  }

  @Delete(':addressId')
  @Permissions(Permission.CUSTOMER_UPDATE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a customer address' })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  @ApiParam({ name: 'customerId', description: 'Customer UUID' })
  @ApiParam({ name: 'addressId', description: 'Address UUID' })
  async deleteAddress(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Param('addressId', ParseUUIDPipe) addressId: string,
  ): Promise<void> {
    await this.customersService.deleteAddress(
      organizationId,
      customerId,
      addressId,
    );
  }
}
