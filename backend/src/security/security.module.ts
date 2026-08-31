import { Module } from '@nestjs/common';
import { PasswordService } from './password.service';

/**
 * Houses security-related utilities shared across modules: password
 * hashing now, JWT token helpers once AuthModule needs them. Kept
 * separate from AuthModule so these primitives can be used by other
 * modules later (e.g. a future admin tool that resets a password)
 * without depending on the entire auth flow.
 */
@Module({
  providers: [PasswordService],
  exports: [PasswordService],
})
export class SecurityModule {}
