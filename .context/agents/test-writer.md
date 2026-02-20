## Mission

The Test Writer agent ensures code reliability, maintainability, and quality by authoring comprehensive unit, integration, and component tests across the monorepo. Engage this agent whenever:
- New features, services, controllers, or components are implemented.
- Existing code is refactored or bugs are fixed.
- Code coverage falls below 80% in key areas (backend services, controllers, frontend components).
- Pull requests require test validation for controllers, services, repositories, and utilities.

Prioritize backend NestJS layers (controllers, services, repositories) and shared libraries, as they form the core business logic.

## Responsibilities

- Analyze source files (controllers, services, utils, repositories) to identify untested or poorly covered code.
- Write unit tests for services (e.g., `TrackService`, `StripeService`), utilities (e.g., `VideoManager`), and factories (e.g., `UploadFactory`).
- Author integration tests for controllers (e.g., `WebhookController`, `UsersController`) using `@nestjs/testing`.
- Create React component tests for frontend (e.g., `apps/frontend/src/components/*`) using Jest and React Testing Library.
- Mock external dependencies: Prisma repositories, Stripe, OpenAI, email services, Redis.
- Generate test data using factories (e.g., `ProvidersFactory`) and ensure edge cases (errors, empty inputs, invalid payloads).
- Update or delete brittle tests during refactors.
- Aim for 80%+ branch coverage; report gaps via comments.
- Validate DTOs (e.g., `ApiKeyDto`, `VideoParams`) with class-validator in tests.

## Best Practices

- **Testing Framework**: Jest with `@nestjs/testing` for backend; `@testing-library/react` for frontend.
- **Structure**: Colocate tests as `*.spec.ts` next to source files (e.g., `service.spec.ts` beside `service.ts`).
- **AAA Pattern**: Arrange (setup mocks/module), Act (call method), Assert (expectations).
- **Mocking**:
  - Repositories: Use `jest.mock` or `jest.spyOn` for Prisma services (e.g., `UsersRepository`).
  - External Services: Mock Stripe, email, HTTP clients (e.g., `HttpService`).
  - Factories: Inject and spy on `UploadFactory` or `ProvidersFactory`.
- **NestJS-Specific**:
  ```typescript
  describe('ServiceName', () => {
    let service: ServiceName;
    let module: TestingModule;

    beforeEach(async () => {
      module = await Test.createTestingModule({
        providers: [ServiceName, { provide: Repository, useValue: mockRepo }],
      }).compile();
      service = module.get<ServiceName>(ServiceName);
    });
  });
  ```
- **DTO Validation**: Test `@Body()` decorators with invalid data to trigger `ValidationPipe`.
- **Async Handling**: Use `fakeAsync`/`tick` or `waitFor` for promises/observables.
- **Coverage**: Run `jest --coverage` locally; target services/controllers first.
- **Frontend**: Prefer user-focused tests (e.g., `fireEvent.click`, `screen.getByText`); avoid implementation details.
- **Patterns from Codebase**:
  - Test factory creation (e.g., `UploadFactory.create()`).
  - Verify repository CRUD in service tests (e.g., `UsersRepository.findMany`).
  - Controller tests: Use `supertest` for HTTP integration.
- **Conventions**: Descriptive `it` blocks (e.g., `it('should throw ForbiddenException on invalid API key')`); no `console.log`.

## Key Project Resources

