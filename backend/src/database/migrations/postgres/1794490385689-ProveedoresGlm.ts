import { MigrationInterface, QueryRunner } from "typeorm";

export class ProveedoresGlm1794490385689 implements MigrationInterface {
    name = 'ProveedoresGlm1794490385689'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "proveedor" ADD "nombre_fantasia" character varying`);
        await queryRunner.query(`ALTER TABLE "proveedor" ADD "domicilio" character varying`);
        await queryRunner.query(`ALTER TABLE "proveedor" ADD "localidad" character varying`);
        await queryRunner.query(`ALTER TABLE "proveedor" ADD "telefono" character varying`);
        await queryRunner.query(`ALTER TABLE "proveedor" ADD "sincronizado_en" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "proveedor" DROP CONSTRAINT "UQ_0ba34665808651b52e3d41bdc89"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "proveedor" ADD CONSTRAINT "UQ_0ba34665808651b52e3d41bdc89" UNIQUE ("cuit")`);
        await queryRunner.query(`ALTER TABLE "proveedor" DROP COLUMN "sincronizado_en"`);
        await queryRunner.query(`ALTER TABLE "proveedor" DROP COLUMN "telefono"`);
        await queryRunner.query(`ALTER TABLE "proveedor" DROP COLUMN "localidad"`);
        await queryRunner.query(`ALTER TABLE "proveedor" DROP COLUMN "domicilio"`);
        await queryRunner.query(`ALTER TABLE "proveedor" DROP COLUMN "nombre_fantasia"`);
    }

}
