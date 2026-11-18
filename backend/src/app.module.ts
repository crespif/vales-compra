import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth';
import { CatalogosModule } from './catalogos/catalogos';
import { dataSourceOptions } from './database/data-source';
import { FacturasModule } from './facturas/facturas';
import { GlmModule } from './glm/glm';
import { NotificacionesModule } from './notificaciones/notificaciones';
import { PublicoModule } from './publico/publico';
import { ValesModule } from './vales/vales.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({ useFactory: () => ({ ...dataSourceOptions(), migrationsRun: true }) }),
    AuthModule,
    CatalogosModule,
    GlmModule,
    NotificacionesModule,
    ValesModule,
    PublicoModule,
    FacturasModule,
  ],
})
export class AppModule {}
