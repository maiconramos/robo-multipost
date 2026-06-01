import { Command, Positional } from 'nestjs-command';
import { Injectable } from '@nestjs/common';
import { readFile } from 'fs/promises';
import {
  CarouselSchedulerService,
  CarouselManifest,
} from '@gitroom/nestjs-libraries/database/prisma/posts/carousel.scheduler.service';

@Injectable()
export class ScheduleCarousel {
  constructor(private _carouselScheduler: CarouselSchedulerService) {}

  @Command({
    command: 'schedule:carousel <apiKey> <configPath>',
    describe:
      'Agenda um carrossel a partir de uma pasta de slides e um manifesto JSON.',
  })
  async run(
    @Positional({ name: 'apiKey', type: 'string' }) apiKey: string,
    @Positional({ name: 'configPath', type: 'string' }) configPath: string
  ) {
    const manifest = JSON.parse(
      await readFile(configPath, 'utf-8')
    ) as CarouselManifest;
    const result = await this._carouselScheduler.scheduleFromManifest(
      apiKey,
      manifest
    );
    console.log(`Carrossel agendado com sucesso: ${result.length} canal(is).`);
    return result;
  }
}
