class EncryptionService {
    encryptData(data) {
        throw new Error('encryptData method must be implemented');
    }

    decryptData(encryptedData) {
        throw new Error('decryptData method must be implemented');
    }
}

module.exports = EncryptionService;