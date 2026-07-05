import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDefined,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';

export class AddTeamMemberDto {
  @IsDefined()
  @IsEmail()
  @ValidateIf((o) => o.sendEmail)
  email: string;

  @IsString()
  @IsIn(['USER', 'ADMIN'])
  role: string;

  @IsDefined()
  @IsBoolean()
  sendEmail: boolean;

  // Obrigatorio quando role=USER: o convidado entra restrito a estes perfis
  // (memberships criadas no aceite do convite). Ignorado para ADMIN, que tem
  // acesso implicito a todos os perfis.
  @ValidateIf((o) => o.role === 'USER')
  @IsDefined()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  profileIds?: string[];

  @IsOptional()
  @IsString()
  @IsIn(['MANAGER', 'EDITOR', 'VIEWER'])
  profileRole?: 'MANAGER' | 'EDITOR' | 'VIEWER';
}
