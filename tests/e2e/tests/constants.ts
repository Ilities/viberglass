export const TestConstants = {
    // Use 'localhost' because tests run on host and backend runs on host (via npm run dev)
    BACKEND_URL: process.env.BACKEND_URL || 'http://localhost:8888',
    FRONTEND_URL: process.env.BASE_URL || 'http://localhost:3000',
    MOCK_SERVER_PORT: 9999,
};
