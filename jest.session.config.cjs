module.exports = {
  roots: ['<rootDir>/src'],
  testMatch: ['<rootDir>/src/utils/sessionClient.test.js', '<rootDir>/src/AppContent.session.test.js', '<rootDir>/src/routes/DynamicRouterWrapper.session.test.js'],
  testEnvironment: 'jsdom',
  setupFiles: ['<rootDir>/tests/session-setup.cjs'],
  transform: { '^.+\\.[jt]sx?$': '<rootDir>/node_modules/react-scripts/config/jest/babelTransform.js' },
  moduleNameMapper: {
    '^react-router-dom$': '<rootDir>/node_modules/react-router-dom/dist/index.js',
    '^react-router$': '<rootDir>/node_modules/react-router/dist/development/index.js',
    '^react-router/dom$': '<rootDir>/node_modules/react-router/dist/development/dom-export.js',
  },
};
