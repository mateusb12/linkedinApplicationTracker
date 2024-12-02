// services/gmailEncryptionService.js

const crypto = require('crypto');
const EncryptionService = require("../interface/IEncryptionLogic");
const algorithm = 'aes-256-cbc';
const key = process.env.ENCRYPTION_KEY;

if (!key) {
    throw new Error('Encryption key is not set. Please set the ENCRYPTION_KEY environment variable.');
}

if (Buffer.from(key).length !== 32) {
    throw new Error('Encryption key must be 32 bytes (256 bits) long for aes-256-cbc.');
}

class MailEncryptionService extends EncryptionService {
    encryptData(data) {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(algorithm, Buffer.from(key), iv);
        let encrypted = cipher.update(data);
        encrypted = Buffer.concat([encrypted, cipher.final()]);

        return {
            iv: iv.toString('base64'),
            data: encrypted.toString('base64')
        };
    }

    decryptData(encryptedData) {
        const iv = Buffer.from(encryptedData.iv, 'base64');
        const encryptedText = Buffer.from(encryptedData.data, 'base64');
        const decipher = crypto.createDecipheriv(algorithm, Buffer.from(key), iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    }
}

module.exports = MailEncryptionService;
