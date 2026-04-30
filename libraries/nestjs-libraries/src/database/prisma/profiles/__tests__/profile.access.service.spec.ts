import { ProfileService } from '../profile.service';

const makeRepo = () => ({
  getProfilesByOrgId: jest.fn(),
  getUserProfileIds: jest.fn(),
});

describe('ProfileService - getAccessibleProfiles', () => {
  let service: ProfileService;
  let repo: ReturnType<typeof makeRepo>;

  beforeEach(() => {
    repo = makeRepo();
    service = new ProfileService(repo as any);
  });

  it('returns all profiles when user is org admin', async () => {
    const profiles = [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }];
    repo.getProfilesByOrgId.mockResolvedValue(profiles);

    const result = await service.getAccessibleProfiles('org-1', 'user-1', true);

    expect(result).toEqual(profiles);
    expect(repo.getUserProfileIds).not.toHaveBeenCalled();
  });

  it('returns intersection of memberships for non-admin user', async () => {
    const profiles = [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }];
    repo.getProfilesByOrgId.mockResolvedValue(profiles);
    repo.getUserProfileIds.mockResolvedValue([
      { profileId: 'p1' },
      { profileId: 'p3' },
    ]);

    const result = await service.getAccessibleProfiles('org-1', 'user-1', false);

    expect(result).toEqual([{ id: 'p1' }, { id: 'p3' }]);
  });

  it('returns empty array when non-admin has no memberships', async () => {
    repo.getProfilesByOrgId.mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]);
    repo.getUserProfileIds.mockResolvedValue([]);

    const result = await service.getAccessibleProfiles('org-1', 'user-1', false);

    expect(result).toEqual([]);
  });
});
