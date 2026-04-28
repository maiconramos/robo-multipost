import type { Config } from 'jest';

const config: Config = {
  displayName: 'backend',
  testEnvironment: 'node',
  transform: { '^.+\\.tsx?$': 'ts-jest' },
  moduleFileExtensions: ['ts', 'js', 'json'],
  rootDir: '.',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  moduleNameMapper: {
    '^@gitroom/backend/(.*)$': '<rootDir>/src/$1',
    '^@gitroom/nestjs-libraries/(.*)$':
      '<rootDir>/../../libraries/nestjs-libraries/src/$1',
    '^@gitroom/helpers/(.*)$': '<rootDir>/../../libraries/helpers/src/$1',
  },
};

export default config;
