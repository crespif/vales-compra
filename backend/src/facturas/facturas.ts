import { BadRequestException, Body, ConflictException, Controller, Get, Ip, Module, Post, Query } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Type } from 'class-transformer';
import { ArrayMinSize, ArrayUnique, IsDateString, IsInt, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';
import { DataSource, In } from 'typeorm';
import { Roles, UsuarioActual, UsuarioSesion } from '../auth/auth';
import { Canal, EstadoVale as E, Factura, FacturaVale, Rol, Vale } from '../database/entities';
import { haceDias } from '../database/motor';
import { ValesModule } from '../vales/vales.module';
import { ValesService } from '../vales/vales.service';

class FacturaDto {
  @IsInt() proveedorId: number;
  @IsString() @IsNotEmpty() @MaxLength(30) numero: string;
  @IsDateString() fecha: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() importe: number;
  /** Números de vale que cita la factura. */
  @IsInt({ each: true }) @ArrayMinSize(1) @ArrayUnique() vales: number[];
}

class FiltroPendientesDto {
  @IsOptional() @Type(() => Number) @IsInt() dias?: number;
}

@Roles(Rol.COMPRAS)
@Controller('facturas')
export class FacturasController {
  constructor(@InjectDataSource() private ds: DataSource, private vales: ValesService) {}

  /** Registra la factura y concilia los vales que cita. Todo o nada. */
  @Post()
  registrar(@UsuarioActual() u: UsuarioSesion, @Ip() ip: string, @Body() dto: FacturaDto) {
    return this.ds.transaction(async (m) => {
      if (await m.existsBy(Factura, { proveedorId: dto.proveedorId, numero: dto.numero })) {
        throw new ConflictException('Esa factura ya está registrada para ese proveedor');
      }
      const vales = await m.find(Vale, { where: { numero: In(dto.vales) } });
      const problemas: string[] = [];
      for (const n of dto.vales) {
        const v = vales.find((x) => x.numero === n);
        if (!v) problemas.push(`N° ${n}: no existe`);
        else if (v.proveedorId !== dto.proveedorId) problemas.push(`N° ${n}: es de otro proveedor`);
        else if (v.estado === E.CONCILIADO) problemas.push(`N° ${n}: ya está conciliado con otra factura`);
        else if (v.estado !== E.ENTREGADO) problemas.push(`N° ${n}: está ${v.estado}, falta registrar la entrega`);
      }
      if (problemas.length) throw new BadRequestException({ message: 'No se puede conciliar', problemas });

      const f = await m.save(
        m.create(Factura, {
          proveedorId: dto.proveedorId,
          numero: dto.numero,
          fecha: dto.fecha,
          importe: dto.importe,
          cargadoPorId: u.id,
        }),
      );
      await m.insert(FacturaVale, vales.map((v) => ({ facturaId: f.id, valeId: v.id })));
      await this.vales.conciliar(m, vales.map((v) => v.id), { usuario: u, canal: Canal.WEB, ip }, `Factura ${dto.numero}`);
      return m.findOneOrFail(Factura, { where: { id: f.id }, relations: { proveedor: true, vales: { vale: true } } });
    });
  }

  @Get()
  listar() {
    return this.ds.getRepository(Factura).find({
      relations: { proveedor: true, vales: { vale: true } },
      order: { fecha: 'DESC', id: 'DESC' },
      take: 200,
    });
  }

  /** Vales entregados hace más de N días (por defecto 30) que siguen sin factura. */
  @Get('pendientes')
  pendientes(@Query() f: FiltroPendientesDto) {
    const dias = f.dias ?? 30;
    return this.ds
      .getRepository(Vale)
      .createQueryBuilder('v')
      .leftJoinAndSelect('v.proveedor', 'p')
      .leftJoinAndSelect('v.sector', 's')
      .where('v.estado = :e', { e: E.ENTREGADO })
      .andWhere(haceDias('v.entregado_en'), { dias })
      .orderBy('v.entregadoEn', 'ASC')
      .getMany();
  }
}

@Module({ imports: [ValesModule], controllers: [FacturasController] })
export class FacturasModule {}
