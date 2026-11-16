import { MigrationInterface, QueryRunner } from "typeorm";

export class ParametroTexto1794563588101 implements MigrationInterface {
    name = 'ParametroTexto1794563588101'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "parametro" ALTER COLUMN "valor" TYPE text`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "parametro" ALTER COLUMN "valor" TYPE character varying`);
    }

}
