import { defineConfig } from 'vitest/config';

const config = {
  test: {
    include: ['src/**/*.test.ts'],
  },
};

export default defineConfig(config);
