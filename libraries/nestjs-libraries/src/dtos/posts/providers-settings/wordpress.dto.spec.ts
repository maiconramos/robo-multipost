import 'reflect-metadata';
import { validate } from 'class-validator';
import { WordpressDto } from './wordpress.dto';

const validDto = (overrides: Partial<WordpressDto> = {}) =>
  Object.assign(new WordpressDto(), {
    title: 'Valid title',
    type: 'posts',
    ...overrides,
  });

describe('WordpressDto', () => {
  it('keeps categories, tags, and status optional for legacy posts', async () => {
    await expect(validate(validDto())).resolves.toHaveLength(0);
  });

  it.each(['publish', 'draft', 'pending', 'private'])(
    'accepts positive integer term IDs and status %s',
    async (status) => {
      await expect(
        validate(
          validDto({
            categories: [1, 2],
            tags: [3, 4],
            status,
          })
        )
      ).resolves.toHaveLength(0);
    }
  );

  it.each(['future', 'trash', 'invalid'])(
    'rejects status %s',
    async (status) => {
      await expect(validate(validDto({ status }))).resolves.not.toHaveLength(0);
    }
  );

  it.each([{ categories: [0] }, { categories: [-1] }, { categories: [1.5] }])(
    'rejects invalid category IDs $categories',
    async ({ categories }) => {
      await expect(
        validate(validDto({ categories }))
      ).resolves.not.toHaveLength(0);
    }
  );

  it('rejects non-numeric tag IDs', async () => {
    await expect(
      validate(validDto({ tags: ['3'] as unknown as number[] }))
    ).resolves.not.toHaveLength(0);
  });
});
