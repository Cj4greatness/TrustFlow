import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

/**
 * Wraps Argon2 for password hashing and verification. Isolating this
 * behind a service — rather than calling argon2 directly from
 * AuthService — means the hashing algorithm can change later (e.g.
 * a future migration to a different Argon2 configuration or an
 * entirely different algorithm) without touching call sites.
 *
 * Uses argon2id (the default variant), which balances resistance to
 * both GPU cracking attacks and side-channel attacks — the
 * recommended choice for password hashing per current OWASP guidance.
 */
@Injectable()
export class PasswordService {
  hash(plainTextPassword: string): Promise<string> {
    return argon2.hash(plainTextPassword);
  }

  verify(hash: string, plainTextPassword: string): Promise<boolean> {
    return argon2.verify(hash, plainTextPassword);
  }
}
