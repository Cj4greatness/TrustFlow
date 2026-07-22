/**
 * Centralized, typed application configuration.
 *
 * All environment variables are read in exactly one place. Nothing
 * elsewhere in the codebase should call `process.env` directly —
 * inject ConfigService and read through this structure instead. This
 * keeps configuration typed, testable, and easy to audit.
 */
export interface AppConfig {
  env: string;
  port: number;
  database: {
    host: string;
    port: number;
    username: string;
    password: string;
    name: string;
  };
  redis: {
    host: string;
    port: number;
  };
}

export default (): AppConfig => ({
  env: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '4000', 10),
  database: {
    host: process.env.DB_HOST!,
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    username: process.env.DB_USERNAME!,
    password: process.env.DB_PASSWORD!,
    name: process.env.DB_NAME!,
  },
  redis: {
    host: process.env.REDIS_HOST!,
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  },
});
