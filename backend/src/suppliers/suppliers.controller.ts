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
import { SuppliersService } from './suppliers.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { SupplierQueryDto } from './dto/supplier-query.dto';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { Permissions } from '../authorization/decorators/permissions.decorator';
import { Permission } from '../authorization/permissions.enum';

interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}

@ApiTags('suppliers')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@Controller('organizations/:id/suppliers')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Post()
  @Permissions(Permission.SUPPLIER_CREATE)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a supplier' })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  createSupplier(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Body() dto: CreateSupplierDto,
    @Req() req: RequestWithUser,
  ) {
    return this.suppliersService.createSupplier(
      organizationId,
      dto,
      req.user.id,
    );
  }

  @Get()
  @Permissions(Permission.SUPPLIER_READ)
  @ApiOperation({ summary: 'List suppliers in an organization' })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  listSuppliers(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Query() query: SupplierQueryDto,
  ) {
    return this.suppliersService.listSuppliers(organizationId, query);
  }

  @Get(':supplierId')
  @Permissions(Permission.SUPPLIER_READ)
  @ApiOperation({ summary: 'Get a single supplier' })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  @ApiParam({ name: 'supplierId', description: 'Supplier UUID' })
  getSupplier(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
  ) {
    return this.suppliersService.getSupplier(organizationId, supplierId);
  }

  @Patch(':supplierId')
  @Permissions(Permission.SUPPLIER_UPDATE)
  @ApiOperation({ summary: 'Update a supplier' })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  @ApiParam({ name: 'supplierId', description: 'Supplier UUID' })
  updateSupplier(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
    @Body() dto: UpdateSupplierDto,
  ) {
    return this.suppliersService.updateSupplier(
      organizationId,
      supplierId,
      dto,
    );
  }

  @Delete(':supplierId')
  @Permissions(Permission.SUPPLIER_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a supplier' })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  @ApiParam({ name: 'supplierId', description: 'Supplier UUID' })
  async deleteSupplier(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
  ): Promise<void> {
    await this.suppliersService.deleteSupplier(organizationId, supplierId);
  }
}