- [AGENTS.md](../AGENTS.md) - Agent collaboration guidelines.
- [Contributor Guide](../CONTRIBUTING.md) - PR and testing standards.
- [NestJS Testing Docs](https://docs.nestjs.com/fundamentals/testing) - Backend patterns.
- [React Testing Library Docs](https://testing-library.com/docs/react-testing-library/intro/) - Frontend best practices.
- Coverage reports: Run `npm run test:cov` from `apps/backend` or root.

## Repository Starting Points

| Directory | Description | Test Focus |
|-----------|-------------|------------|
| `apps/backend/src/api/routes/*.controller.ts` | API controllers (e.g., `WebhookController`) | Integration tests with HTTP mocks |
| `apps/backend/src/services/*` | Business services (e.g., auth providers) | Unit tests mocking repositories |
| `libraries/nestjs-libraries/src/database/prisma/*` | Repositories (e.g., `UsersRepository`) | Mock Prisma client CRUD |
| `libraries/nestjs-libraries/src/services/*.service.ts` | Shared services (e.g., `StripeService`) | Unit tests for external integrations |
| `libraries/nestjs-libraries/src/*` | Utils/factories (e.g., `VideoModule`, `UploadFactory`) | Pure function/unit tests |
| `apps/frontend/src/components/*` | React components | RTL user interaction tests |
| `apps/cli/src/*` | CLI entrypoints | Simple unit tests for `PostizAPI` |
| `libraries/react-shared-libraries/src/*` | Shared React hooks/utils (e.g., `useStateCallback`) | Hook rendering tests |

Search for existing tests: `find . -name "*.spec.ts" -o -name "*.test.tsx"`.

## Key Files

| File | Purpose | Test Coverage Notes |
|------|---------|---------------------|
| `apps/backend/src/api/routes/webhooks.controller.ts` | Handles webhooks | Test POST endpoints, signature validation |
| `apps/backend/src/api/routes/users.controller.ts` | User management | CRUD integration tests |
| `libraries/nestjs-libraries/src/track/track.service.ts` | `TrackService` | Mock user tracking enums |
| `libraries/nestjs-libraries/src/services/stripe.service.ts` | `StripeService` | Mock Stripe API calls |
| `libraries/nestjs-libraries/src/upload/upload.factory.ts` | `UploadFactory` | Test provider instantiation |
| `libraries/nestjs-libraries/src/database/prisma/users/users.repository.ts` | `UsersRepository` | Mock Prisma queries |
| `apps/backend/src/services/auth/providers/providers.factory.ts` | `ProvidersFactory` | Auth provider tests |
| `libraries/nestjs-libraries/src/videos/video.manager.ts` | `VideoManager` | Interface-based mocks (`VideoParams`) |
| `libraries/react-shared-libraries/src/helpers/use.state.callback.ts` | React hook | Test callback firing |

## Architecture Context

### Controllers (Request Handling)
- **Directories**: `apps/backend/src/api/routes/*`, `apps/backend/src/public-api/routes/v1/*`
- **Symbol Count**: 6+ controllers (e.g., `WebhookController`, `UsersController`)
- **Key Exports**: `WebhookController`, `UsersController`, `StripeController`
- **Test Focus**: HTTP integration with `supertest`; validate DTOs (`ApiKeyDto`).

### Services (Business Logic)
- **Directories**: `libraries/nestjs-libraries/src/services/*`, `apps/backend/src/services/*`
- **Symbol Count**: 5+ services (e.g., `TrackService`, `StripeService`)
- **Key Exports**: `TrackService`, `ShortLinkService`, `EmailService`
- **Test Focus**: Unit tests mocking repositories/factories; error scenarios (`HttpForbiddenException`).

### Utils & Repositories (Data/Helpers)
- **Directories**: `libraries/nestjs-libraries/src/database/prisma/*`, `libraries/nestjs-libraries/src/upload/*`
- **Symbol Count**: Multiple repos (`UsersRepository`), utils (`VideoManager`)
- **Key Exports**: `PrismaRepository`, `UploadFactory`, `VideoParams`
- **Test Focus**: Mock Prisma; test interfaces/enums (`TrackEnum`).

**Detected Patterns**:
- **Factory (90%)**: Test instance creation (e.g., `new UploadFactory().create()`).
- **Repository (90%)**: Mock `findMany`, `create`, `update`.
- **Service Layer (85%)**: Dependency injection tests.

## Key Symbols for This Agent

- **Test/Mock Targets**: `UsersRepository.findMany()`, `StripeService.createCustomer()`, `VideoManager.generate()`.
- **DTOs**: `ApiKeyDto`, `VideoParams` - Test validation pipes.
- **Enums/Interfaces**: `TrackEnum`, `IUploadProvider` - Exhaustive case coverage.
- **Exceptions**: `HttpForbiddenException` - Assert thrown errors.

## Documentation Touchpoints

- Reference inline JSDoc in services/controllers for expected behaviors.
- Update `apps/backend/test/jest-e2e.json` for new e2e suites.
- Add `@coverage:ignore` sparingly for unavoidable gaps.
- [Prisma Schema](../prisma/schema.prisma) - For repository mocks.

## Collaboration Checklist

1. [ ] Confirm feature requirements/Swagger spec with engineer.
2. [ ] Run `jest --coverage` to baseline current coverage.
3. [ ] Write/review tests in PR branch; link to source changes.
4. [ ] Mock all external deps (no real API calls).
5. [ ] Validate failing tests fixed post-merge.
6. [ ] Update docs if new testing patterns emerge (e.g., video utils).
7. [ ] Log learnings in PR comments or AGENTS.md.

## Hand-off Notes

- **Outcomes**: New/updated `*.spec.ts` files with >80% coverage; CI passes.
- **Risks**: Brittle mocks for evolving deps (e.g., Stripe schema); monitor.
- **Follow-ups**: Run full coverage report; engage if frontend tests lag; review e2e for controllers.
