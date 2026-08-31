import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
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
import { InventoryService } from './inventory.service';
import { AdjustInventoryDto } from './dto/adjust-inventory.dto';
import { InventoryMovementQueryDto } from './dto/inventory-movement-query.dto';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { Permissions } from '../authorization/decorators/permissions.decorator';
import { Permission } from '../authorization/permissions.enum';

interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}

/**
 * Route order matters: /movements must be registered before the
 * bare GET / handler is ambiguous with anything — Nest resolves by
 * declaration + specificity here since both are literal path
 * segments (movements, adjustments), not conflicting param routes,
 * so no actual ambiguity exists, but keeping /adjustments and
 * /movements grouped together below the bare inventory read for
 * readability.
 *
 * The /movements route isn't explicitly listed in Directive v1 §13's
 * route examples — it's added because the audit trail InventoryMovement
 * exists to build (§7) needs a read path, and no other route exposes
 * it. Flag if a different location/shape was intended.
 */
@ApiTags('inventory')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@Controller('organizations/:id/products/:productId/inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  @Permissions(Permission.INVENTORY_READ)
  @ApiOperation({ summary: "Get a product's current inventory" })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  @ApiParam({ name: 'productId', description: 'Product UUID' })
  getInventory(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
  ) {
    return this.inventoryService.getInventory(organizationId, productId);
  }

  @Post('adjustments')
  @Permissions(Permission.INVENTORY_ADJUST)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Apply an ADD/REMOVE inventory adjustment' })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  @ApiParam({ name: 'productId', description: 'Product UUID' })
  adjustInventory(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: AdjustInventoryDto,
    @Req() req: RequestWithUser,
  ) {
    return this.inventoryService.adjustInventory(
      organizationId,
      productId,
      dto,
      req.user.id,
    );
  }

  @Get('movements')
  @Permissions(Permission.INVENTORY_READ)
  @ApiOperation({ summary: "List a product's inventory movement history" })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  @ApiParam({ name: 'productId', description: 'Product UUID' })
  listMovements(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Query() query: InventoryMovementQueryDto,
  ) {
    return this.inventoryService.listMovements(
      organizationId,
      productId,
      query,
    );
  }
}
