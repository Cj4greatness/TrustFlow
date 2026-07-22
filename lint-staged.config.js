export default {
  'backend/**/*.{ts,js}': [
    'bash -c "cd backend && pnpm exec eslint --fix --no-warn-ignored"',
    'bash -c "cd backend && pnpm exec prettier --write"',
  ],
  'frontend/**/*.{ts,tsx,js,jsx}': [
    'bash -c "cd frontend && pnpm exec eslint --fix --no-warn-ignored"',
    'bash -c "cd frontend && pnpm exec prettier --write"',
  ],
};