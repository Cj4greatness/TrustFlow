import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { LoggerModule } from 'nestjs-pino';
import { HealthModule } from './health/health.module';
import { RedisModule } from './redis/redis.module';
import { UsersModule } from './users/users.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { OrganizationMembersModule } from './organization-members/organization-members.module';
import { CustomersModule } from './customers/customers.module';
import { ProductsModule } from './products/products.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { OrdersModule } from './orders/orders.module';
import { InvoicesModule } from './invoices/invoices.module';
import { PaymentsModule } from './payments/payments.module';
import { ReceiptSettingsModule } from './receipt-settings/receipt-settings.module';
import { ReceiptsModule } from './receipts/receipts.module';
import { DeliveriesModule } from './deliveries/deliveries.module';
import { AuditModule } from './audit/audit.module';
import { SecurityModule } from './security/security.module';
import { AuthModule } from './auth/auth.module';
import { AuthorizationModule } from './authorization/authorization.module';
import configuration from './config/configuration';
import { envValidationSchema } from './config/env.validation';
@Module({
  imports: [
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        pinoHttp: {
          level:
            configService.get<string>('env') === 'production'
              ? 'info'
              : 'debug',
          transport:
            configService.get<string>('env') !== 'production'
              ? {
                  target: 'pino-pretty',
                  options: {
                    colorize: true,
                    singleLine: true,
                  },
                }
              : undefined,
          redact: ['req.headers.authorization', 'req.headers.cookie'],
        },
      }),
    }),
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema: envValidationSchema,
      validationOptions: {
        abortEarly: false,
      },
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT ?? '5432', 10),
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      entities: [],
      synchronize: false,
      autoLoadEntities: true,
    }),
    EventEmitterModule.forRoot(),
    RedisModule,
    HealthModule,
    UsersModule,
    OrganizationsModule,
    OrganizationMembersModule,
    CustomersModule,
    ProductsModule,
    SuppliersModule,
    OrdersModule,
    InvoicesModule,
    PaymentsModule,
    ReceiptSettingsModule,
    ReceiptsModule,
    DeliveriesModule,
    AuditModule,
    SecurityModule,
    AuthModule,
    AuthorizationModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
