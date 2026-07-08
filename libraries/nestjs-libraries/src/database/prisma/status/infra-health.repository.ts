import { Injectable } from '@nestjs/common';
import { PrismaService } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';

/**
 * Dono do acesso cru ao Prisma para a sonda de liveness do Postgres — mantém o
 * `$queryRaw` na camada de repositório (o InfraHealthService não injeta o
 * PrismaService direto). `SELECT 1` é tagged template, sem interpolação de
 * input → sem risco de injection.
 */
@Injectable()
export class InfraHealthRepository {
  constructor(private _prisma: PrismaService) {}

  ping() {
    return this._prisma.$queryRaw`SELECT 1`;
  }
}
