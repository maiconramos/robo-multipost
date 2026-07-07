import {
  IsBoolean,
  IsDefined,
  IsEmail,
  IsIn,
  IsString,
  ValidateIf,
} from 'class-validator';

// Convite escopado a UM perfil: o Dono/Gerente (ou admin) convida alguem por
// e-mail para o proprio perfil. O papel concedido e limitado ao do convidante
// (validado no ProfileService.assertCanGrantProfileRole).
export class InviteProfileMemberDto {
  @IsDefined()
  @IsEmail()
  @ValidateIf((o) => o.sendEmail)
  email: string;

  @IsString()
  @IsIn(['OWNER', 'MANAGER', 'EDITOR', 'VIEWER'])
  profileRole: 'OWNER' | 'MANAGER' | 'EDITOR' | 'VIEWER';

  @IsDefined()
  @IsBoolean()
  sendEmail: boolean;
}
