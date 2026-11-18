import { MigrationInterface, QueryRunner } from "typeorm";

export class PushSuscripcion1794931002641 implements MigrationInterface {
    name = 'PushSuscripcion1794931002641'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "push_suscripcion" ("id" SERIAL NOT NULL, "usuario_id" integer NOT NULL, "endpoint_hash" character varying(64) NOT NULL, "endpoint" text NOT NULL, "p256dh" character varying(200) NOT NULL, "auth" character varying(100) NOT NULL, "dispositivo" character varying(250), "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_bad9b7efdb92b869aee9d5c7c7a" UNIQUE ("endpoint_hash"), CONSTRAINT "PK_cfac364aa879a8b6b2fa53b0ba0" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_772ad9cefbff06c7f6df169f19" ON "push_suscripcion" ("usuario_id") `);
        await queryRunner.query(`ALTER TABLE "push_suscripcion" ADD CONSTRAINT "FK_772ad9cefbff06c7f6df169f191" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "push_suscripcion" DROP CONSTRAINT "FK_772ad9cefbff06c7f6df169f191"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_772ad9cefbff06c7f6df169f19"`);
        await queryRunner.query(`DROP TABLE "push_suscripcion"`);
    }

}
