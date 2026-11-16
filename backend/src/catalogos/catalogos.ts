import { Body, Controller, Get, Module, Param, ParseIntPipe, Patch, Post, ConflictException } from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { IsBoolean, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { Repository } from 'typeorm';
import { Rol, Sector, Usuario } from '../database/entities';
import { AuthService, Roles } from '../auth/auth';

// ---------- DTOs ----------

class SectorDto {
  @IsString() @IsNotEmpty() nombre: string;
  @IsOptional() @IsBoolean() activo?: boolean;
  @IsOptional() @IsString() almacenDefaultId?: string;
  @IsOptional() @IsString() ubicacionDefaultId?: string;
}

class SectorUpdateDto {
  @IsOptional() @IsString() @IsNotEmpty() nombre?: string;
  @IsOptional() @IsBoolean() activo?: boolean;
  @IsOptional() @IsString() almacenDefaultId?: string;
  @IsOptional() @IsString() ubicacionDefaultId?: string;
}

class UsuarioDto {
  @IsString() @IsNotEmpty() legajo: string;
  @IsString() @IsNotEmpty() nombre: string;
  @IsString() @MinLength(8) password: string;
  @IsEnum(Rol) rol: Rol;
  @IsInt() sectorId: number;
}

class UsuarioUpdateDto {
  @IsOptional() @IsString() nombre?: string;
  @IsOptional() @IsString() @MinLength(8) password?: string;
  @IsOptional() @IsEnum(Rol) rol?: Rol;
  @IsOptional() @IsInt() sectorId?: number;
  @IsOptional() @IsBoolean() activo?: boolean;
}

// ---------- Controladores ----------

@Controller('sectores')
export class SectoresController {
  constructor(@InjectRepository(Sector) private repo: Repository<Sector>) {}

  @Get()
  listar() {
    return this.repo.find({ where: { activo: true }, order: { nombre: 'ASC' } });
  }

  @Roles(Rol.ADMIN)
  @Post()
  crear(@Body() dto: SectorDto) {
    return this.repo.save(this.repo.create(dto));
  }

  @Roles(Rol.ADMIN)
  @Patch(':id')
  async editar(@Param('id', ParseIntPipe) id: number, @Body() dto: SectorUpdateDto) {
    await this.repo.update(id, dto);
    return this.repo.findOneByOrFail({ id });
  }
}

@Roles(Rol.ADMIN)
@Controller('usuarios')
export class UsuariosController {
  constructor(@InjectRepository(Usuario) private repo: Repository<Usuario>) {}

  @Get()
  listar() {
    return this.repo.find({ relations: { sector: true }, order: { nombre: 'ASC' } });
  }

  @Post()
  async crear(@Body() dto: UsuarioDto) {
    if (await this.repo.existsBy({ legajo: dto.legajo })) throw new ConflictException('Ya existe un usuario con ese legajo');
    const { password, ...resto } = dto;
    const u = await this.repo.save(this.repo.create({ ...resto, passwordHash: await AuthService.hash(password) }));
    return this.repo.findOneByOrFail({ id: u.id });
  }

  @Patch(':id')
  async editar(@Param('id', ParseIntPipe) id: number, @Body() dto: UsuarioUpdateDto) {
    const { password, ...resto } = dto;
    await this.repo.update(id, { ...resto, ...(password ? { passwordHash: await AuthService.hash(password) } : {}) });
    return this.repo.findOneByOrFail({ id });
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Sector, Usuario])],
  controllers: [SectoresController, UsuariosController],
})
export class CatalogosModule {}
