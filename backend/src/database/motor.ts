import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Carga backend/.env (sin pisar variables ya definidas) y expone lo que cambia
 * entre PostgreSQL y MariaDB/MySQL. Se importa antes que las entidades, porque
 * los tipos de columna dependen del motor.
 */
function cargarEnv() {
  const archivo = resolve(process.cwd(), '.env');
  if (!existsSync(archivo)) return;
  for (const linea of readFileSync(archivo, 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    let v = m[2];
    if (/^(['"]).*\1$/.test(v)) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, '');
    process.env[m[1]] = v;
  }
}
cargarEnv();

export type Motor = 'postgres' | 'mariadb';
export const MOTOR: Motor = /^(maria|mysql)/i.test(process.env.DB_TYPE ?? '') ? 'mariadb' : 'postgres';
export const esMaria = MOTOR === 'mariadb';

/** Tipo de columna para fecha y hora. */
export const TS = esMaria ? 'datetime' : 'timestamptz';

/** Comparación de texto sin distinguir mayúsculas (en MariaDB, LIKE ya lo hace por la collation). */
export const ILIKE = esMaria ? 'LIKE' : 'ILIKE';

/** Próximo número de vale (secuencia vale_numero_seq). */
export const SQL_NEXTVAL = esMaria
  ? 'SELECT CAST(NEXTVAL(vale_numero_seq) AS UNSIGNED) AS nextval'
  : `SELECT nextval('vale_numero_seq')::int AS nextval`;

/** Ajusta la secuencia para continuar la serie del talonario. */
export const sqlSetval = (n: number) =>
  esMaria ? `SELECT SETVAL(vale_numero_seq, ${Number(n)})` : `SELECT setval('vale_numero_seq', ${Number(n)})`;

/** "columna anterior a hoy menos :dias días". */
export const haceDias = (col: string) =>
  esMaria ? `${col} < DATE_SUB(NOW(), INTERVAL :dias DAY)` : `${col} < now() - make_interval(days => :dias)`;
