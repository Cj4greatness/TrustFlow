export default {
  'backend/**/*.{ts,js}': [
    'backend/node_modules/.bin/eslint --fix --no-warn-ignored',
    'backend/node_modules/.bin/prettier --write',
  ],
  'frontend/**/*.{ts,tsx,js,jsx}': [
    'frontend/node_modules/.bin/eslint --fix --no-warn-ignored',
    'frontend/node_modules/.bin/prettier --write',
  ],
};