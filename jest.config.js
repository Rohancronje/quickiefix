/** Jest config — pure logic + backend tests in plain Node (no RN runtime). */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.jest.json' }],
  },
  moduleNameMapper: {
    // The mock backend imports AsyncStorage; swap it for an in-memory shim so it
    // runs in Node without the React Native runtime.
    '^@react-native-async-storage/async-storage$': '<rootDir>/test/asyncStorageMock.ts',
  },
  clearMocks: true,
};
