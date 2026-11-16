import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import * as QRCode from 'qrcode';
import { Vale } from '../database/entities';

const fmtFecha = (d: Date | string | null | undefined) => {
  if (!d) return '';
  if (typeof d === 'string') return d.split('-').reverse().join('/');
  return d.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' });
};
const fmtCant = (n: number) => (Number.isInteger(n) ? String(n) : n.toLocaleString('es-AR'));

/**
 * Genera el vale en PDF con el mismo contenido que el talonario en papel,
 * más el QR de validación y las "firmas" electrónicas (aprobación y aceptación).
 */
@Injectable()
export class PdfService {
  async vale(v: Vale, urlValidacion: string): Promise<Buffer> {
    const qr = await QRCode.toBuffer(urlValidacion, { margin: 1, width: 300, errorCorrectionLevel: 'M' });
    const doc = new PDFDocument({ size: 'A5', layout: 'landscape', margin: 28, info: { Title: `Vale N° ${v.numero}` } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const fin = new Promise<Buffer>((ok) => doc.on('end', () => ok(Buffer.concat(chunks))));

    const W = doc.page.width, M = 28, ancho = W - 2 * M;

    // Encabezado
    doc.font('Helvetica-Bold').fontSize(10)
      .text('COOPERATIVA DE OBRAS, SERVICIOS PÚBLICOS Y SERVICIOS SOCIALES LTDA. DE TRES ARROYOS', M, M, { width: ancho - 140 });
    doc.font('Helvetica').fontSize(8)
      .text('Sarmiento 411 - Tel. (02983) 427024/426103 - 7500 Tres Arroyos - CUIT 30-54569092-2', M, doc.y + 2, { width: ancho - 140 });
    doc.font('Helvetica-Bold').fontSize(16).text(`N° ${v.numero}`, W - M - 140, M, { width: 140, align: 'right' });
    doc.font('Helvetica').fontSize(8).text('VALE DE COMPRA MENOR', W - M - 140, M + 20, { width: 140, align: 'right' });
    doc.moveTo(M, 72).lineTo(W - M, 72).lineWidth(0.8).stroke();

    // Datos
    let y = 82;
    const campo = (etiqueta: string, valor: string, x: number, w: number) => {
      doc.font('Helvetica').fontSize(8).fillColor('#555').text(etiqueta, x, y);
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#000').text(valor, x, y + 10, { width: w });
    };
    campo('SECCIÓN', v.sector?.nombre ?? '', M, 180);
    campo('FECHA', fmtFecha(v.emitidoEn), M + 200, 120);
    campo('VÁLIDO HASTA', fmtFecha(v.fechaVigencia), M + 330, 120);
    y += 32;
    campo('SEÑOR (PROVEEDOR)', v.proveedor?.razonSocial ?? '', M, 400);
    y += 32;
    doc.font('Helvetica').fontSize(8.5).fillColor('#000').text(
      'Rogamos a Ud. quiera otorgar al portador de la presente los artículos que se detallan a continuación, ' +
        'cuyo importe se servirá cargar en cuenta de la CELTA. Al facturar, indique el número de este vale.',
      M, y, { width: ancho - 120 },
    );

    // QR
    doc.image(qr, W - M - 100, 112, { width: 100 });
    doc.font('Helvetica').fontSize(6.5).text('Escanee para validar', W - M - 100, 214, { width: 100, align: 'center' });

    // Ítems
    y = 182;
    doc.rect(M, y, ancho - 120, 16).fill('#eeeeee').fillColor('#000');
    doc.font('Helvetica-Bold').fontSize(8.5).text('CANT.', M + 6, y + 4).text('DETALLE', M + 70, y + 4);
    y += 20;
    doc.font('Helvetica').fontSize(9.5);
    for (const it of v.items ?? []) {
      const cant = `${fmtCant(it.cantidad)}${it.unidad ? ' ' + it.unidad : ''}`;
      doc.text(cant, M + 6, y, { width: 60 });
      doc.text(it.descripcion, M + 70, y, { width: ancho - 200 });
      y = doc.y + 4;
      doc.moveTo(M, y - 2).lineTo(M + ancho - 120, y - 2).lineWidth(0.3).strokeColor('#bbb').stroke().strokeColor('#000');
    }
    if (v.observaciones) {
      doc.font('Helvetica-Oblique').fontSize(8).text(`Obs.: ${v.observaciones}`, M + 6, y + 2, { width: ancho - 130 });
    }

    // Firmas electrónicas
    const yF = doc.page.height - M - 46;
    doc.moveTo(M, yF).lineTo(W - M, yF).lineWidth(0.5).stroke();
    doc.font('Helvetica').fontSize(7.5).fillColor('#555');
    doc.text('AUTORIZÓ (Compras)', M, yF + 6);
    doc.text('RETIRA (empleado)', M + ancho / 2, yF + 6);
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#000');
    doc.text(v.aprobadoPor ? `${v.aprobadoPor.nombre} — ${fmtFecha(v.aprobadoEn)}` : '', M, yF + 17);
    doc.text(
      v.solicitante ? `${v.solicitante.nombre} (leg. ${v.solicitante.legajo})${v.aceptadoEn ? ' — aceptado ' + fmtFecha(v.aceptadoEn) : ' — pendiente de aceptar'}` : '',
      M + ancho / 2, yF + 17, { width: ancho / 2 },
    );
    doc.font('Helvetica').fontSize(6.5).fillColor('#777')
      .text('Firmas electrónicas registradas en el sistema de vales de CELTA, con fecha, hora y usuario.', M, yF + 34);

    doc.end();
    return fin;
  }
}
