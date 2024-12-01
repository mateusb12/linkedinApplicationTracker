const GmailFetchService = require('../../source/application/services/gmailFetchService');
const { expect } = require('chai');
const sinon = require('sinon');

describe('GmailFetchService', () => {
    let gmailFetchService;
    
    beforeEach(() => {
        gmailFetchService = new GmailFetchService();
    });

    describe('formatTime', () => {
        it('should format seconds into readable time string', () => {
            const result = gmailFetchService.formatTime(3665);
            expect(result).to.equal('1h 1m 5s');
        });

        it('should handle invalid input', () => {
            const result = gmailFetchService.formatTime(Infinity);
            expect(result).to.equal('Calculating...');
        });
    });

    describe('fetchWithRetry', () => {
        it('should retry on rate limit errors', async () => {
            const rateLimitError = { code: 429 };
            const successResponse = { data: 'success' };
            const fetchFunction = sinon.stub()
                .onFirstCall().throws(rateLimitError)
                .onSecondCall().returns(successResponse);

            const result = await gmailFetchService.fetchWithRetry(fetchFunction);
            expect(result).to.deep.equal(successResponse);
            expect(fetchFunction.calledTwice).to.be.true;
        });

        it('should throw after max retries', async () => {
            const error = new Error('API Error');
            const fetchFunction = sinon.stub().throws(error);

            try {
                await gmailFetchService.fetchWithRetry(fetchFunction, 3);
                expect.fail('Should have thrown an error');
            } catch (e) {
                expect(fetchFunction.callCount).to.equal(3);
                expect(e).to.equal(error);
            }
        });
    });
}); 