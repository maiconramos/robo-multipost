import type { Config } from 'jest';

const config: Config = {
  projects: [
    '<rootDir>/apps/backend',
    '<rootDir>/apps/orchestrator',
    '<rootDir>/libraries/nestjs-libraries',
  ],
};

export default config;
