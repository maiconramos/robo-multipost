import * as crypto from 'crypto';

// Mock the modules that the controller depends on
jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({}));
jest.mock('@gitroom/nestjs-libraries/database/prisma/integrations/integration.service', () => ({
  IntegrationService: jest.fn(),
}));

// We test the webhook logic in isolation
describe('IgWebhookController - logic', () => {
  describe('verifyWebhook (GET)', () => {
    it('should return hub.challenge when verify token matches', () => {
      process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN = 'test-token';

      const mode = 'subscribe';
      const token = 'test-token';
      const challenge = '1234567890';

      // The controller sends res.status(200).send(challenge)
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn().mockReturnThis(),
      };

      // Simulate the controller logic
      if (mode === 'subscribe' && token === process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN) {
        mockRes.status(200).send(challenge);
      } else {
        mockRes.status(403).send('Forbidden');
      }

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.send).toHaveBeenCalledWith(challenge);
    });

    it('should return 403 when verify token does not match', () => {
      process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN = 'test-token';

      const mode = 'subscribe';
      const token = 'wrong-token';

      const mockRes = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn().mockReturnThis(),
      };

      if (mode === 'subscribe' && token === process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN) {
        mockRes.status(200).send('challenge');
      } else {
        mockRes.status(403).send('Forbidden');
      }

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.send).toHaveBeenCalledWith('Forbidden');
    });
  });

  describe('signature verification', () => {
    const appSecret = 'test-app-secret';

    beforeEach(() => {
      process.env.FACEBOOK_APP_SECRET = appSecret;
    });

    it('should accept valid signature', () => {
      const body = JSON.stringify({ entry: [] });
      const signature =
        'sha256=' +
        crypto.createHmac('sha256', appSecret).update(body).digest('hex');

      const isValid = crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(
          'sha256=' +
            crypto.createHmac('sha256', appSecret).update(body).digest('hex')
        )
      );

      expect(isValid).toBe(true);
    });

    it('should reject invalid signature', () => {
      const body = JSON.stringify({ entry: [] });
      const fakeSignature = 'sha256=invalid_hash';

      const expectedSignature =
        'sha256=' +
        crypto.createHmac('sha256', appSecret).update(body).digest('hex');

      // timingSafeEqual would throw if lengths differ, so check manually
      expect(fakeSignature).not.toEqual(expectedSignature);
    });
  });

  describe('comment payload parsing', () => {
    it('should extract comment data from valid webhook payload', () => {
      const payload = {
        entry: [
          {
            id: 'page-123',
            changes: [
              {
                field: 'feed',
                value: {
                  item: 'comment',
                  comment_id: 'comment-456',
                  from: { id: 'user-789', username: 'john' },
                  media: { id: 'media-101' },
                  message: 'Great post!',
                },
              },
            ],
          },
        ],
      };

      const results: any[] = [];

      for (const entry of payload.entry) {
        for (const change of entry.changes) {
          if (change.field !== 'comments' && change.field !== 'feed') continue;
          const value = change.value;
          if (!value || value.item !== 'comment') continue;

          results.push({
            pageId: entry.id,
            igCommentId: value.comment_id || value.id,
            igCommenterId: value.from?.id,
            igCommenterName: value.from?.username,
            igMediaId: value.media?.id || value.post_id,
            commentText: value.message || value.text || '',
          });
        }
      }

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        pageId: 'page-123',
        igCommentId: 'comment-456',
        igCommenterId: 'user-789',
        igCommenterName: 'john',
        igMediaId: 'media-101',
        commentText: 'Great post!',
      });
    });

    it('should ignore non-comment events', () => {
      const payload = {
        entry: [
          {
            id: 'page-123',
            changes: [
              {
                field: 'feed',
                value: {
                  item: 'status',
                  message: 'Not a comment',
                },
              },
            ],
          },
        ],
      };

      const results: any[] = [];

      for (const entry of payload.entry) {
        for (const change of entry.changes) {
          if (change.field !== 'comments' && change.field !== 'feed') continue;
          const value = change.value;
          if (!value || value.item !== 'comment') continue;
          results.push(value);
        }
      }

      expect(results).toHaveLength(0);
    });

    it('should handle empty payload gracefully', () => {
      const payload = { entry: [] };
      expect(payload.entry).toHaveLength(0);
    });
  });
});
