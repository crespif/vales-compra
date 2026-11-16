import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { EstadoVale } from '../database/entities';

export class ItemDto {
  @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() cantidad: number;
  @IsOptional() @IsString() @MaxLength(20) unidad?: string;
  @IsString() @IsNotEmpty() @MaxLength(200) descripcion: string;
  @IsOptional() @IsString() codigoArticulo?: string;
}

/** El empleado pide los productos. El proveedor es opcional: lo define Compras. */
export class CrearValeDto {
  @IsOptional() @IsInt() proveedorId?: number;
  @IsOptional() @IsString() @MaxLength(500) observaciones?: string;
  @ValidateNested({ each: true }) @Type(() => ItemDto) @ArrayMinSize(1) @ArrayMaxSize(30) items: ItemDto[];
  /** true = enviar directo a Compras (SOLICITADO); false = queda en BORRADOR. */
  @IsOptional() @IsBoolean() enviar?: boolean;
}

export class EditarValeDto {
  @IsOptional() @IsInt() proveedorId?: number;
  @IsOptional() @IsString() @MaxLength(500) observaciones?: string;
  @IsOptional() @ValidateNested({ each: true }) @Type(() => ItemDto) @ArrayMinSize(1) @ArrayMaxSize(30) items?: ItemDto[];
}

/** Compras completa proveedor y detalle (si hace falta) y aprueba: el vale se emite. */
export class AprobarValeDto extends EditarValeDto {
  @IsOptional() @IsString() almacenId?: string;
  @IsOptional() @IsString() ubicacionId?: string;
}

export class MotivoDto {
  @IsString() @IsNotEmpty() @MaxLength(500) motivo: string;
}

export class EntregaDto {
  @IsOptional() @IsString() @MaxLength(50) remito?: string;
}

export class FiltroValesDto {
  @IsOptional() @IsEnum(EstadoVale) estado?: EstadoVale;
  @IsOptional() @Type(() => Number) @IsInt() numero?: number;
  @IsOptional() @Type(() => Number) @IsInt() proveedorId?: number;
  @IsOptional() @Type(() => Number) @IsInt() sectorId?: number;
}
