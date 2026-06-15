import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

const ROUNDS = 10;

/** Bcrypt hashing for passwords and opaque tokens. */
@Injectable()
export class PasswordService {
  hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, ROUNDS);
  }

  compare(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }
}
