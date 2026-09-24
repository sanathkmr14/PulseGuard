import { extractCrlUrl, checkCrlRevocation } from '../../src/utils/crl-checker.js';

describe('CRL Checker Utility', () => {
    describe('extractCrlUrl', () => {
        it('should return null if cert buffer is null or undefined', () => {
            expect(extractCrlUrl(null)).toBeNull();
            expect(extractCrlUrl(undefined)).toBeNull();
            expect(extractCrlUrl('not a buffer')).toBeNull();
        });

        it('should extract CRL URL from DER-like buffer', () => {
            const fakeCert = Buffer.from('some-data-http://ye2.c.lencr.org/74.crl-more-data');
            const url = extractCrlUrl(fakeCert);
            expect(url).toBe('http://ye2.c.lencr.org/74.crl');
        });

        it('should return null if no CRL URL exists in buffer', () => {
            const fakeCert = Buffer.from('some-certificate-without-crl-url');
            const url = extractCrlUrl(fakeCert);
            expect(url).toBeNull();
        });
    });

    describe('checkCrlRevocation', () => {
        it('should return no_data when cert or serial is missing', async () => {
            const res = await checkCrlRevocation(null, null);
            expect(res.revoked).toBe(false);
            expect(res.status).toBe('no_data');
        });

        it('should return no_crl_url when cert lacks CRL extension', async () => {
            const fakeCert = Buffer.from('plain-cert');
            const res = await checkCrlRevocation(fakeCert, '123456');
            expect(res.revoked).toBe(false);
            expect(res.status).toBe('no_crl_url');
        });
    });
});
