export default {
  'backend/**/*.{ts,js}': [
    'backend/node_modules/.bin/eslint --config backend/eslint.config.mjs --fix --no-warn-ignored',
    'backend/node_modules/.bin/prettier --config backend/.prettierrc --write',
  ],
  'frontend/**/*.{ts,tsx,js,jsx}': [
    'frontend/node_modules/.bin/eslint --config frontend/eslint.config.mjs --fix --no-warn-ignored',
    'frontend/node_modules/.bin/prettier --write',
  ],
};