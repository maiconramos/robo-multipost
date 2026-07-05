import { IsDefined, IsIn, IsString } from 'class-validator';

export class AddProfileMemberDto {
  @IsDefined()
  @IsString()
  userId: string;

  @IsDefined()
  @IsString()
  @IsIn(['OWNER', 'MANAGER', 'EDITOR', 'VIEWER'])
  role: 'OWNER' | 'MANAGER' | 'EDITOR' | 'VIEWER';
}
