import type { Config } from 'jest';

const config: Config = {
  displayName: 'orchestrator',
  testEnvironment: 'node',
  transform: { '^.+\\.tsx?$': 'ts-jest' },
  moduleFileExtensions: ['ts', 'js', 'json'],
  rootDir: '.',
  coverageDirectory: '<rootDir>/../../coverage/orchestrator',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  moduleNameMapper: {
    '^@gitroom/orchestrator/(.*)$': '<rootDir>/src/$1',
    '^@gitroom/nestjs-libraries/(.*)$':
      '<rootDir>/../../libraries/nestjs-libraries/src/$1',
    '^@gitroom/helpers/(.*)$': '<rootDir>/../../libraries/helpers/src/$1',
  },
};

export default config;
