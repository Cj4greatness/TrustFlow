import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer } from './entities/customer.entity';
import { CustomerAddress } from './entities/customer-address.entity';
import { CustomerNote } from './entities/customer-note.entity';
import { CustomersRepository } from './customers.repository';
import { CustomerAddressesRepository } from './customer-addresses.repository';
import { CustomerNotesRepository } from './customer-notes.repository';
import { CustomersService } from './customers.service';
import { CustomersController } from './customers.controller';
import { CustomerAddressesController } from './customer-addresses.controller';
import { CustomerNotesController } from './customer-notes.controller';
import { AuthorizationModule } from '../authorization/authorization.module';
import { OrganizationMembersModule } from '../organization-members/organization-members.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Customer, CustomerAddress, CustomerNote]),
    forwardRef(() => AuthorizationModule),
    forwardRef(() => OrganizationMembersModule),
  ],
  controllers: [
    CustomersController,
    CustomerAddressesController,
    CustomerNotesController,
  ],
  providers: [
    CustomersRepository,
    CustomerAddressesRepository,
    CustomerNotesRepository,
    CustomersService,
  ],
  exports: [TypeOrmModule, CustomersRepository, CustomersService],
})
export class CustomersModule {}
