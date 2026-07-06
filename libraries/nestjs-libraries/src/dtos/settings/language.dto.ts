import { IsIn } from 'class-validator';

export class LanguageDto {
  @IsIn(['pt', 'en'])
  language: string;
}
