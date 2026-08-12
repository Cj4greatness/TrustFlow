import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
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
import { CreateCustomerNoteDto } from './dto/create-customer-note.dto';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { Permissions } from '../authorization/decorators/permissions.decorator';
import { Permission } from '../authorization/permissions.enum';

interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}

/**
 * No PATCH/DELETE routes — CustomerNote is append-only by design
 * (see the entity's doc comment and CustomerNotesRepository, which
 * exposes no update/delete methods to back one anyway).
 */
@ApiTags('customers')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@Controller('organizations/:id/customers/:customerId/notes')
export class CustomerNotesController {
  constructor(private readonly customersService: CustomersService) {}

  @Post()
  @Permissions(Permission.CUSTOMER_NOTE_CREATE)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a note to a customer' })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  @ApiParam({ name: 'customerId', description: 'Customer UUID' })
  addNote(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Body() dto: CreateCustomerNoteDto,
    @Req() req: RequestWithUser,
  ) {
    return this.customersService.addNote(
      organizationId,
      customerId,
      dto,
      req.user.id,
    );
  }

  @Get()
  @Permissions(Permission.CUSTOMER_NOTE_READ)
  @ApiOperation({ summary: "List a customer's notes" })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  @ApiParam({ name: 'customerId', description: 'Customer UUID' })
  listNotes(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('customerId', ParseUUIDPipe) customerId: string,
  ) {
    return this.customersService.listNotes(organizationId, customerId);
  }
}
