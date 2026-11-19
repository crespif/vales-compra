/**
 * Prueba el circuito completo contra una base Postgres real:
 * pedido → aprobación/emisión → aceptación del empleado → entrega por QR → factura → conciliación.
 * Requiere DATABASE_URL_TEST (por defecto postgresql://vales:vales@localhost:5432/vales_test).
 */
const MARIA = /^(maria|mysql)/i.test(process.env.DB_TYPE ?? '');
process.env.DATABASE_URL =
  process.env.DATABASE_URL_TEST ??
  (MARIA ? 'mysql://vales:vales@localhost:3306/vales_test' : 'postgresql://vales:vales@localhost:5432/vales_test');
process.env.JWT_SECRET = 'test';
process.env.PUBLIC_BASE_URL = 'https://vales.ejemplo';
process.env.GLM_SYNC_MINUTOS = '0'; // en los tests se sincroniza a mano

import { INestApplication } from '@nestjs/common';
import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { Proveedor, Rol, Sector, Usuario, ValeEvento } from '../src/database/entities';
import { configurar } from '../src/main';
import { sqlSetval } from '../src/database/motor';

describe('Circuito de vales (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let http: ReturnType<typeof request>;
  const tok: Record<string, string> = {};
  let provId: number, provInhabId: number;

  const como = (quien: string) => ({
    get: (url: string) => http.get(url).set('Authorization', `Bearer ${tok[quien]}`),
    post: (url: string, body?: object) => http.post(url).set('Authorization', `Bearer ${tok[quien]}`).send(body ?? {}),
  });

  // GLM simulado, con el mismo formato que GET /proveedores real
  let glm: Server;
  let glmRespuesta: { status: number; body: string } = { status: 200, body: '[]' };

  beforeAll(async () => {
    glm = createServer((_, res) => res.writeHead(glmRespuesta.status, { 'Content-Type': 'application/json' }).end(glmRespuesta.body));
    await new Promise<void>((ok) => glm.listen(0, ok));
    process.env.GLM_API_URL = `http://127.0.0.1:${(glm.address() as AddressInfo).port}`;

    // Base limpia
    if (MARIA) {
      const limpia = new DataSource({ type: 'mariadb', url: process.env.DATABASE_URL });
      await limpia.initialize();
      await limpia.query('SET FOREIGN_KEY_CHECKS = 0');
      for (const { n } of await limpia.query(`SELECT table_name n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'`)) {
        await limpia.query(`DROP TABLE \`${n}\``);
      }
      for (const { n } of await limpia.query(`SELECT table_name n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'SEQUENCE'`)) {
        await limpia.query(`DROP SEQUENCE \`${n}\``);
      }
      await limpia.query('SET FOREIGN_KEY_CHECKS = 1');
      await limpia.destroy();
    } else {
      const limpia = new DataSource({ type: 'postgres', url: process.env.DATABASE_URL });
      await limpia.initialize();
      await limpia.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
      await limpia.destroy();
    }

    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configurar(mod.createNestApplication());
    await app.init();
    ds = app.get(DataSource);
    http = request(app.getHttpServer());

    const s = await ds.getRepository(Sector).save({ nombre: 'Administración' });
    const c = await ds.getRepository(Sector).save({ nombre: 'Compras' });
    const hash = await bcrypt.hash('clave1234', 4);
    await ds.getRepository(Usuario).save([
      { legajo: 'compras', nombre: 'Jefe Compras', rol: Rol.COMPRAS, sectorId: c.id, passwordHash: hash },
      { legajo: '1001', nombre: 'Ana Empleada', rol: Rol.SOLICITANTE, sectorId: s.id, passwordHash: hash },
      { legajo: '1002', nombre: 'Otro Empleado', rol: Rol.SOLICITANTE, sectorId: s.id, passwordHash: hash },
      { legajo: 'admin', nombre: 'Administrador', rol: Rol.ADMIN, sectorId: c.id, passwordHash: hash },
    ]);
    provId = (await ds.getRepository(Proveedor).save({ razonSocial: 'Centro Eléctrico', pinHash: await bcrypt.hash('4321', 4) })).id;
    provInhabId = (await ds.getRepository(Proveedor).save({ razonSocial: 'Dado de baja', habilitado: false })).id;
    // Continuar la serie del talonario en papel
    await ds.query(sqlSetval(53051));

    for (const legajo of ['compras', '1001', '1002', 'admin']) {
      const r = await http.post('/auth/login').send({ legajo, password: 'clave1234' }).expect(200);
      tok[legajo] = r.body.accessToken;
    }
  });

  afterAll(async () => {
    await app.close();
    glm.close();
  });

  it('rechaza login incorrecto y rutas sin sesión', async () => {
    await http.post('/auth/login').send({ legajo: '1001', password: 'mal' }).expect(401);
    await http.get('/vales').expect(401);
  });

  let valeId: number, numero: number, token: string;

  it('el empleado pide productos y Compras emite el vale', async () => {
    const r = await como('1001')
      .post('/vales', {
        enviar: true,
        items: [
          { cantidad: 1, unidad: 'rollo', descripcion: 'Cable 1,5 mm' },
          { cantidad: 1, descripcion: 'Térmica 10 A' },
          { cantidad: 30, unidad: 'm', descripcion: 'Cable 2x2,5' },
        ],
      })
      .expect(201);
    valeId = r.body.id;
    expect(r.body.estado).toBe('SOLICITADO');
    expect(r.body.numero).toBeNull();

    // No puede mandar campos que no corresponden
    await como('1001').post('/vales', { estado: 'EMITIDO', items: [{ cantidad: 1, descripcion: 'x' }] }).expect(400);
    // El empleado no aprueba
    await como('1001').post(`/vales/${valeId}/aprobar`, { proveedorId: provId }).expect(403);
    // Otro empleado no lo ve
    await como('1002').get(`/vales/${valeId}`).expect(403);
    // Compras: sin proveedor no se puede; con uno inhabilitado tampoco
    await como('compras').post(`/vales/${valeId}/aprobar`, {}).expect(400);
    await como('compras').post(`/vales/${valeId}/aprobar`, { proveedorId: provInhabId }).expect(400);

    const a = await como('compras').post(`/vales/${valeId}/aprobar`, { proveedorId: provId }).expect(201);
    expect(a.body.estado).toBe('EMITIDO');
    expect(a.body.numero).toBe(53052);
    expect(a.body.aprobadoPor.nombre).toBe('Jefe Compras');
    expect(a.body.fechaVigencia).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(a.body.tokenQr).toBeUndefined(); // el token no viaja en la API interna
    numero = a.body.numero;

    const l = await como('1001').get(`/vales/${valeId}/link`).expect(200);
    expect(l.body.url).toMatch(/^https:\/\/vales\.ejemplo\/v\//);
    token = l.body.url.split('/v/')[1];
  });

  it('genera el PDF', async () => {
    const r = await como('1001').get(`/vales/${valeId}/pdf`).buffer(true).parse((res, cb) => {
      const d: Buffer[] = [];
      res.on('data', (c: Buffer) => d.push(c));
      res.on('end', () => cb(null, Buffer.concat(d)));
    }).expect(200);
    expect(r.headers['content-type']).toBe('application/pdf');
    expect((r.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
    require('fs').writeFileSync(require('path').join(__dirname, 'vale-ejemplo.pdf'), r.body);
  });

  it('el proveedor no puede entregar hasta que el empleado acepte (firme)', async () => {
    const p = await http.get(`/v/${token}`).expect(200);
    expect(p.text).toContain(`Vale N° ${numero}`);
    expect(p.text).toContain('todavía no aceptó');
    await http.post(`/publico/vales/${token}/entrega`).send({ pin: '4321' }).expect(409);
  });

  it('el empleado acepta y el proveedor confirma con su PIN', async () => {
    await como('1002').post(`/vales/${valeId}/aceptar`).expect(403);
    const a = await como('1001').post(`/vales/${valeId}/aceptar`).expect(201);
    expect(a.body.aceptadoEn).toBeTruthy();

    const j = await http.get(`/publico/vales/${token}`).expect(200);
    expect(j.body.situacion).toBe('VALIDO');
    expect(j.body.items).toHaveLength(3);
    expect(j.body).not.toHaveProperty('id');

    await http.post(`/v/${token}`).type('form').send({ pin: '0000' }).expect(401);
    const ok = await http.post(`/v/${token}`).type('form').send({ pin: '4321', remito: 'R-0001-123' }).expect(200);
    expect(ok.text).toContain('Entrega registrada');
    expect(ok.text).toContain('ya fue entregado');
    // Un segundo intento no vuelve a entregar
    await http.post(`/publico/vales/${token}/entrega`).send({ pin: '4321' }).expect(409);
    await http.get('/v/token-que-no-existe').expect(404);
  });

  it('la factura que cita el número concilia el vale', async () => {
    const mal = await como('compras')
      .post('/facturas', { proveedorId: provId, numero: 'A-0001-00001234', fecha: '2026-11-10', importe: 85000.5, vales: [numero, 99999] })
      .expect(400);
    expect(mal.body.problemas).toEqual(['N° 99999: no existe']);

    const f = await como('compras')
      .post('/facturas', { proveedorId: provId, numero: 'A-0001-00001234', fecha: '2026-11-10', importe: 85000.5, vales: [numero] })
      .expect(201);
    expect(f.body.importe).toBe(85000.5);
    const v = await como('1001').get(`/vales/${valeId}`).expect(200);
    expect(v.body.estado).toBe('CONCILIADO');
    await como('compras')
      .post('/facturas', { proveedorId: provId, numero: 'A-0001-00001234', fecha: '2026-11-10', importe: 1, vales: [numero] })
      .expect(409);
    await como('1001').get('/facturas').expect(403);
  });

  it('deja auditado cada paso', async () => {
    const ev = await ds.getRepository(ValeEvento).find({ where: { valeId }, order: { id: 'ASC' } });
    expect(ev.map((e) => `${e.estadoNuevo}:${e.canal}`)).toEqual([
      'BORRADOR:WEB',
      'SOLICITADO:WEB',
      'APROBADO:WEB',
      'EMITIDO:WEB',
      'EMITIDO:WEB', // aceptación del empleado
      'ENTREGADO:PROVEEDOR',
      'CONCILIADO:WEB',
    ]);
  });

  it('rechazo, anulación y permisos de anulación', async () => {
    const nuevo = () => como('1001').post('/vales', { enviar: true, items: [{ cantidad: 2, descripcion: 'Guantes' }] }).expect(201);

    const r1 = await nuevo();
    await como('compras').post(`/vales/${r1.body.id}/rechazar`, {}).expect(400); // falta motivo
    const rech = await como('compras').post(`/vales/${r1.body.id}/rechazar`, { motivo: 'Hay stock en depósito' }).expect(201);
    expect(rech.body.estado).toBe('RECHAZADO');
    await como('compras').post(`/vales/${r1.body.id}/aprobar`, { proveedorId: provId }).expect(409);

    const r2 = await nuevo();
    await como('1001').post(`/vales/${r2.body.id}/anular`, { motivo: 'Ya no hace falta' }).expect(201);

    const r3 = await nuevo();
    await como('compras').post(`/vales/${r3.body.id}/aprobar`, { proveedorId: provId }).expect(201);
    await como('1001').post(`/vales/${r3.body.id}/anular`, { motivo: 'x' }).expect(403); // ya emitido
    const an = await como('compras').post(`/vales/${r3.body.id}/anular`, { motivo: 'Error de carga' }).expect(201);
    expect(an.body.estado).toBe('ANULADO');
    const tk = (await como('compras').get(`/vales/${r3.body.id}/link`)).body.url.split('/v/')[1];
    expect((await http.get(`/publico/vales/${tk}`)).body.situacion).toBe('ANULADO');
  });

  it('numera sin duplicados aunque se emitan vales a la vez', async () => {
    const ids: number[] = [];
    for (let i = 0; i < 8; i++) {
      ids.push((await como('1001').post('/vales', { enviar: true, items: [{ cantidad: 1, descripcion: `Item ${i}` }] })).body.id);
    }
    const res = await Promise.all(ids.map((id) => como('compras').post(`/vales/${id}/aprobar`, { proveedorId: provId })));
    const numeros = res.map((r) => r.body.numero);
    expect(new Set(numeros).size).toBe(8);
    expect(numeros.every((n) => n > 53052)).toBe(true);
  });

  it('el empleado solo lista sus vales; Compras ve todos', async () => {
    const mios = await como('1002').get('/vales').expect(200);
    expect(mios.body).toHaveLength(0);
    const todos = await como('compras').get('/vales?estado=EMITIDO').expect(200);
    expect(todos.body.length).toBeGreaterThanOrEqual(8);
  });

  it('para controlar una factura, lista los vales con sus productos', async () => {
    const sin = await como('compras').get('/vales?estado=EMITIDO').expect(200);
    expect(sin.body[0].items).toBeUndefined(); // por defecto no los trae (lista liviana)
    const con = await como('compras').get('/vales?estado=EMITIDO&items=1').expect(200);
    expect(con.body.length).toBe(sin.body.length); // el join no cambia cuántos vales devuelve
    for (const v of con.body) {
      expect(v.items.length).toBeGreaterThan(0);
      expect(v.items[0]).toHaveProperty('descripcion');
    }
    await como('compras').get('/vales?items=quizas').expect(400);
  });

  describe('proveedores desde GLM', () => {
    const glmProv = (codigo: number, razon: string, documento = 30654364229) => ({
      codigo, razon_social: razon, nombre_fantasia: razon, email: '', domicilio: 'CHACABUCO Y BETOLAZA 0',
      codigo_postal: '1000', localidad: 'CAPITAL FEDERAL     ', tipo_documento: 80, documento, telefono: '',
    });

    it('la app no permite crear ni editar proveedores', async () => {
      await como('compras').post('/proveedores', { razonSocial: 'X' }).expect(404);
      await http.patch(`/proveedores/${provId}`).set('Authorization', `Bearer ${tok.compras}`).send({ razonSocial: 'X' }).expect(404);
      await como('1001').post('/proveedores/sincronizar').expect(403);
    });

    it('sincroniza: crea, actualiza y deshabilita sin borrar', async () => {
      glmRespuesta = { status: 200, body: JSON.stringify([glmProv(89, 'CABAL'), glmProv(283, 'AMX ARGENTINA SA', 30663288497), { codigo: 999 }]) };
      const r = await como('compras').post('/proveedores/sincronizar').expect(200);
      expect(r.body).toMatchObject({ ok: true, recibidos: 3, nuevos: 2, actualizados: 0 });
      // Los proveedores cargados a mano en el test no vienen de GLM: quedan deshabilitados
      expect(r.body.deshabilitados).toBe(1);

      const lista = await como('1001').get('/proveedores').expect(200);
      expect(lista.body.map((p: any) => p.razonSocial)).toEqual(['AMX ARGENTINA SA', 'CABAL']);
      const cabal = lista.body.find((p: any) => p.glmProveedorId === '89');
      expect(cabal).toMatchObject({ cuit: '30-65436422-9', localidad: 'CAPITAL FEDERAL (1000)', nombreFantasia: null, contactoMail: null });
      expect((await como('1001').get('/proveedores?buscar=3066328')).body).toHaveLength(1);
      expect((await como('1001').get('/proveedores?buscar=cab')).body).toHaveLength(1);

      // El proveedor deshabilitado conserva sus vales, pero no se puede usar en uno nuevo
      const v = await como('1001').get(`/vales/${valeId}`).expect(200);
      expect(v.body.proveedor.razonSocial).toBe('Centro Eléctrico');
      const nuevo = await como('1001').post('/vales', { enviar: true, items: [{ cantidad: 1, descripcion: 'x' }] }).expect(201);
      await como('compras').post(`/vales/${nuevo.body.id}/aprobar`, { proveedorId: provId }).expect(400);
      await como('compras').post(`/vales/${nuevo.body.id}/aprobar`, { proveedorId: cabal.id }).expect(201);

      // Segunda pasada: CABAL cambia de nombre, AMX desaparece
      glmRespuesta = { status: 200, body: JSON.stringify([glmProv(89, 'CABAL SA')]) };
      const r2 = await como('compras').post('/proveedores/sincronizar').expect(200);
      expect(r2.body).toMatchObject({ nuevos: 0, actualizados: 1, deshabilitados: 1 });
      expect((await como('1001').get('/proveedores')).body.map((p: any) => p.razonSocial)).toEqual(['CABAL SA']);
      expect((await como('compras').get('/proveedores?todos=true')).body.length).toBe(4);

      // Listado para Compras: filtros, búsqueda y si tiene PIN
      await como('1001').get('/proveedores/listado').expect(403);
      const act = (await como('compras').get('/proveedores/listado').expect(200)).body;
      expect(act).toMatchObject({ total: 1, pagina: 1, paginas: 1 });
      expect(act.items[0]).toMatchObject({ razonSocial: 'CABAL SA', tienePin: false });
      expect((await como('compras').get('/proveedores/listado?filtro=sinpin')).body.total).toBe(1);
      await como('compras').post(`/proveedores/${act.items[0].id}/pin`, { pin: '2468' }).expect(201);
      expect((await como('compras').get('/proveedores/listado?filtro=sinpin')).body.total).toBe(0);
      expect((await como('compras').get('/proveedores/listado')).body.items[0].tienePin).toBe(true);
      const baja = (await como('compras').get('/proveedores/listado?filtro=baja&buscar=amx')).body;
      expect(baja.items.map((p: any) => p.razonSocial)).toEqual(['AMX ARGENTINA SA']);
      expect(baja.items[0]).not.toHaveProperty('pinHash');
      await como('compras').get('/proveedores/listado?filtro=otro').expect(400);
    });

    it('si GLM falla o devuelve vacío, no toca nada y lo informa', async () => {
      glmRespuesta = { status: 200, body: '[]' };
      const r = await como('compras').post('/proveedores/sincronizar').expect(503);
      expect(r.body.message).toMatch(/0 proveedores válidos/);
      glmRespuesta = { status: 500, body: 'error' };
      await como('compras').post('/proveedores/sincronizar').expect(503);
      expect((await como('1001').get('/proveedores')).body.map((p: any) => p.razonSocial)).toEqual(['CABAL SA']);
      const ultima = await como('compras').get('/proveedores/sincronizacion').expect(200);
      expect(ultima.body).toMatchObject({ ok: false, error: 'GLM respondió 500 Internal Server Error' });
    });
  });

  describe('usuarios', () => {
    const patch = (quien: string, id: number, body: object) => http.patch(`/usuarios/${id}`).set('Authorization', `Bearer ${tok[quien]}`).send(body);
    const idDe = async (legajo: string) => (await como('admin').get('/usuarios')).body.find((u: any) => u.legajo === legajo).id;

    it('solo el administrador gestiona usuarios', async () => {
      await como('compras').get('/usuarios').expect(403);
      await patch('compras', 1, { nombre: 'x' }).expect(403);
    });

    it('crea y edita legajo, nombre, sector, rol y contraseña', async () => {
      const sectorId = (await como('admin').get('/sectores')).body[0].id;
      const nuevo = await como('admin').post('/usuarios', { legajo: ' 2001 ', nombre: ' Juan Pérez ', password: 'inicial123', rol: 'SOLICITANTE', sectorId }).expect(201);
      expect(nuevo.body).toMatchObject({ legajo: '2001', nombre: 'Juan Pérez' });
      expect(nuevo.body).not.toHaveProperty('passwordHash');
      await como('admin').post('/usuarios', { legajo: '2001', nombre: 'Otro', password: 'inicial123', rol: 'SOLICITANTE', sectorId }).expect(409);
      await como('admin').post('/usuarios', { legajo: '2002', nombre: 'Otro', password: 'corta', rol: 'SOLICITANTE', sectorId }).expect(400);
      await como('admin').post('/usuarios', { legajo: '2002', nombre: 'Otro', password: 'inicial123', rol: 'SOLICITANTE', sectorId: 9999 }).expect(400);

      const id = nuevo.body.id;
      const e = await patch('admin', id, { legajo: '2010', nombre: 'Juan Carlos Pérez', rol: 'COMPRAS', password: 'nueva12345' }).expect(200);
      expect(e.body).toMatchObject({ legajo: '2010', nombre: 'Juan Carlos Pérez', rol: 'COMPRAS' });
      await http.post('/auth/login').send({ legajo: '2001', password: 'inicial123' }).expect(401);
      await http.post('/auth/login').send({ legajo: '2010', password: 'inicial123' }).expect(401);
      await http.post('/auth/login').send({ legajo: '2010', password: 'nueva12345' }).expect(200);
      await patch('admin', id, { legajo: '1001' }).expect(409); // legajo de otro usuario
      await patch('admin', id, { legajo: '   ' }).expect(400);
      await patch('admin', id, { password: 'corta' }).expect(400);
      await patch('admin', 99999, { nombre: 'x' }).expect(404);

      const sesionVieja = (await http.post('/auth/login').send({ legajo: '2010', password: 'nueva12345' })).body.accessToken;
      await http.get('/facturas').set('Authorization', `Bearer ${sesionVieja}`).expect(200); // es COMPRAS
      await patch('admin', id, { rol: 'SOLICITANTE' }).expect(200);
      await http.get('/facturas').set('Authorization', `Bearer ${sesionVieja}`).expect(403); // pierde el permiso ya
      await patch('admin', id, { activo: false }).expect(200);
      await http.post('/auth/login').send({ legajo: '2010', password: 'nueva12345' }).expect(401);
      await http.get('/vales').set('Authorization', `Bearer ${sesionVieja}`).expect(401); // y la sesión abierta se corta
    });

    it('no deja al sistema sin administradores', async () => {
      const yo = await idDe('admin');
      await patch('admin', yo, { activo: false }).expect(400);
      await patch('admin', yo, { rol: 'COMPRAS' }).expect(400);
      // pero sí puede cambiar sus propios datos y su clave
      await patch('admin', yo, { nombre: 'Administración CELTA', password: 'clave1234' }).expect(200);

      // Un segundo admin no puede dejar sin rol al único otro si eso deja 0 activos
      const sectorId = (await como('admin').get('/sectores')).body[0].id;
      const otro = (await como('admin').post('/usuarios', { legajo: 'admin2', nombre: 'Admin 2', password: 'clave1234', rol: 'ADMIN', sectorId })).body.id;
      const t2 = (await http.post('/auth/login').send({ legajo: 'admin2', password: 'clave1234' })).body.accessToken;
      await http.patch(`/usuarios/${yo}`).set('Authorization', `Bearer ${t2}`).send({ rol: 'COMPRAS' }).expect(200); // quedan 2 → ok
      await patch('admin', otro, { activo: false }).expect(403); // "admin" ya no es admin: rige en el momento
      await http.patch(`/usuarios/${otro}`).set('Authorization', `Bearer ${t2}`).send({ activo: false }).expect(400); // sería él mismo
      await http.patch(`/usuarios/${yo}`).set('Authorization', `Bearer ${t2}`).send({ rol: 'ADMIN' }).expect(200);
    });
  });

  describe('notificaciones al celular', () => {
    // Servicio push simulado: recibe lo que mandaría el servidor y lo descifra como haría el celular.
    const ece = require('http_ece');
    const crypto = require('crypto');
    let push: Server;
    let base = '';
    const recibidos: Record<string, any[]> = {};
    const responder: Record<string, number> = {};
    const claves: Record<string, { ecdh: any; auth: Buffer }> = {};

    const celular = (nombre: string) => {
      const ecdh = crypto.createECDH('prime256v1');
      ecdh.generateKeys();
      const auth = crypto.randomBytes(16);
      claves[nombre] = { ecdh, auth };
      recibidos[nombre] = [];
      return { endpoint: `${base}/push/${nombre}`, keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: auth.toString('base64url') } };
    };
    const esperar = async (nombre: string, n: number) => {
      for (let i = 0; i < 40 && recibidos[nombre].length < n; i++) await new Promise((r) => setTimeout(r, 50));
      return recibidos[nombre];
    };

    beforeAll(async () => {
      // Los servicios push reales son HTTPS: el simulado también, con un certificado de prueba.
      const dir = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'push-'));
      require('child_process').execSync(
        `openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=127.0.0.1 -addext subjectAltName=IP:127.0.0.1 -keyout ${dir}/k.pem -out ${dir}/c.pem`,
        { stdio: 'ignore' },
      );
      // Confiamos solo en ese certificado (sin desactivar la verificación TLS).
      require('https').globalAgent.options.ca = require('fs').readFileSync(`${dir}/c.pem`);
      push = require('https').createServer({ key: require('fs').readFileSync(`${dir}/k.pem`), cert: require('fs').readFileSync(`${dir}/c.pem`) }, (req: any, res: any) => {
        const partes: Buffer[] = [];
        req.on('data', (c: Buffer) => partes.push(c));
        req.on('end', () => {
          const nombre = req.url.split('/').pop();
          const k = claves[nombre];
          if (k) {
            const plano = ece.decrypt(Buffer.concat(partes), { version: 'aes128gcm', privateKey: k.ecdh, authSecret: k.auth });
            recibidos[nombre].push({ ...JSON.parse(plano.toString()), vapid: /^vapid t=/.test(req.headers.authorization ?? '') });
          }
          res.writeHead(responder[nombre] ?? 201).end();
        });
      });
      await new Promise<void>((ok) => push.listen(0, ok));
      base = `https://127.0.0.1:${(push.address() as AddressInfo).port}`;
    });
    afterAll(() => push.close());

    it('el celular se suscribe con la clave pública del servidor', async () => {
      const c = await http.get('/notificaciones/clave').expect(200);
      expect(c.body.clave).toMatch(/^[A-Za-z0-9_-]{80,}$/);
      expect((await http.get('/notificaciones/clave')).body.clave).toBe(c.body.clave); // estable
      await como('compras').post('/notificaciones/suscripcion', celular('compras')).expect(204);
      await como('1001').post('/notificaciones/suscripcion', celular('empleado')).expect(204);
      await como('1001').post('/notificaciones/suscripcion', { endpoint: 'no-es-url', keys: { p256dh: 'x', auth: 'y' } }).expect(400);
      await http.post('/notificaciones/suscripcion').send(celular('anonimo')).expect(401);
    });

    it('Compras recibe "Nuevo pedido" y el empleado, la aprobación', async () => {
      const v = (await como('1001').post('/vales', { enviar: true, items: [{ cantidad: 2, descripcion: 'Guantes' }, { cantidad: 1, descripcion: 'Casco' }] }).expect(201)).body;
      const [nuevo] = await esperar('compras', 1);
      expect(nuevo).toMatchObject({ titulo: 'Nuevo pedido de compra', cuerpo: 'Ana Empleada (Administración): Guantes, Casco', url: `/#/vales/${v.id}`, vapid: true });
      expect(recibidos.empleado).toHaveLength(0); // al que pidió no le llega su propio pedido

      const prov = await ds.getRepository(Proveedor).save({ razonSocial: 'Ferretería Push' });
      const a = (await como('compras').post(`/vales/${v.id}/aprobar`, { proveedorId: prov.id }).expect(201)).body;
      const [aprob] = await esperar('empleado', 1);
      expect(aprob).toMatchObject({ titulo: `Vale N° ${a.numero} aprobado`, url: `/#/vales/${v.id}` });
      expect(aprob.cuerpo).toContain('Ya podés retirarlo en Ferretería Push');
    });

    it('avisa el rechazo con el motivo', async () => {
      const v = (await como('1001').post('/vales', { enviar: true, items: [{ cantidad: 1, descripcion: 'Escalera' }] })).body;
      await como('compras').post(`/vales/${v.id}/rechazar`, { motivo: 'Hay en el depósito' }).expect(201);
      const lista = await esperar('empleado', 2);
      expect(lista[1]).toMatchObject({ titulo: 'Pedido rechazado', cuerpo: 'Compras rechazó tu pedido: Hay en el depósito' });
    });

    it('un borrador no avisa; al enviarlo, sí', async () => {
      const antes = recibidos.compras.length;
      const v = (await como('1001').post('/vales', { items: [{ cantidad: 1, descripcion: 'Pinza' }] })).body;
      await new Promise((r) => setTimeout(r, 300));
      expect(recibidos.compras.length).toBe(antes);
      await como('1001').post(`/vales/${v.id}/enviar`).expect(201);
      const l = await esperar('compras', antes + 1);
      expect(l[l.length - 1].cuerpo).toContain('Pinza');
    });

    it('prueba, baja y celulares que ya no existen', async () => {
      const p = await como('1001').post('/notificaciones/prueba').expect(200);
      expect(p.body).toEqual({ enviados: 1, fallidos: 0 });
      const e = await esperar('empleado', 3);
      expect(e[e.length - 1].titulo).toBe('Notificaciones activadas');

      // El servicio push responde 410 (el usuario desinstaló la app): la suscripción se borra sola
      responder.empleado = 410;
      expect((await como('1001').post('/notificaciones/prueba')).body).toEqual({ enviados: 0, fallidos: 1 });
      expect((await como('1001').post('/notificaciones/prueba')).body).toEqual({ enviados: 0, fallidos: 0 });

      // Baja manual (al cerrar sesión)
      const sub = celular('compras2');
      await como('compras').post('/notificaciones/suscripcion', sub).expect(204);
      await http.delete('/notificaciones/suscripcion').set('Authorization', `Bearer ${tok.compras}`).send({ endpoint: sub.endpoint }).expect(204);
      expect((await como('compras').post('/notificaciones/prueba')).body.enviados).toBe(1); // queda solo el primero
    });
  });
});
