import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreatePostDto } from './create.post.dto';

const errorsFor = async (inter: unknown) => {
  const dto = plainToInstance(CreatePostDto, {
    type: 'schedule',
    shortLink: false,
    date: '2026-11-03T10:00:00.000Z',
    tags: [],
    posts: [],
    inter,
  });
  return (await validate(dto)).filter((e) => e.property === 'inter');
};

describe('CreatePostDto.inter (repetir a cada N dias)', () => {
  it.each([1, 7, 30, 3650])('aceita %p', async (value) => {
    expect(await errorsFor(value)).toHaveLength(0);
  });

  it.each([0, -1, 1.5, 3651, 1e9])('recusa %p', async (value) => {
    expect((await errorsFor(value)).length).toBeGreaterThan(0);
  });

  it('sem repeticao continua valido', async () => {
    expect(await errorsFor(undefined)).toHaveLength(0);
  });
});
