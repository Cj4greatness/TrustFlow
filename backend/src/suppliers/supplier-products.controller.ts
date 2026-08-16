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
import { SupplierProductsService } from './supplier-products.service';
import { CreateSupplierProductDto } from './dto/create-supplier-product.dto';
import { UpdateSupplierProductDto } from './dto/update-supplier-product.dto';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { Permissions } from '../authorization/decorators/permissions.decorator';
import { Permission } from '../authorization/permissions.enum';

/**
 * All four mutating operations here are gated on the single
 * SUPPLIER_PRODUCT_MANAGE permission, per Suppliers Directive v1 §6
 * — not split into per-action permissions the way Supplier itself
 * is. This is a deliberate, directive-specified granularity, not an
 * oversight.
 */
@ApiTags('suppliers')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@Controller('organizations/:id/suppliers/:supplierId/products')
export class SupplierProductsController {
  constructor(
    private readonly supplierProductsService: SupplierProductsService,
  ) {}

  @Post()
  @Permissions(Permission.SUPPLIER_PRODUCT_MANAGE)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Associate a product with a supplier' })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  @ApiParam({ name: 'supplierId', description: 'Supplier UUID' })
  addProduct(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
    @Body() dto: CreateSupplierProductDto,
  ) {
    return this.supplierProductsService.addProductToSupplier(
      organizationId,
      supplierId,
      dto,
    );
  }

  @Get()
  @Permissions(Permission.SUPPLIER_READ)
  @ApiOperation({ summary: "List a supplier's associated products" })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  @ApiParam({ name: 'supplierId', description: 'Supplier UUID' })
  listProducts(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
  ) {
    return this.supplierProductsService.listSupplierProducts(
      organizationId,
      supplierId,
    );
  }

  @Get(':associationId')
  @Permissions(Permission.SUPPLIER_READ)
  @ApiOperation({ summary: 'Get a single supplier-product association' })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  @ApiParam({ name: 'supplierId', description: 'Supplier UUID' })
  @ApiParam({ name: 'associationId', description: 'SupplierProduct UUID' })
  getAssociation(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
    @Param('associationId', ParseUUIDPipe) associationId: string,
  ) {
    return this.supplierProductsService.getSupplierProduct(
      organizationId,
      supplierId,
      associationId,
    );
  }

  @Patch(':associationId')
  @Permissions(Permission.SUPPLIER_PRODUCT_MANAGE)
  @ApiOperation({
    summary: "Update a supplier-product association's procurement data",
  })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  @ApiParam({ name: 'supplierId', description: 'Supplier UUID' })
  @ApiParam({ name: 'associationId', description: 'SupplierProduct UUID' })
  updateAssociation(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
    @Param('associationId', ParseUUIDPipe) associationId: string,
    @Body() dto: UpdateSupplierProductDto,
  ) {
    return this.supplierProductsService.updateSupplierProduct(
      organizationId,
      supplierId,
      associationId,
      dto,
    );
  }

  @Delete(':associationId')
  @Permissions(Permission.SUPPLIER_PRODUCT_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a supplier-product association' })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  @ApiParam({ name: 'supplierId', description: 'Supplier UUID' })
  @ApiParam({ name: 'associationId', description: 'SupplierProduct UUID' })
  async removeAssociation(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
    @Param('associationId', ParseUUIDPipe) associationId: string,
  ): Promise<void> {
    await this.supplierProductsService.removeProductFromSupplier(
      organizationId,
      supplierId,
      associationId,
    );
  }
}
