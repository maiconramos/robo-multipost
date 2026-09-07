import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsString,
} from 'class-validator';

/**
 * Exclusão em massa da biblioteca de mídia. O teto de 100 ids por chamada
 * limita o custo da checagem de uso (um OR por id no filtro de posts) e o
 * número de chamadas ao bucket dentro de uma request HTTP.
 */
export class DeleteMediaDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  ids: string[];
}
