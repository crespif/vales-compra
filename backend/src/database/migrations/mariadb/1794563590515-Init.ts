import { MigrationInterface, QueryRunner } from "typeorm";

export class Init1794563590515 implements MigrationInterface {
    name = 'Init1794563590515'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Numeración de vales: se toma de esta secuencia recién al EMITIR.
        // Para continuar la serie del talonario: SELECT SETVAL(vale_numero_seq, <último número usado>);
        await queryRunner.query(`CREATE SEQUENCE IF NOT EXISTS vale_numero_seq START WITH 1 INCREMENT BY 1 NOCACHE`);
        await queryRunner.query(`CREATE TABLE \`sector\` (\`id\` int NOT NULL AUTO_INCREMENT, \`nombre\` varchar(255) NOT NULL, \`activo\` tinyint NOT NULL DEFAULT 1, \`almacen_default_id\` varchar(255) NULL, \`ubicacion_default_id\` varchar(255) NULL, \`glm_sector_id\` varchar(255) NULL, UNIQUE INDEX \`IDX_fd379463d4f651129621fd91a4\` (\`nombre\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`usuario\` (\`id\` int NOT NULL AUTO_INCREMENT, \`legajo\` varchar(255) NOT NULL, \`nombre\` varchar(255) NOT NULL, \`password_hash\` varchar(255) NOT NULL, \`rol\` enum ('SOLICITANTE', 'COMPRAS', 'ADMIN') NOT NULL DEFAULT 'SOLICITANTE', \`activo\` tinyint NOT NULL DEFAULT 1, \`sector_id\` int NOT NULL, \`telefono_vinculado\` varchar(255) NULL, \`chat_id\` varchar(255) NULL, \`creado_en\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE INDEX \`IDX_1243db4d084619f7fd77e8c00f\` (\`legajo\`), UNIQUE INDEX \`IDX_12c187298635a8af03d347c108\` (\`chat_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`proveedor\` (\`id\` int NOT NULL AUTO_INCREMENT, \`glm_proveedor_id\` varchar(255) NULL, \`razon_social\` varchar(255) NOT NULL, \`nombre_fantasia\` varchar(255) NULL, \`cuit\` varchar(255) NULL, \`domicilio\` varchar(255) NULL, \`localidad\` varchar(255) NULL, \`telefono\` varchar(255) NULL, \`contacto_mail\` varchar(255) NULL, \`contacto_whatsapp\` varchar(255) NULL, \`habilitado\` tinyint NOT NULL DEFAULT 1, \`sincronizado_en\` datetime NULL, \`pin_hash\` varchar(255) NULL, UNIQUE INDEX \`IDX_58775adfd5373764063ed1f83c\` (\`glm_proveedor_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`vale\` (\`id\` int NOT NULL AUTO_INCREMENT, \`numero\` int NULL, \`estado\` enum ('BORRADOR', 'SOLICITADO', 'APROBADO', 'EMITIDO', 'ENTREGADO', 'CONCILIADO', 'RECHAZADO', 'ANULADO') NOT NULL DEFAULT 'BORRADOR', \`sector_id\` int NOT NULL, \`solicitante_id\` int NOT NULL, \`proveedor_id\` int NULL, \`observaciones\` text NULL, \`motivo_rechazo\` text NULL, \`aprobado_por\` int NULL, \`aprobado_en\` datetime NULL, \`emitido_en\` datetime NULL, \`aceptado_en\` datetime NULL, \`entregado_en\` datetime NULL, \`fecha_vigencia\` date NULL, \`remito_proveedor\` varchar(255) NULL, \`token_qr\` varchar(255) NULL, \`almacen_id\` varchar(255) NULL, \`ubicacion_id\` varchar(255) NULL, \`glm_orden_id\` varchar(255) NULL, \`glm_sync_estado\` varchar(255) NULL, \`creado_en\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`actualizado_en\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`IDX_b0851a680a2ddc8942ee110402\` (\`estado\`), UNIQUE INDEX \`IDX_3bb9f9129c4dff406f736fbd14\` (\`numero\`), UNIQUE INDEX \`IDX_29783ab765a264c0bb45093ed9\` (\`token_qr\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`vale_item\` (\`id\` int NOT NULL AUTO_INCREMENT, \`vale_id\` int NOT NULL, \`cantidad\` decimal(12,2) NOT NULL, \`unidad\` varchar(255) NULL, \`descripcion\` varchar(255) NOT NULL, \`codigo_articulo\` varchar(255) NULL, \`orden\` int NOT NULL DEFAULT '0', PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`vale_evento\` (\`id\` int NOT NULL AUTO_INCREMENT, \`vale_id\` int NOT NULL, \`estado_anterior\` enum ('BORRADOR', 'SOLICITADO', 'APROBADO', 'EMITIDO', 'ENTREGADO', 'CONCILIADO', 'RECHAZADO', 'ANULADO') NULL, \`estado_nuevo\` enum ('BORRADOR', 'SOLICITADO', 'APROBADO', 'EMITIDO', 'ENTREGADO', 'CONCILIADO', 'RECHAZADO', 'ANULADO') NOT NULL, \`usuario_id\` int NULL, \`canal\` enum ('WEB', 'BOT', 'PROVEEDOR', 'SISTEMA') NOT NULL, \`detalle\` text NULL, \`ip\` varchar(255) NULL, \`fecha_hora\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_f4772482c1319e1eed8516aa73\` (\`vale_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`factura\` (\`id\` int NOT NULL AUTO_INCREMENT, \`proveedor_id\` int NOT NULL, \`numero\` varchar(255) NOT NULL, \`fecha\` date NOT NULL, \`importe\` decimal(14,2) NOT NULL, \`cargado_por\` int NULL, \`creado_en\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`factura_vale\` (\`factura_id\` int NOT NULL, \`vale_id\` int NOT NULL, PRIMARY KEY (\`factura_id\`, \`vale_id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`parametro\` (\`clave\` varchar(255) NOT NULL, \`valor\` text NOT NULL, PRIMARY KEY (\`clave\`)) ENGINE=InnoDB`);
        await queryRunner.query(`ALTER TABLE \`usuario\` ADD CONSTRAINT \`FK_36c4180d355dce44f22490a4c6c\` FOREIGN KEY (\`sector_id\`) REFERENCES \`sector\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`vale\` ADD CONSTRAINT \`FK_f0c86cb7aea8cd54cf6b9cdb2e6\` FOREIGN KEY (\`sector_id\`) REFERENCES \`sector\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`vale\` ADD CONSTRAINT \`FK_75d46f9ae55e039ba6b99e8aead\` FOREIGN KEY (\`solicitante_id\`) REFERENCES \`usuario\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`vale\` ADD CONSTRAINT \`FK_75525d56fabd59982c13ab88b67\` FOREIGN KEY (\`proveedor_id\`) REFERENCES \`proveedor\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`vale\` ADD CONSTRAINT \`FK_3a9a610543806f8b9af71508e00\` FOREIGN KEY (\`aprobado_por\`) REFERENCES \`usuario\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`vale_item\` ADD CONSTRAINT \`FK_9249b55103b07e368ca065e69b1\` FOREIGN KEY (\`vale_id\`) REFERENCES \`vale\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`vale_evento\` ADD CONSTRAINT \`FK_f4772482c1319e1eed8516aa73c\` FOREIGN KEY (\`vale_id\`) REFERENCES \`vale\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`vale_evento\` ADD CONSTRAINT \`FK_b711aa75275df54b1f96698ae64\` FOREIGN KEY (\`usuario_id\`) REFERENCES \`usuario\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`factura\` ADD CONSTRAINT \`FK_e5cf90aaa128ee0d3d99117ab57\` FOREIGN KEY (\`proveedor_id\`) REFERENCES \`proveedor\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`factura_vale\` ADD CONSTRAINT \`FK_b4dce4bb57c4d51083289ffbe64\` FOREIGN KEY (\`factura_id\`) REFERENCES \`factura\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`factura_vale\` ADD CONSTRAINT \`FK_f7f3a29949f5cc3cae305a36aec\` FOREIGN KEY (\`vale_id\`) REFERENCES \`vale\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP SEQUENCE IF EXISTS vale_numero_seq`);
        await queryRunner.query(`ALTER TABLE \`factura_vale\` DROP FOREIGN KEY \`FK_f7f3a29949f5cc3cae305a36aec\``);
        await queryRunner.query(`ALTER TABLE \`factura_vale\` DROP FOREIGN KEY \`FK_b4dce4bb57c4d51083289ffbe64\``);
        await queryRunner.query(`ALTER TABLE \`factura\` DROP FOREIGN KEY \`FK_e5cf90aaa128ee0d3d99117ab57\``);
        await queryRunner.query(`ALTER TABLE \`vale_evento\` DROP FOREIGN KEY \`FK_b711aa75275df54b1f96698ae64\``);
        await queryRunner.query(`ALTER TABLE \`vale_evento\` DROP FOREIGN KEY \`FK_f4772482c1319e1eed8516aa73c\``);
        await queryRunner.query(`ALTER TABLE \`vale_item\` DROP FOREIGN KEY \`FK_9249b55103b07e368ca065e69b1\``);
        await queryRunner.query(`ALTER TABLE \`vale\` DROP FOREIGN KEY \`FK_3a9a610543806f8b9af71508e00\``);
        await queryRunner.query(`ALTER TABLE \`vale\` DROP FOREIGN KEY \`FK_75525d56fabd59982c13ab88b67\``);
        await queryRunner.query(`ALTER TABLE \`vale\` DROP FOREIGN KEY \`FK_75d46f9ae55e039ba6b99e8aead\``);
        await queryRunner.query(`ALTER TABLE \`vale\` DROP FOREIGN KEY \`FK_f0c86cb7aea8cd54cf6b9cdb2e6\``);
        await queryRunner.query(`ALTER TABLE \`usuario\` DROP FOREIGN KEY \`FK_36c4180d355dce44f22490a4c6c\``);
        await queryRunner.query(`DROP TABLE \`parametro\``);
        await queryRunner.query(`DROP TABLE \`factura_vale\``);
        await queryRunner.query(`DROP TABLE \`factura\``);
        await queryRunner.query(`DROP INDEX \`IDX_f4772482c1319e1eed8516aa73\` ON \`vale_evento\``);
        await queryRunner.query(`DROP TABLE \`vale_evento\``);
        await queryRunner.query(`DROP TABLE \`vale_item\``);
        await queryRunner.query(`DROP INDEX \`IDX_29783ab765a264c0bb45093ed9\` ON \`vale\``);
        await queryRunner.query(`DROP INDEX \`IDX_3bb9f9129c4dff406f736fbd14\` ON \`vale\``);
        await queryRunner.query(`DROP INDEX \`IDX_b0851a680a2ddc8942ee110402\` ON \`vale\``);
        await queryRunner.query(`DROP TABLE \`vale\``);
        await queryRunner.query(`DROP INDEX \`IDX_58775adfd5373764063ed1f83c\` ON \`proveedor\``);
        await queryRunner.query(`DROP TABLE \`proveedor\``);
        await queryRunner.query(`DROP INDEX \`IDX_12c187298635a8af03d347c108\` ON \`usuario\``);
        await queryRunner.query(`DROP INDEX \`IDX_1243db4d084619f7fd77e8c00f\` ON \`usuario\``);
        await queryRunner.query(`DROP TABLE \`usuario\``);
        await queryRunner.query(`DROP INDEX \`IDX_fd379463d4f651129621fd91a4\` ON \`sector\``);
        await queryRunner.query(`DROP TABLE \`sector\``);
    }

}
