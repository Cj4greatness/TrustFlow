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
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { Permissions } from '../authorization/decorators/permissions.decorator';
import { Permission } from '../authorization/permissions.enum';

interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}

/**
 * PermissionsGuard confirms the actor has the required permission
 * within :id — it does NOT confirm the target product belongs to
 * that organization. That's enforced in ProductsService via
 * getOwnedProductOrThrow, mirroring CustomersController's documented
 * precedent exactly.
 */
@ApiTags('products')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@Controller('organizations/:id/products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @Permissions(Permission.PRODUCT_CREATE)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a product (auto-provisions its Inventory)' })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  createProduct(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Body() dto: CreateProductDto,
    @Req() req: RequestWithUser,
  ) {
    return this.productsService.createProduct(organizationId, dto, req.user.id);
  }

  @Get()
  @Permissions(Permission.PRODUCT_READ)
  @ApiOperation({ summary: 'List products in an organization' })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  listProducts(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Query() query: ProductQueryDto,
  ) {
    return this.productsService.listProducts(organizationId, query);
  }

  @Get(':productId')
  @Permissions(Permission.PRODUCT_READ)
  @ApiOperation({ summary: 'Get a single product' })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  @ApiParam({ name: 'productId', description: 'Product UUID' })
  getProduct(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
  ) {
    return this.productsService.getProduct(organizationId, productId);
  }

  @Patch(':productId')
  @Permissions(Permission.PRODUCT_UPDATE)
  @ApiOperation({ summary: 'Update a product' })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  @ApiParam({ name: 'productId', description: 'Product UUID' })
  updateProduct(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.updateProduct(organizationId, productId, dto);
  }

  @Delete(':productId')
  @Permissions(Permission.PRODUCT_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete (archive-eligible) a product' })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  @ApiParam({ name: 'productId', description: 'Product UUID' })
  async deleteProduct(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
  ): Promise<void> {
    await this.productsService.deleteProduct(organizationId, productId);
  }
}
