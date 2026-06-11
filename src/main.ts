import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api', { exclude: ['auth/google', 'auth/google/callback'] });
  app.enableCors({ origin: process.env.CLIENT_URL, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );
  const port = Number(process.env.PORT) || 3000;
  await app.listen(port);
}
bootstrap();
