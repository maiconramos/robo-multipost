import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const GetPublicApiProfileId = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string | undefined =>
    (ctx.switchToHttp().getRequest() as any).publicApiProfileId
);
