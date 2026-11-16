import 'reflect-metadata';
import { DataSource, DataSourceOptions } from 'typeorm';
import { esMaria } from './motor'; // carga .env antes que las entidades
import { ENTITIES } from './entities';

/** Configuración compartida por la app y por el CLI de migraciones. */
// DB_TYPE=postgres (por defecto) o DB_TYPE=mariadb (también sirve para MySQL).
export const dataSourceOptions = (): DataSourceOptions =>
  esMaria
    ? {
        type: 'mariadb',
        url: process.env.DATABASE_URL ?? 'mysql://vales:vales@localhost:3306/vales',
        charset: 'utf8mb4_unicode_ci',
        timezone: 'Z', // fechas guardadas en UTC
        dateStrings: ['DATE'], // las columnas DATE vuelven como 'YYYY-MM-DD', igual que en Postgres
        entities: ENTITIES,
        migrations: [__dirname + '/migrations/mariadb/*.{js,ts}'],
        synchronize: false,
      }
    : {
        type: 'postgres',
        url: process.env.DATABASE_URL ?? 'postgresql://vales:vales@localhost:5432/vales',
        entities: ENTITIES,
        migrations: [__dirname + '/migrations/postgres/*.{js,ts}'],
        synchronize: false,
      };

export default new DataSource(dataSourceOptions());
