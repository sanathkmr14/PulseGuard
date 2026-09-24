import { describe, it, expect } from '@jest/globals';

describe('E2E Sanity Test', () => {
    it('verifies jest runner operates in ESM mode', () => {
        expect(1 + 1).toBe(2);
    });
});
