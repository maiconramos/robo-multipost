import { Test, TestingModule } from '@nestjs/testing';
import { Provider, Type } from '@nestjs/common';
import { createMock } from './mock.factory';

interface MockOverride {
  provide: Type<any> | string | symbol;
  useValue?: any;
}

/**
 * Factory para criar TestingModule do NestJS com mocks automaticos.
 * Util para services com muitas dependencias injetadas.
 *
 * Uso:
 *   const { module, mocks } = await createTestModule({
 *     service: PostsService,
 *     mocks: [PostsRepository, IntegrationManager, ShortLinkService],
 *   });
 *
 *   const service = module.get(PostsService);
 *   const repoMock = mocks.get(PostsRepository);
 *   repoMock.createPost.mockResolvedValue({...});
 */
export async function createTestModule<T>(options: {
  service: Type<T>;
  mocks: Type<any>[];
  overrides?: MockOverride[];
}) {
  const mockMap = new Map<Type<any>, any>();
  const providers: Provider[] = [options.service];

  for (const dep of options.mocks) {
    const mockInstance = createMock<any>();
    mockMap.set(dep, mockInstance);
    providers.push({ provide: dep, useValue: mockInstance });
  }

  if (options.overrides) {
    for (const override of options.overrides) {
      providers.push({
        provide: override.provide,
        useValue: override.useValue ?? createMock<any>(),
      });
    }
  }

  const module: TestingModule = await Test.createTestingModule({
    providers,
  }).compile();

  return {
    module,
    service: module.get<T>(options.service),
    mocks: mockMap,
  };
}
