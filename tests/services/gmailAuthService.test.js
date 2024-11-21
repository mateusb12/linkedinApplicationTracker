const GmailAuthService = require('../../source/services/gmailAuthService');
const { expect } = require('chai');
const sinon = require('sinon');
const fs = require('fs');
const path = require('path');

describe('GmailAuthService', () => {
    let authService;
    let fsExistsStub;
    let fsReadFileStub;

    beforeEach(() => {
        fsExistsStub = sinon.stub(fs, 'existsSync');
        fsReadFileStub = sinon.stub(fs, 'readFileSync');
        authService = new GmailAuthService();
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('isAuthenticated', () => {
        it('should return false when token file does not exist', () => {
            fsExistsStub.returns(false);
            expect(authService.isAuthenticated()).to.be.false;
        });

        it('should return true when token exists and is valid', () => {
            fsExistsStub.returns(true);
            fsReadFileStub.returns(JSON.stringify({ access_token: 'valid_token' }));
            expect(authService.isAuthenticated()).to.be.true;
        });
    });

    describe('generateAuthUrl', () => {
        it('should generate valid auth URL with state parameter', () => {
            const state = 'test_state';
            const url = authService.generateAuthUrl(state);
            expect(url).to.include('state=test_state');
            expect(url).to.include('scope=https://www.googleapis.com/auth/gmail.readonly');
        });
    });
}); 