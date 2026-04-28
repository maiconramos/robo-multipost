// Mock problematic transitive dependencies before importing service
jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({}));
jest.mock('@gitroom/nestjs-libraries/database/prisma/integrations/integration.service', () => ({
  IntegrationService: jest.fn(),
}));
jest.mock('@gitroom/nestjs-libraries/database/prisma/organizations/organization.service', () => ({
  OrganizationService: jest.fn(),
}));

import { SubscriptionService } from '../subscription.service';
import { SubscriptionRepository } from '../subscription.repository';
import { Organization } from '@prisma/client';

// Minimal mock types
const mockRepository = {
  getCreditsFrom: jest.fn(),
  useCredit: jest.fn(),
  getSubscriptionByOrganizationId: jest.fn(),
  getCode: jest.fn(),
  deleteSubscriptionByCustomerId: jest.fn(),
  updateCustomerId: jest.fn(),
  checkSubscription: jest.fn(),
  getSubscriptionByOrgId: jest.fn(),
  getSubscriptionByCustomerId: jest.fn(),
  getOrganizationByCustomerId: jest.fn(),
  createOrUpdateSubscription: jest.fn(),
  getSubscriptionByIdentifier: jest.fn(),
  getSubscription: jest.fn(),
  setCustomerId: jest.fn(),
  getUserAccount: jest.fn(),
  updateAccount: jest.fn(),
  updateConnectedStatus: jest.fn(),
  getCustomerIdByOrgId: jest.fn(),
} as unknown as jest.Mocked<SubscriptionRepository>;

const mockIntegrationService = {
  getIntegrationsList: jest.fn(),
  disableIntegrations: jest.fn(),
  changeActiveCron: jest.fn(),
} as any;

const mockOrganizationService = {
  disableOrEnableNonSuperAdminUsers: jest.fn(),
} as any;

const makeOrg = (overrides?: Partial<Organization>): Organization =>
  ({
    id: 'org-1',
    name: 'Test Org',
    paymentId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Organization);

const makeProfile = (overrides?: Record<string, any>) => ({
  id: 'profile-1',
  isDefault: false,
  aiImageCredits: null as number | null,
  aiVideoCredits: null as number | null,
  ...overrides,
});

describe('SubscriptionService', () => {
  let service: SubscriptionService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new SubscriptionService(
      mockRepository,
      mockIntegrationService,
      mockOrganizationService
    );
  });

  // --- Wave 1: Unlimited mode tests ---

  describe('checkCredits - unlimited mode', () => {
    it('should return 999999 when AI_CREDITS_MODE=unlimited', async () => {
      process.env.AI_CREDITS_MODE = 'unlimited';
      const result = await service.checkCredits(makeOrg());
      expect(result).toEqual({ credits: 999999 });
    });

    it('should return 999999 when AI_CREDITS_MODE is not set (default)', async () => {
      delete process.env.AI_CREDITS_MODE;
      const result = await service.checkCredits(makeOrg());
      expect(result).toEqual({ credits: 999999 });
    });

    it('should return 999999 for ai_videos in unlimited mode', async () => {
      process.env.AI_CREDITS_MODE = 'unlimited';
      const result = await service.checkCredits(makeOrg(), 'ai_videos');
      expect(result).toEqual({ credits: 999999 });
    });

    it('should return unlimited and ignore profile config in unlimited mode', async () => {
      process.env.AI_CREDITS_MODE = 'unlimited';
      const profile = makeProfile({ aiImageCredits: 0 }); // blocked profile
      const result = await service.checkCredits(makeOrg(), 'ai_images', profile);
      expect(result).toEqual({ credits: 999999 });
    });
  });

  // --- Wave 1: Managed mode fallback tests ---

  describe('checkCredits - managed mode without profile', () => {
    it('should return unlimited when no profile and default env is -1', async () => {
      process.env.AI_CREDITS_MODE = 'managed';
      delete process.env.AI_CREDITS_DEFAULT_IMAGES;
      const result = await service.checkCredits(makeOrg());
      expect(result).toEqual({ credits: 999999 });
    });
  });

  // --- Wave 2: Per-profile credit tests ---

  describe('checkCredits - managed mode with profile', () => {
    beforeEach(() => {
      process.env.AI_CREDITS_MODE = 'managed';
    });

    afterEach(() => {
      delete process.env.AI_CREDITS_MODE;
      delete process.env.AI_CREDITS_DEFAULT_IMAGES;
      delete process.env.AI_CREDITS_DEFAULT_VIDEOS;
    });

    it('should return unlimited for default profile in managed mode', async () => {
      const profile = makeProfile({ isDefault: true });
      const result = await service.checkCredits(makeOrg(), 'ai_images', profile);
      expect(result).toEqual({ credits: 999999 });
    });

    it('should return remaining credits for profile with aiImageCredits=50 and 10 used', async () => {
      mockRepository.getCreditsFrom.mockResolvedValue(10);
      const profile = makeProfile({ aiImageCredits: 50 });
      const result = await service.checkCredits(makeOrg(), 'ai_images', profile);
      expect(result).toEqual({ credits: 40 });
      expect(mockRepository.getCreditsFrom).toHaveBeenCalledWith(
        'org-1',
        expect.anything(),
        'ai_images',
        'profile-1'
      );
    });

    it('should return unlimited for profile with aiImageCredits=-1', async () => {
      const profile = makeProfile({ aiImageCredits: -1 });
      const result = await service.checkCredits(makeOrg(), 'ai_images', profile);
      expect(result).toEqual({ credits: 999999 });
    });

    it('should return blocked (0) for profile with aiImageCredits=0', async () => {
      const profile = makeProfile({ aiImageCredits: 0 });
      const result = await service.checkCredits(makeOrg(), 'ai_images', profile);
      expect(result).toEqual({ credits: 0 });
    });

    it('should use AI_CREDITS_DEFAULT_IMAGES env when profile has no config', async () => {
      process.env.AI_CREDITS_DEFAULT_IMAGES = '50';
      mockRepository.getCreditsFrom.mockResolvedValue(5);
      const profile = makeProfile({ aiImageCredits: null, aiVideoCredits: null });
      const result = await service.checkCredits(makeOrg(), 'ai_images', profile);
      expect(result).toEqual({ credits: 45 });
    });

    it('should return unlimited when profile has no config and no env default', async () => {
      delete process.env.AI_CREDITS_DEFAULT_IMAGES;
      const profile = makeProfile({ aiImageCredits: null, aiVideoCredits: null });
      const result = await service.checkCredits(makeOrg(), 'ai_images', profile);
      expect(result).toEqual({ credits: 999999 });
    });

    it('should use aiVideoCredits for ai_videos check type', async () => {
      mockRepository.getCreditsFrom.mockResolvedValue(3);
      const profile = makeProfile({ aiVideoCredits: 10 });
      const result = await service.checkCredits(makeOrg(), 'ai_videos', profile);
      expect(result).toEqual({ credits: 7 });
    });
  });
});
