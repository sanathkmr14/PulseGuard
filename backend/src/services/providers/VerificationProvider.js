/**
 * Base class for Verification Providers
 */
class VerificationProvider {
    constructor() {
        if (this.constructor === VerificationProvider) {
            throw new Error("Abstract classes can't be instantiated.");
        }
    }

    /**
     * Perform verification for a monitor
     * @param {Object} monitor - The monitor to verify
     * @returns {Promise<Array>} - Array of verification results
     */
    async verify(monitor) {
        throw new Error("Method 'verify()' must be implemented.");
    }
}

export default VerificationProvider;
