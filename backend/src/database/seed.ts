import 'reflect-metadata';
import * as bcrypt from 'bcryptjs';
import { DataSource } from 'typeorm';
import { dataSourceOptions } from './data-source';
import { Parametro, Proveedor, Rol, Sector, Usuario } from './entities';

/**
 * Datos iniciales. Se puede correr las veces que haga falta: solo agrega lo que falta.
 * - Siempre: migraciones, sectores y parámetros.
 * - En producción (NODE_ENV=production): solo el usuario "admin", con la clave de
 *   SEED_ADMIN_PASSWORD. Los usuarios reales se crean después desde la web.
 * - En desarrollo: además, usuarios y proveedor de prueba.
 */
const PRODUCCION = process.env.NODE_ENV === 'production';

async function main() {
  const ds = await new DataSource(dataSourceOptions()).initialize();
  await ds.runMigrations();
  const sectores = ds.getRepository(Sector);
  for (const nombre of ['Administración', 'Compras', 'Redes', 'Sistemas', 'Talleres']) {
    if (!(await sectores.existsBy({ nombre }))) await sectores.save({ nombre });
  }
  const sec = async (nombre: string) => (await sectores.findOneByOrFail({ nombre })).id;
  const usuarios = ds.getRepository(Usuario);
  const usuario = async (legajo: string, nombre: string, rol: Rol, sector: string, pass: string) => {
    if (!(await usuarios.existsBy({ legajo }))) {
      await usuarios.save({ legajo, nombre, rol, sectorId: await sec(sector), passwordHash: await bcrypt.hash(pass, 10) });
    }
  };
  const claveAdmin = process.env.SEED_ADMIN_PASSWORD;
  if (!PRODUCCION) {
    await usuario('admin', 'Administrador', Rol.ADMIN, 'Sistemas', claveAdmin ?? 'admin1234');
    await usuario('compras', 'Jefe de Compras (demo)', Rol.COMPRAS, 'Compras', 'compras1234');
    await usuario('1001', 'Empleado de prueba', Rol.SOLICITANTE, 'Administración', 'empleado1234');

    // Proveedor de prueba para usar sin conexión a GLM. En la primera sincronización
    // con GLM queda deshabilitado, porque los proveedores reales vienen de allá.
    const provs = ds.getRepository(Proveedor);
    if (!(await provs.existsBy({ razonSocial: 'Proveedor de prueba' }))) {
      await provs.save({ razonSocial: 'Proveedor de prueba', pinHash: await bcrypt.hash('1234', 10) });
    }
  } else if (await usuarios.existsBy({ legajo: 'admin' })) {
    // ya existe: no se toca su clave
  } else if (claveAdmin && claveAdmin.length >= 8) {
    await usuario('admin', 'Administrador', Rol.ADMIN, 'Sistemas', claveAdmin);
    console.log('Usuario "admin" creado con la clave de SEED_ADMIN_PASSWORD.');
  } else {
    console.warn('No hay usuario "admin": definí SEED_ADMIN_PASSWORD (mínimo 8 caracteres) y reiniciá.');
  }
  const params = ds.getRepository(Parametro);
  for (const [clave, valor] of [
    ['glm.tipo_orden', 'VALE_COMPRA_MENOR'],
    ['glm.condicion_pago', 'CTA_CTE'],
    ['glm.moneda', 'ARS'],
  ]) {
    if (!(await params.existsBy({ clave }))) await params.save({ clave, valor });
  }
  console.log(PRODUCCION ? 'Seed listo.' : 'Seed listo. Usuarios: admin / compras / 1001 (cambiar contraseñas).');
  await ds.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
