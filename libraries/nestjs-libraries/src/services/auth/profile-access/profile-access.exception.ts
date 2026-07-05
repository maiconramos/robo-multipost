import { HttpException, HttpStatus } from '@nestjs/common';

// 403 dedicados. NAO estender HttpForbiddenException: o HttpExceptionFilter
// global converte aquela classe em 401 + limpeza do cookie de auth (logout
// forcado), o que impediria o frontend de renderizar o estado bloqueado.

export class NoProfileAssignedException extends HttpException {
  constructor() {
    super(
      { message: 'No profile assigned', code: 'NO_PROFILE_ASSIGNED' },
      HttpStatus.FORBIDDEN
    );
  }
}

export class ProfileReadOnlyException extends HttpException {
  constructor() {
    super(
      {
        message: 'Profile is read-only for this member',
        code: 'PROFILE_READ_ONLY',
      },
      HttpStatus.FORBIDDEN
    );
  }
}

export class ProfileManageDeniedException extends HttpException {
  constructor() {
    super(
      {
        message: 'Profile management requires OWNER or MANAGER role',
        code: 'PROFILE_MANAGE_DENIED',
      },
      HttpStatus.FORBIDDEN
    );
  }
}
