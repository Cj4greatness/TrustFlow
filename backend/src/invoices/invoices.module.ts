import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Invoice } from './entities/invoice.entity';
import { InvoiceLineItem } from './entities/invoice-line-item.entity';
import { InvoiceCounter } from './entities/invoice-counter.entity';
import { InvoicesRepository } from './invoices.repository';
import { InvoicesService } from './invoices.service';
import { InvoicesController } from './invoices.controller';
import { AuthorizationModule } from '../authorization/authorization.module';
import { OrganizationMembersModule } from '../organization-members/organization-members.module';

/**
 * InvoicesModule
 *
 * InvoicesService.createInvoiceForOrder() takes an already-fetched
 *Order as a parameter — the caller (OrdersService.confirmOrder())
 *fetches it and passes it in directly, inside its own transaction.
 *InvoicesModule does NOT register Order via TypeOrmModule and never
 *reads it through an injected EntityManager; it has no repository
 *ownership of Order and does not import OrdersModule, avoiding a
 *circular dependency between Orders and Invoices.
 *AuthorizationModule + OrganizationMembersModule (both forwardRef,
 *matching OrdersModule's exact pair) were both missing until the
 *Finance e2e suite surfaced it in two rounds — PermissionsGuard
 *needs AuthorizationService AND OrganizationMembersRepository.
 *TypeScript's compiler has no visibility into DI resolution, so
 *this compiled cleanly the whole time despite being unable to boot.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Invoice, InvoiceLineItem, InvoiceCounter]),
    forwardRef(() => AuthorizationModule),
    forwardRef(() => OrganizationMembersModule),
  ],
  controllers: [InvoicesController],
  providers: [InvoicesService, InvoicesRepository],
  exports: [InvoicesService],
})
export class InvoicesModule {}
