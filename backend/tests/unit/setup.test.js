
describe('Jest Setup Verification', () => {
    it('should pass a basic truthy test', () => {
        expect(true).toBe(true);
    });

    it('should be able to import modules (ESM support)', async () => {
        const { default: httpStatusCodes } = await import('../../src/utils/http-status-codes.js');
        expect(httpStatusCodes).toBeDefined();
    });
});
