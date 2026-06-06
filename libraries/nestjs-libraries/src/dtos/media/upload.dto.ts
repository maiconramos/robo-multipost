import { IsDefined, IsString, Validate } from 'class-validator';
import { ValidUrlExtension } from '@gitroom/helpers/utils/valid.url.path';
import { IsSafeWebhookUrl } from '@gitroom/nestjs-libraries/dtos/webhooks/webhook.url.validator';
import { ApiProperty } from '@nestjs/swagger';

export class UploadDto {
  @ApiProperty({
    description:
      'URL https pública da mídia a baixar (extensão válida; não pode apontar para rede interna).',
    example: 'https://seu-cdn.com/imagem.jpg',
  })
  @IsString()
  @IsDefined()
  @Validate(ValidUrlExtension)
  @IsSafeWebhookUrl({
    message:
      'URL must be a public HTTPS URL and cannot point to internal network addresses',
  })
  url: string;
}
