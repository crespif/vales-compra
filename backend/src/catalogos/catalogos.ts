import { BadRequestException, Body, Controller, ConflictException, Get, Module, NotFoundException, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { IsBoolean, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Repository } from 'typeorm';
import { Rol, Sector, Usuario } from '../database/entities';
import { AuthService, Roles, UsuarioActual, UsuarioSesion } from '../auth/auth';

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

const limpiar = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

class UsuarioDto {
  @Transform(limpiar) @IsString() @IsNotEmpty({ message: 'El legajo es obligatorio' }) @MaxLength(30) legajo: string;
  @Transform(limpiar) @IsString() @IsNotEmpty({ message: 'El nombre es obligatorio' }) @MaxLength(120) nombre: string;
  @IsString() @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' }) password: string;
  @IsEnum(Rol) rol: Rol;
  @IsInt() sectorId: number;
}

class UsuarioUpdateDto {
  @IsOptional() @Transform(limpiar) @IsString() @IsNotEmpty({ message: 'El legajo es obligatorio' }) @MaxLength(30) legajo?: string;
  @IsOptional() @Transform(limpiar) @IsString() @IsNotEmpty({ message: 'El nombre es obligatorio' }) @MaxLength(120) nombre?: string;
  @IsOptional() @IsString() @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' }) password?: string;
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
  constructor(
    @InjectRepository(Usuario) private repo: Repository<Usuario>,
    @InjectRepository(Sector) private sectores: Repository<Sector>,
  ) {}

  @Get()
  listar() {
    return this.repo.find({ relations: { sector: true }, order: { nombre: 'ASC' } });
  }

  @Post()
  async crear(@Body() dto: UsuarioDto) {
    await this.legajoLibre(dto.legajo);
    await this.sectorValido(dto.sectorId);
    const { password, ...resto } = dto;
    const u = await this.repo.save(this.repo.create({ ...resto, passwordHash: await AuthService.hash(password) }));
    return this.repo.findOneOrFail({ where: { id: u.id }, relations: { sector: true } });
  }

  /**
   * Edita cualquier dato del usuario. Protecciones:
   * - el legajo no puede repetirse;
   * - nadie puede desactivarse ni quitarse el rol de administrador a sí mismo;
   * - siempre tiene que quedar al menos un administrador activo.
   */
  @Patch(':id')
  async editar(@UsuarioActual() yo: UsuarioSesion, @Param('id', ParseIntPipe) id: number, @Body() dto: UsuarioUpdateDto) {
    const u = await this.repo.findOneBy({ id });
    if (!u) throw new NotFoundException('Usuario inexistente');
    if (dto.legajo !== undefined && dto.legajo !== u.legajo) await this.legajoLibre(dto.legajo);
    if (dto.sectorId !== undefined) await this.sectorValido(dto.sectorId);

    const dejaDeSerAdmin = u.rol === Rol.ADMIN && u.activo && ((dto.rol && dto.rol !== Rol.ADMIN) || dto.activo === false);
    if (id === yo.id && (dto.activo === false || (dto.rol && dto.rol !== yo.rol))) {
      throw new BadRequestException('No podés desactivarte ni cambiar tu propio rol. Pedíselo a otro administrador.');
    }
    if (dejaDeSerAdmin && (await this.repo.countBy({ rol: Rol.ADMIN, activo: true })) <= 1) {
      throw new BadRequestException('Tiene que quedar al menos un administrador activo.');
    }

    const { password, ...resto } = dto;
    await this.repo.update(id, { ...resto, ...(password ? { passwordHash: await AuthService.hash(password) } : {}) });
    return this.repo.findOneOrFail({ where: { id }, relations: { sector: true } });
  }

  private async legajoLibre(legajo: string) {
    if (await this.repo.existsBy({ legajo })) throw new ConflictException(`Ya existe un usuario con el legajo ${legajo}`);
  }

  private async sectorValido(id: number) {
    if (!(await this.sectores.existsBy({ id }))) throw new BadRequestException('El sector no existe');
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Sector, Usuario])],
  controllers: [SectoresController, UsuariosController],
})
export class CatalogosModule {}
