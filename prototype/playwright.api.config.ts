import { defineConfig } from '@playwright/test'
export default defineConfig({testDir:'./tests/e2e',testMatch:'api.spec.ts',timeout:30000,use:{baseURL:'http://127.0.0.1:4174',trace:'retain-on-failure'},workers:1})
