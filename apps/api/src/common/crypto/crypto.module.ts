// apps/api/src/common/crypto/crypto.module.ts
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FieldCipherService, createFieldCipherFromEnv } from './field-cipher';

@Global()
@Module({
  providers: [
    {
      provide: FieldCipherService,
      useFactory: (config: ConfigService) =>
        createFieldCipherFromEnv({
          KYC_ENC_KEY: config.get<string>('KYC_ENC_KEY'),
        }),
      inject: [ConfigService],
    },
  ],
  exports: [FieldCipherService],
})
export class CryptoModule {}
