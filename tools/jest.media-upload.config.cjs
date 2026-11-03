module.exports = {
  rootDir: '..',
  displayName: 'media-upload-client',
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      { tsconfig: 'tools/tsconfig.media-upload.json' },
    ],
  },
  testMatch: ['<rootDir>/tools/upload-media-mcp.spec.ts'],
};
