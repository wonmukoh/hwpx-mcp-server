import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    // 표본 문서 왕복 시험은 파일이 커서 넉넉히 준다
    testTimeout: 60_000,
  },
});
