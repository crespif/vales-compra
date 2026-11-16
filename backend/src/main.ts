import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { AppModule } from './app.module';

export function configurar<T extends import('@nestjs/common').INestApplication>(app: T): T {
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableCors();
  return app;
}

export async function bootstrap() {
  const secreto = process.env.JWT_SECRET ?? '';
  if (process.env.NODE_ENV === 'production' && (secreto.length < 32 || /cambiar|pegar/i.test(secreto))) {
    throw new Error('Falta definir JWT_SECRET en el .env: una clave aleatoria de al menos 32 caracteres');
  }
  const app = configurar(await NestFactory.create<NestExpressApplication>(AppModule));
  // Detrás de un proxy inverso (Nginx/Caddy/túnel) para obtener la IP real del cliente
  const express = app.getHttpAdapter().getInstance() as any;
  express.set('trust proxy', 1);

  // Sirve la web (frontend/dist) en "/", así la app y la API se publican juntas.
  const web = [process.env.FRONTEND_DIR, resolve(__dirname, '../web'), resolve(__dirname, '../../frontend/dist')]
    .filter((d): d is string => !!d)
    .map((d) => resolve(d))
    .find((d) => existsSync(resolve(d, 'index.html')));
  if (web) {
    app.useStaticAssets(web, { index: 'index.html', maxAge: '1h' });
    console.log(`Sirviendo la web desde ${web}`);
  }
  // En cPanel (Passenger) el puerto lo asigna Passenger; localmente se usa PORT.
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`API de vales escuchando en http://localhost:${port}`);
}

if (require.main === module) bootstrap();
