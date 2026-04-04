import { SubscriptionRepository } from '../subscription.repository';
import { Organization } from '@prisma/client';
import dayjs from 'dayjs';

const makeOrg = (overrides?: Partial<Organization>): Organization =>
  ({
    id: 'org-1',
    name: 'Test Org',
    paymentId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Organization);

// Mock PrismaRepository instances
const mockCreditsModel = {
  model: {
    credits: {
      groupBy: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
  },
};

const mockSubscriptionModel = { model: { subscription: {} } };
const mockOrganizationModel = { model: { organization: {} } };
const mockUserModel = { model: { user: {} } };
const mockUsedCodesModel = { model: { usedCodes: {} } };

describe('SubscriptionRepository', () => {
  let repository: SubscriptionRepository;

  beforeEach(() => {
    jest.resetAllMocks();
    repository = new SubscriptionRepository(
      mockSubscriptionModel as any,
      mockOrganizationModel as any,
      mockUserModel as any,
      mockCreditsModel as any,
      mockUsedCodesModel as any
    );
  });

  // --- Wave 1: useCredit tests ---

  describe('useCredit', () => {
    it('should register credit and execute function successfully', async () => {
      mockCreditsModel.model.credits.create.mockResolvedValue({ id: 'credit-1' });
      const func = jest.fn().mockResolvedValue('result');

      const result = await repository.useCredit(makeOrg(), 'ai_images', func);

      expect(result).toBe('result');
      expect(mockCreditsModel.model.credits.create).toHaveBeenCalledWith({
        data: { organizationId: 'org-1', credits: 1, type: 'ai_images' },
      });
      expect(func).toHaveBeenCalled();
    });

    it('should rollback credit when function fails', async () => {
      mockCreditsModel.model.credits.create.mockResolvedValue({ id: 'credit-1' });
      mockCreditsModel.model.credits.delete.mockResolvedValue({});
      const error = new Error('generation failed');
      const func = jest.fn().mockRejectedValue(error);

      await expect(repository.useCredit(makeOrg(), 'ai_images', func)).rejects.toThrow(
        'generation failed'
      );
      expect(mockCreditsModel.model.credits.delete).toHaveBeenCalledWith({
        where: { id: 'credit-1' },
      });
    });

    it('should register credit with correct type', async () => {
      mockCreditsModel.model.credits.create.mockResolvedValue({ id: 'credit-2' });
      const func = jest.fn().mockResolvedValue('ok');

      await repository.useCredit(makeOrg(), 'ai_videos', func);

      expect(mockCreditsModel.model.credits.create).toHaveBeenCalledWith({
        data: { organizationId: 'org-1', credits: 1, type: 'ai_videos' },
      });
    });

    it('should register profileId when provided', async () => {
      mockCreditsModel.model.credits.create.mockResolvedValue({ id: 'credit-3' });
      const func = jest.fn().mockResolvedValue('ok');

      await repository.useCredit(makeOrg(), 'ai_images', func, 'profile-1');

      expect(mockCreditsModel.model.credits.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-1',
          credits: 1,
          type: 'ai_images',
          profileId: 'profile-1',
        },
      });
    });
  });

  // --- Wave 2: getCreditsFrom tests ---

  describe('getCreditsFrom', () => {
    it('should filter by profileId when provided', async () => {
      mockCreditsModel.model.credits.groupBy.mockResolvedValue([
        { organizationId: 'org-1', _sum: { credits: 5 } },
      ]);

      const result = await repository.getCreditsFrom(
        'org-1',
        dayjs('2026-04-01'),
        'ai_images',
        'profile-1'
      );

      expect(result).toBe(5);
      expect(mockCreditsModel.model.credits.groupBy).toHaveBeenCalledWith({
        by: ['organizationId'],
        where: {
          organizationId: 'org-1',
          type: 'ai_images',
          profileId: 'profile-1',
          createdAt: { gte: dayjs('2026-04-01').toDate() },
        },
        _sum: { credits: true },
      });
    });

    it('should not filter by profileId when not provided', async () => {
      mockCreditsModel.model.credits.groupBy.mockResolvedValue([]);

      await repository.getCreditsFrom('org-1', dayjs('2026-04-01'), 'ai_images');

      const callArgs = mockCreditsModel.model.credits.groupBy.mock.calls[0][0];
      expect(callArgs.where).not.toHaveProperty('profileId');
    });
  });
});
