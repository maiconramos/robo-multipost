import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class UpdateOAuthAppDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @IsString()
  @IsOptional()
  pictureId?: string;

  @IsString()
  @IsOptional()
  // so http(s): a tela de consentimento navega para este endereco
  @IsUrl({
    require_tld: false,
    require_protocol: true,
    protocols: ['http', 'https'],
  })
  redirectUrl?: string;
}
