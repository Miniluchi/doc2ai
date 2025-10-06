import { defineConfig } from '@prisma/client/configs';

export default defineConfig({
  datasources: {
    db: {
      provider: 'sqlite',
      url: process.env.DATABASE_URL,
    },
  },
});
