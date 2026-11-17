import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/** Identidad de CELTA para la página del QR y el PDF. */
export const VERDE = '#00792c';
export const GRIS = '#d9dadc';

const archivo = join(__dirname, 'assets', 'logo.png');
/** Logo en PNG (o null si no está el archivo, para no romper nada). */
export const LOGO_PNG: Buffer | null = existsSync(archivo) ? readFileSync(archivo) : null;
export const LOGO_DATA_URL = LOGO_PNG ? `data:image/png;base64,${LOGO_PNG.toString('base64')}` : '';
