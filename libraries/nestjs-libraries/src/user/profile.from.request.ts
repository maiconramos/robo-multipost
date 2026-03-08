import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const GetProfileFromRequest = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.profile;
  }
);
