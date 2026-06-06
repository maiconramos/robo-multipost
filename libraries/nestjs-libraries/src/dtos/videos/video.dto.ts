import {
  IsIn, Validate, ValidationArguments, ValidatorConstraint, ValidatorConstraintInterface
} from 'class-validator';
import { VideoAbstract } from '@gitroom/nestjs-libraries/videos/video.interface';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

@ValidatorConstraint({ name: 'checkInRuntime', async: false })
export class ValidIn implements ValidatorConstraintInterface {
  private _load() {
    return (Reflect.getMetadata('video', VideoAbstract) || [])
      .filter((f: any) => f.available)
      .map((p: any) => p.identifier);
  }

  validate(text: string, args: ValidationArguments) {
    // Check if the text is in the list of valid video types
    const validTypes = this._load();
    return validTypes.includes(text);
  }

  defaultMessage(args: ValidationArguments) {
    // here you can provide default error message if validation failed
    return 'type must be any of: ' + this._load().join(', ');
  }
}

export class VideoDto {
  @ApiProperty({ description: 'Identificador do tipo de vídeo (validado em runtime contra os geradores disponíveis).' })
  @Validate(ValidIn)
  type: string;

  @ApiProperty({ enum: ['vertical', 'horizontal'], description: 'Orientação do vídeo de saída.' })
  @IsIn(['vertical', 'horizontal'])
  output: 'vertical' | 'horizontal';

  @ApiPropertyOptional({ description: 'Parâmetros específicos do tipo de vídeo (chave/valor).' })
  customParams: any;
}
