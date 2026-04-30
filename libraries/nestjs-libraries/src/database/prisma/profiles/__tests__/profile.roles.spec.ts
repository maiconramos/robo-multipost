import {
  PROFILE_ROLE_RANK,
  hasMinProfileRole,
} from '../profile.roles';

describe('profile.roles', () => {
  describe('PROFILE_ROLE_RANK', () => {
    it('ranks OWNER > MANAGER > EDITOR > VIEWER', () => {
      expect(PROFILE_ROLE_RANK.OWNER).toBeGreaterThan(PROFILE_ROLE_RANK.MANAGER);
      expect(PROFILE_ROLE_RANK.MANAGER).toBeGreaterThan(PROFILE_ROLE_RANK.EDITOR);
      expect(PROFILE_ROLE_RANK.EDITOR).toBeGreaterThan(PROFILE_ROLE_RANK.VIEWER);
    });
  });

  describe('hasMinProfileRole', () => {
    it('returns true when actual equals required', () => {
      expect(hasMinProfileRole('EDITOR', 'EDITOR')).toBe(true);
    });

    it('returns true when actual exceeds required', () => {
      expect(hasMinProfileRole('OWNER', 'VIEWER')).toBe(true);
      expect(hasMinProfileRole('MANAGER', 'EDITOR')).toBe(true);
    });

    it('returns false when actual is below required', () => {
      expect(hasMinProfileRole('VIEWER', 'EDITOR')).toBe(false);
      expect(hasMinProfileRole('EDITOR', 'OWNER')).toBe(false);
    });

    it('returns false when actual is null/undefined', () => {
      expect(hasMinProfileRole(null, 'VIEWER')).toBe(false);
      expect(hasMinProfileRole(undefined, 'EDITOR')).toBe(false);
    });
  });
});
