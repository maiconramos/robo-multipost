import { ExecutionContext, HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createMock } from '@gitroom/nestjs-libraries/test';
import { ProfileService } from '@gitroom/nestjs-libraries/database/prisma/profiles/profile.service';
import { RequireProfileMembershipGuard } from '../require-profile-member.guard';
import { REQUIRE_PROFILE_MEMBER_KEY } from '../require-profile-member.decorator';

const makeContext = (request: any): ExecutionContext => {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as any;
};

const baseRequest = (overrides: Record<string, any> = {}): any => ({
  user: { id: 'user-1', isSuperAdmin: false },
  org: { id: 'org-1', users: [{ role: 'USER' }] },
  params: {},
  body: {},
  profile: null as { id: string } | null,
  isOrgAdmin: false,
  ...overrides,
});

describe('RequireProfileMembershipGuard', () => {
  let guard: RequireProfileMembershipGuard;
  let reflector: jest.Mocked<Reflector>;
  let profileService: jest.Mocked<ProfileService>;

  beforeEach(() => {
    reflector = createMock<Reflector>();
    profileService = createMock<ProfileService>();
    guard = new RequireProfileMembershipGuard(reflector, profileService);
    process.env.PROFILE_MEMBERSHIP_ENFORCED = 'true';
  });

  afterEach(() => {
    delete process.env.PROFILE_MEMBERSHIP_ENFORCED;
  });

  it('returns true when no metadata is set on the handler', async () => {
    reflector.get.mockReturnValue(undefined);
    const ctx = makeContext(baseRequest());

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(profileService.getMemberRole).not.toHaveBeenCalled();
  });

  it('bypasses for SUPERADMIN user', async () => {
    reflector.get.mockReturnValue({ role: 'EDITOR' });
    const ctx = makeContext(
      baseRequest({ user: { id: 'u', isSuperAdmin: true }, isOrgAdmin: true })
    );

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(profileService.getMemberRole).not.toHaveBeenCalled();
  });

  it('bypasses for org ADMIN', async () => {
    reflector.get.mockReturnValue({ role: 'OWNER' });
    const ctx = makeContext(
      baseRequest({ org: { id: 'org-1', users: [{ role: 'ADMIN' }] }, isOrgAdmin: true })
    );

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(profileService.getMemberRole).not.toHaveBeenCalled();
  });

  it('throws 403 when USER has no membership in target profile', async () => {
    reflector.get.mockReturnValue({ role: 'VIEWER' });
    profileService.getMemberRole.mockResolvedValue(null);
    const ctx = makeContext(baseRequest({ params: { id: 'profile-1' } }));

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(HttpException);
    expect(profileService.getMemberRole).toHaveBeenCalledWith('profile-1', 'user-1');
  });

  it('throws 403 when role is below required', async () => {
    reflector.get.mockReturnValue({ role: 'EDITOR' });
    profileService.getMemberRole.mockResolvedValue({ role: 'VIEWER' } as any);
    const ctx = makeContext(baseRequest({ params: { id: 'profile-1' } }));

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(HttpException);
  });

  it('returns true when role meets required exactly', async () => {
    reflector.get.mockReturnValue({ role: 'EDITOR' });
    profileService.getMemberRole.mockResolvedValue({ role: 'EDITOR' } as any);
    const ctx = makeContext(baseRequest({ params: { id: 'profile-1' } }));

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('returns true when role exceeds required', async () => {
    reflector.get.mockReturnValue({ role: 'EDITOR' });
    profileService.getMemberRole.mockResolvedValue({ role: 'OWNER' } as any);
    const ctx = makeContext(baseRequest({ params: { id: 'profile-1' } }));

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('resolves profileId from params.profileId when params.id is missing', async () => {
    reflector.get.mockReturnValue({ role: 'VIEWER' });
    profileService.getMemberRole.mockResolvedValue({ role: 'VIEWER' } as any);
    const ctx = makeContext(baseRequest({ params: { profileId: 'profile-2' } }));

    await guard.canActivate(ctx);
    expect(profileService.getMemberRole).toHaveBeenCalledWith('profile-2', 'user-1');
  });

  it('resolves profileId from request.profile.id when params are absent', async () => {
    reflector.get.mockReturnValue({ role: 'VIEWER' });
    profileService.getMemberRole.mockResolvedValue({ role: 'VIEWER' } as any);
    const ctx = makeContext(baseRequest({ profile: { id: 'profile-3' } }));

    await guard.canActivate(ctx);
    expect(profileService.getMemberRole).toHaveBeenCalledWith('profile-3', 'user-1');
  });

  it('resolves profileId from body field when bodyField is set in metadata', async () => {
    reflector.get.mockReturnValue({ role: 'EDITOR', bodyField: 'profileId' });
    profileService.getMemberRole.mockResolvedValue({ role: 'EDITOR' } as any);
    const ctx = makeContext(baseRequest({ body: { profileId: 'profile-4' } }));

    await guard.canActivate(ctx);
    expect(profileService.getMemberRole).toHaveBeenCalledWith('profile-4', 'user-1');
  });

  it('throws 403 when no profileId can be resolved', async () => {
    reflector.get.mockReturnValue({ role: 'VIEWER' });
    const ctx = makeContext(baseRequest());

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(HttpException);
    expect(profileService.getMemberRole).not.toHaveBeenCalled();
  });

  it('skips enforcement when PROFILE_MEMBERSHIP_ENFORCED=false', async () => {
    process.env.PROFILE_MEMBERSHIP_ENFORCED = 'false';
    reflector.get.mockReturnValue({ role: 'OWNER' });
    const ctx = makeContext(baseRequest({ params: { id: 'profile-1' } }));

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(profileService.getMemberRole).not.toHaveBeenCalled();
  });

  it('enforces when PROFILE_MEMBERSHIP_ENFORCED=true', async () => {
    process.env.PROFILE_MEMBERSHIP_ENFORCED = 'true';
    reflector.get.mockReturnValue({ role: 'OWNER' });
    profileService.getMemberRole.mockResolvedValue(null);
    const ctx = makeContext(baseRequest({ params: { id: 'profile-1' } }));

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(HttpException);
  });
});
