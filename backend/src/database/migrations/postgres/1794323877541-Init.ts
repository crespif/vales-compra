import { MigrationInterface, QueryRunner } from "typeorm";

export class Init1794323877541 implements MigrationInterface {
    name = 'Init1794323877541'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Numeración de vales: se toma de esta secuencia recién al EMITIR.
        // Para continuar la serie del talonario: SELECT setval('vale_numero_seq', <último número usado>);
        await queryRunner.query(`CREATE SEQUENCE IF NOT EXISTS vale_numero_seq START 1`);
        await queryRunner.query(`CREATE TABLE "sector" ("id" SERIAL NOT NULL, "nombre" character varying NOT NULL, "activo" boolean NOT NULL DEFAULT true, "almacen_default_id" character varying, "ubicacion_default_id" character varying, "glm_sector_id" character varying, CONSTRAINT "UQ_fd379463d4f651129621fd91a42" UNIQUE ("nombre"), CONSTRAINT "PK_668b2ea8a2f534425407732f3ab" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."rol" AS ENUM('SOLICITANTE', 'COMPRAS', 'ADMIN')`);
        await queryRunner.query(`CREATE TABLE "usuario" ("id" SERIAL NOT NULL, "legajo" character varying NOT NULL, "nombre" character varying NOT NULL, "password_hash" character varying NOT NULL, "rol" "public"."rol" NOT NULL DEFAULT 'SOLICITANTE', "activo" boolean NOT NULL DEFAULT true, "sector_id" integer NOT NULL, "telefono_vinculado" character varying, "chat_id" character varying, "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_1243db4d084619f7fd77e8c00ff" UNIQUE ("legajo"), CONSTRAINT "UQ_12c187298635a8af03d347c1085" UNIQUE ("chat_id"), CONSTRAINT "PK_a56c58e5cabaa04fb2c98d2d7e2" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "proveedor" ("id" SERIAL NOT NULL, "razon_social" character varying NOT NULL, "cuit" character varying, "habilitado" boolean NOT NULL DEFAULT true, "contacto_mail" character varying, "contacto_whatsapp" character varying, "pin_hash" character varying, "glm_proveedor_id" character varying, CONSTRAINT "UQ_0ba34665808651b52e3d41bdc89" UNIQUE ("cuit"), CONSTRAINT "UQ_58775adfd5373764063ed1f83c7" UNIQUE ("glm_proveedor_id"), CONSTRAINT "PK_405f60886417ece76cb5681550a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."estado_vale" AS ENUM('BORRADOR', 'SOLICITADO', 'APROBADO', 'EMITIDO', 'ENTREGADO', 'CONCILIADO', 'RECHAZADO', 'ANULADO')`);
        await queryRunner.query(`CREATE TABLE "vale" ("id" SERIAL NOT NULL, "numero" integer, "estado" "public"."estado_vale" NOT NULL DEFAULT 'BORRADOR', "sector_id" integer NOT NULL, "solicitante_id" integer NOT NULL, "proveedor_id" integer, "observaciones" text, "motivo_rechazo" text, "aprobado_por" integer, "aprobado_en" TIMESTAMP WITH TIME ZONE, "emitido_en" TIMESTAMP WITH TIME ZONE, "aceptado_en" TIMESTAMP WITH TIME ZONE, "entregado_en" TIMESTAMP WITH TIME ZONE, "fecha_vigencia" date, "remito_proveedor" character varying, "token_qr" character varying, "almacen_id" character varying, "ubicacion_id" character varying, "glm_orden_id" character varying, "glm_sync_estado" character varying, "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_3bb9f9129c4dff406f736fbd14a" UNIQUE ("numero"), CONSTRAINT "UQ_29783ab765a264c0bb45093ed9c" UNIQUE ("token_qr"), CONSTRAINT "PK_3dea27ccff633845b4c7fe9de27" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_b0851a680a2ddc8942ee110402" ON "vale" ("estado") `);
        await queryRunner.query(`CREATE TABLE "vale_item" ("id" SERIAL NOT NULL, "vale_id" integer NOT NULL, "cantidad" numeric(12,2) NOT NULL, "unidad" character varying, "descripcion" character varying NOT NULL, "codigo_articulo" character varying, "orden" integer NOT NULL DEFAULT '0', CONSTRAINT "PK_c792c9e984ef024cfb29bb20eb7" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."canal" AS ENUM('WEB', 'BOT', 'PROVEEDOR', 'SISTEMA')`);
        await queryRunner.query(`CREATE TABLE "vale_evento" ("id" SERIAL NOT NULL, "vale_id" integer NOT NULL, "estado_anterior" "public"."estado_vale", "estado_nuevo" "public"."estado_vale" NOT NULL, "usuario_id" integer, "canal" "public"."canal" NOT NULL, "detalle" text, "ip" character varying, "fecha_hora" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_1680994b4a40153775c98c9b8f8" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_f4772482c1319e1eed8516aa73" ON "vale_evento" ("vale_id") `);
        await queryRunner.query(`CREATE TABLE "factura" ("id" SERIAL NOT NULL, "proveedor_id" integer NOT NULL, "numero" character varying NOT NULL, "fecha" date NOT NULL, "importe" numeric(14,2) NOT NULL, "cargado_por" integer, "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_ca804984009ea42a7b46adb9a86" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "factura_vale" ("factura_id" integer NOT NULL, "vale_id" integer NOT NULL, CONSTRAINT "PK_560235236a772e00c3790a22a21" PRIMARY KEY ("factura_id", "vale_id"))`);
        await queryRunner.query(`CREATE TABLE "parametro" ("clave" character varying NOT NULL, "valor" character varying NOT NULL, CONSTRAINT "PK_5648a8346fd1f692bad137916a8" PRIMARY KEY ("clave"))`);
        await queryRunner.query(`ALTER TABLE "usuario" ADD CONSTRAINT "FK_36c4180d355dce44f22490a4c6c" FOREIGN KEY ("sector_id") REFERENCES "sector"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "vale" ADD CONSTRAINT "FK_f0c86cb7aea8cd54cf6b9cdb2e6" FOREIGN KEY ("sector_id") REFERENCES "sector"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "vale" ADD CONSTRAINT "FK_75d46f9ae55e039ba6b99e8aead" FOREIGN KEY ("solicitante_id") REFERENCES "usuario"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "vale" ADD CONSTRAINT "FK_75525d56fabd59982c13ab88b67" FOREIGN KEY ("proveedor_id") REFERENCES "proveedor"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "vale" ADD CONSTRAINT "FK_3a9a610543806f8b9af71508e00" FOREIGN KEY ("aprobado_por") REFERENCES "usuario"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "vale_item" ADD CONSTRAINT "FK_9249b55103b07e368ca065e69b1" FOREIGN KEY ("vale_id") REFERENCES "vale"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "vale_evento" ADD CONSTRAINT "FK_f4772482c1319e1eed8516aa73c" FOREIGN KEY ("vale_id") REFERENCES "vale"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "vale_evento" ADD CONSTRAINT "FK_b711aa75275df54b1f96698ae64" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "factura" ADD CONSTRAINT "FK_e5cf90aaa128ee0d3d99117ab57" FOREIGN KEY ("proveedor_id") REFERENCES "proveedor"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "factura_vale" ADD CONSTRAINT "FK_b4dce4bb57c4d51083289ffbe64" FOREIGN KEY ("factura_id") REFERENCES "factura"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "factura_vale" ADD CONSTRAINT "FK_f7f3a29949f5cc3cae305a36aec" FOREIGN KEY ("vale_id") REFERENCES "vale"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP SEQUENCE IF EXISTS vale_numero_seq`);
        await queryRunner.query(`ALTER TABLE "factura_vale" DROP CONSTRAINT "FK_f7f3a29949f5cc3cae305a36aec"`);
        await queryRunner.query(`ALTER TABLE "factura_vale" DROP CONSTRAINT "FK_b4dce4bb57c4d51083289ffbe64"`);
        await queryRunner.query(`ALTER TABLE "factura" DROP CONSTRAINT "FK_e5cf90aaa128ee0d3d99117ab57"`);
        await queryRunner.query(`ALTER TABLE "vale_evento" DROP CONSTRAINT "FK_b711aa75275df54b1f96698ae64"`);
        await queryRunner.query(`ALTER TABLE "vale_evento" DROP CONSTRAINT "FK_f4772482c1319e1eed8516aa73c"`);
        await queryRunner.query(`ALTER TABLE "vale_item" DROP CONSTRAINT "FK_9249b55103b07e368ca065e69b1"`);
        await queryRunner.query(`ALTER TABLE "vale" DROP CONSTRAINT "FK_3a9a610543806f8b9af71508e00"`);
        await queryRunner.query(`ALTER TABLE "vale" DROP CONSTRAINT "FK_75525d56fabd59982c13ab88b67"`);
        await queryRunner.query(`ALTER TABLE "vale" DROP CONSTRAINT "FK_75d46f9ae55e039ba6b99e8aead"`);
        await queryRunner.query(`ALTER TABLE "vale" DROP CONSTRAINT "FK_f0c86cb7aea8cd54cf6b9cdb2e6"`);
        await queryRunner.query(`ALTER TABLE "usuario" DROP CONSTRAINT "FK_36c4180d355dce44f22490a4c6c"`);
        await queryRunner.query(`DROP TABLE "parametro"`);
        await queryRunner.query(`DROP TABLE "factura_vale"`);
        await queryRunner.query(`DROP TABLE "factura"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f4772482c1319e1eed8516aa73"`);
        await queryRunner.query(`DROP TABLE "vale_evento"`);
        await queryRunner.query(`DROP TYPE "public"."canal"`);
        await queryRunner.query(`DROP TYPE "public"."estado_vale"`);
        await queryRunner.query(`DROP TABLE "vale_item"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_b0851a680a2ddc8942ee110402"`);
        await queryRunner.query(`DROP TABLE "vale"`);
        await queryRunner.query(`DROP TABLE "proveedor"`);
        await queryRunner.query(`DROP TABLE "usuario"`);
        await queryRunner.query(`DROP TYPE "public"."rol"`);
        await queryRunner.query(`DROP TABLE "sector"`);
    }

}
