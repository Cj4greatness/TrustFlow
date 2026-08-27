import * as Joi from 'joi';

/**
 * Validates all required environment variables at application
 * startup. If any are missing or malformed, the app fails to boot
 * immediately with a clear error — rather than failing confusingly
 * later (e.g. a bad DB_PORT silently becoming NaN).
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(4000),

  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().default(5432),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_NAME: Joi.string().required(),

  REDIS_HOST: Joi.string().required(),
  REDIS_PORT: Joi.number().default(6379),

  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),

  // Optional: if unset, the AI Gateway falls back to a placeholder
  // provider that fails loud on use rather than silently no-op'ing.
  // Not required at boot so existing dev/CI environments without a
  // key keep working.
  ANTHROPIC_API_KEY: Joi.string().optional(),
  ANTHROPIC_MODEL: Joi.string().default('claude-sonnet-4-6'),
});
