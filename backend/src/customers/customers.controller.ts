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
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CustomerQueryDto } from './dto/customer-query.dto';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { Permissions } from '../authorization/decorators/permissions.decorator';
import { Permission } from '../authorization/permissions.enum';

interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}

/**
 * PermissionsGuard confirms the actor has the required permission
 * within the organization identified by :id — it does NOT confirm
 * the target customer/address/note actually belongs to that
 * organization. That verification happens in CustomersService (see
 * getOwnedCustomerOrThrow/getOwnedAddressOrThrow), which every
 * method here relies on. A route passing this guard is not by
 * itself proof the resource is safe to return or mutate — the
 * service layer is where that's actually enforced.
 */
@ApiTags('customers')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@Controller('organizations/:id/customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post()
  @Permissions(Permission.CUSTOMER_CREATE)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a customer' })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  createCustomer(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Body() dto: CreateCustomerDto,
    @Req() req: RequestWithUser,
  ) {
    return this.customersService.createCustomer(
      organizationId,
      dto,
      req.user.id,
    );
  }

  @Get()
  @Permissions(Permission.CUSTOMER_READ)
  @ApiOperation({ summary: 'List customers in an organization' })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  listCustomers(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Query() query: CustomerQueryDto,
  ) {
    return this.customersService.listCustomers(organizationId, query);
  }

  @Get(':customerId')
  @Permissions(Permission.CUSTOMER_READ)
  @ApiOperation({ summary: 'Get a single customer' })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  @ApiParam({ name: 'customerId', description: 'Customer UUID' })
  getCustomer(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('customerId', ParseUUIDPipe) customerId: string,
  ) {
    return this.customersService.getCustomer(organizationId, customerId);
  }

  @Patch(':customerId')
  @Permissions(Permission.CUSTOMER_UPDATE)
  @ApiOperation({ summary: 'Update a customer' })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  @ApiParam({ name: 'customerId', description: 'Customer UUID' })
  updateCustomer(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.customersService.updateCustomer(
      organizationId,
      customerId,
      dto,
    );
  }

  @Delete(':customerId')
  @Permissions(Permission.CUSTOMER_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a customer' })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  @ApiParam({ name: 'customerId', description: 'Customer UUID' })
  async deleteCustomer(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('customerId', ParseUUIDPipe) customerId: string,
  ): Promise<void> {
    await this.customersService.deleteCustomer(organizationId, customerId);
  }
}
