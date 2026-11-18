import { MigrationInterface, QueryRunner } from "typeorm";

export class PushSuscripcion1794931006959 implements MigrationInterface {
    name = 'PushSuscripcion1794931006959'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE \`push_suscripcion\` (\`id\` int NOT NULL AUTO_INCREMENT, \`usuario_id\` int NOT NULL, \`endpoint_hash\` varchar(64) NOT NULL, \`endpoint\` text NOT NULL, \`p256dh\` varchar(200) NOT NULL, \`auth\` varchar(100) NOT NULL, \`dispositivo\` varchar(250) NULL, \`creado_en\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_772ad9cefbff06c7f6df169f19\` (\`usuario_id\`), UNIQUE INDEX \`IDX_bad9b7efdb92b869aee9d5c7c7\` (\`endpoint_hash\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`ALTER TABLE \`push_suscripcion\` ADD CONSTRAINT \`FK_772ad9cefbff06c7f6df169f191\` FOREIGN KEY (\`usuario_id\`) REFERENCES \`usuario\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`push_suscripcion\` DROP FOREIGN KEY \`FK_772ad9cefbff06c7f6df169f191\``);
        await queryRunner.query(`DROP INDEX \`IDX_bad9b7efdb92b869aee9d5c7c7\` ON \`push_suscripcion\``);
        await queryRunner.query(`DROP INDEX \`IDX_772ad9cefbff06c7f6df169f19\` ON \`push_suscripcion\``);
        await queryRunner.query(`DROP TABLE \`push_suscripcion\``);
    }

}
