import { Injectable } from '@nestjs/common';
import { SetsRepository } from '@gitroom/nestjs-libraries/database/prisma/sets/sets.repository';
import { SetsDto } from '@gitroom/nestjs-libraries/dtos/sets/sets.dto';

@Injectable()
export class SetsService {
  constructor(private _setsRepository: SetsRepository) {}

  getTotal(orgId: string, profileId?: string) {
    return this._setsRepository.getTotal(orgId, profileId);
  }

  getSets(orgId: string, profileId?: string) {
    return this._setsRepository.getSets(orgId, profileId);
  }

  createSet(orgId: string, body: SetsDto, profileId?: string) {
    return this._setsRepository.createSet(orgId, body, profileId);
  }

  deleteSet(orgId: string, id: string, profileId?: string) {
    return this._setsRepository.deleteSet(orgId, id, profileId);
  }
}
