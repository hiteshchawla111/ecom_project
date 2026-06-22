import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { parseOrigins } from './common/config/cors';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // API serves JSON; helmet defaults are sufficient — no custom CSP needed.
  app.use(helmet());

  app.enableCors({ origin: parseOrigins(process.env.CORS_ORIGINS) });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
