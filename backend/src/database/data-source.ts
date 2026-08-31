import { DataSource, DataSourceOptions } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

/**
 * Shared TypeORM DataSource configuration, used both by the running
 * NestJS application (via TypeOrmModule) and by the TypeORM CLI for
 * generating/running migrations — kept in one place to avoid drift
 * between the two.
 */
export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'trustflow',
  password: process.env.DB_PASSWORD || 'trustflow',
  database: process.env.DB_NAME || 'trustflow',
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
};

const dataSource = new DataSource(dataSourceOptions);
export default dataSource;
