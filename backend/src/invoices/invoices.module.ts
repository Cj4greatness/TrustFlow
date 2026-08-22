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
 * Order is imported into the feature module via TypeOrmModule so
 * InvoicesService can read it through the injected EntityManager
 * inside its transaction, without owning Order's repository or
 * importing OrdersModule wholesale — avoids a circular dependency
 * between Orders and Invoices.
 *
 * AuthorizationModule + OrganizationMembersModule (both forwardRef,
 * matching OrdersModule's exact pair) were both missing until the
 * Finance e2e suite surfaced it in two rounds — PermissionsGuard
 * needs AuthorizationService AND OrganizationMembersRepository.
 * TypeScript's compiler has no visibility into DI resolution, so
 * this compiled cleanly the whole time despite being unable to boot.
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
