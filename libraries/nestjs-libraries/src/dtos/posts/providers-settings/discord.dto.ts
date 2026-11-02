import { IsDefined, IsString, Matches, MinLength } from 'class-validator';
import { JSONSchema } from 'class-validator-jsonschema';

export class DiscordDto {
  // id (snowflake) do canal: texto livre ia direto no caminho da API do bot
  @Matches(/^\d{5,25}$/, { message: 'Channel must be a Discord channel id' })
  @MinLength(1)
  @IsDefined()
  @IsString()
    @JSONSchema({
    description: 'Channel must be an id',
  })
  channel: string;
}
