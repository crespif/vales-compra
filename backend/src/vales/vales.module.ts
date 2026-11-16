import { Body, Controller, Get, Ip, Module, NotFoundException, Param, ParseIntPipe, Patch, Post, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { Roles, UsuarioActual, UsuarioSesion } from '../auth/auth';
import { Canal, Rol } from '../database/entities';
import { PdfService } from '../pdf/pdf.service';
import { AprobarValeDto, CrearValeDto, EditarValeDto, EntregaDto, FiltroValesDto, MotivoDto } from './vales.dto';
import { Actor, ValesService } from './vales.service';

const web = (usuario: UsuarioSesion, ip?: string): Actor => ({ usuario, canal: Canal.WEB, ip });

@Controller('vales')
export class ValesController {
  constructor(private vales: ValesService, private pdf: PdfService, private config: ConfigService) {}

  @Get()
  listar(@UsuarioActual() u: UsuarioSesion, @Query() f: FiltroValesDto) {
    return this.vales.listar(u, f);
  }

  @Get(':id')
  obtener(@UsuarioActual() u: UsuarioSesion, @Param('id', ParseIntPipe) id: number) {
    return this.vales.obtener(u, id);
  }

  @Get(':id/pdf')
  async pdfVale(@UsuarioActual() u: UsuarioSesion, @Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const v = await this.vales.obtener(u, id);
    const token = await this.vales.tokenDe(id);
    if (!v.numero || !token) throw new NotFoundException('El vale todavía no fue emitido');
    const buf = await this.pdf.vale(v, this.urlValidacion(token));
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="vale-${v.numero}.pdf"` }).send(buf);
  }

  /** Link de validación (lo que codifica el QR), para compartir por WhatsApp o mail. */
  @Get(':id/link')
  async link(@UsuarioActual() u: UsuarioSesion, @Param('id', ParseIntPipe) id: number) {
    await this.vales.obtener(u, id);
    const token = await this.vales.tokenDe(id);
    if (!token) throw new NotFoundException('El vale todavía no fue emitido');
    return { url: this.urlValidacion(token) };
  }

  // --- Solicitante ---

  @Post()
  crear(@UsuarioActual() u: UsuarioSesion, @Ip() ip: string, @Body() dto: CrearValeDto) {
    return this.vales.crear(web(u, ip), dto);
  }

  @Patch(':id')
  editar(@UsuarioActual() u: UsuarioSesion, @Ip() ip: string, @Param('id', ParseIntPipe) id: number, @Body() dto: EditarValeDto) {
    return this.vales.editar(web(u, ip), id, dto);
  }

  @Post(':id/enviar')
  enviar(@UsuarioActual() u: UsuarioSesion, @Ip() ip: string, @Param('id', ParseIntPipe) id: number) {
    return this.vales.enviar(web(u, ip), id);
  }

  @Post(':id/aceptar')
  aceptar(@UsuarioActual() u: UsuarioSesion, @Ip() ip: string, @Param('id', ParseIntPipe) id: number) {
    return this.vales.aceptar(web(u, ip), id);
  }

  @Post(':id/anular')
  anular(@UsuarioActual() u: UsuarioSesion, @Ip() ip: string, @Param('id', ParseIntPipe) id: number, @Body() dto: MotivoDto) {
    return this.vales.anular(web(u, ip), id, dto.motivo);
  }

  // --- Compras ---

  @Roles(Rol.COMPRAS)
  @Post(':id/aprobar')
  aprobar(@UsuarioActual() u: UsuarioSesion, @Ip() ip: string, @Param('id', ParseIntPipe) id: number, @Body() dto: AprobarValeDto) {
    return this.vales.aprobar(web(u, ip), id, dto, Number(this.config.get('VIGENCIA_DIAS') ?? 7));
  }

  @Roles(Rol.COMPRAS)
  @Post(':id/rechazar')
  rechazar(@UsuarioActual() u: UsuarioSesion, @Ip() ip: string, @Param('id', ParseIntPipe) id: number, @Body() dto: MotivoDto) {
    return this.vales.rechazar(web(u, ip), id, dto.motivo);
  }

  /** Por si el proveedor no escaneó el QR: Compras registra la entrega a mano. */
  @Roles(Rol.COMPRAS)
  @Post(':id/entrega')
  entrega(@UsuarioActual() u: UsuarioSesion, @Ip() ip: string, @Param('id', ParseIntPipe) id: number, @Body() dto: EntregaDto) {
    return this.vales.registrarEntrega(web(u, ip), id, dto.remito);
  }

  private urlValidacion(token: string) {
    return `${this.config.get('PUBLIC_BASE_URL') ?? 'http://localhost:3000'}/v/${token}`;
  }
}

@Module({
  controllers: [ValesController],
  providers: [ValesService, PdfService],
  exports: [ValesService],
})
export class ValesModule {}
