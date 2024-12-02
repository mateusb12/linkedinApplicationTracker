// app.js or index.js

// Instantiate the implementations of your interfaces
const MailEncryptionService = require("../../logic/gmailEncryptionService");
const GmailFetchService = require("../services/gmailFetchService");
const TaskManagerService = require("../services/taskManagerService");
const dataPersistenceService = require("../services/gmailDataPersistence");

// Instantiate services with dependencies injected
const encryptionInstance = new MailEncryptionService();
const gmailFetchInstance = new GmailFetchService(encryptionInstance, dataPersistenceService);
const taskManagerInstance = new TaskManagerService(gmailFetchInstance, encryptionInstance, dataPersistenceService);

// Export or use `taskManagerService` as needed
module.exports = {
    encryptionInstance,
    gmailFetchInstance,
    taskManagerInstance,
    dataPersistenceService,
};
