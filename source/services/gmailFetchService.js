const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const gmailAuthService = require('./gmailAuthService');

class GmailFetchService {
    constructor() {
        this.gmail = google.gmail({ version: 'v1', auth: gmailAuthService.getOAuth2Client() });
    }

    async listMessages(labelIds = ['INBOX'], maxResults = 1000) {
        try {
            let messages = [];
            let response = await this.gmail.users.messages.list({
                userId: 'me',
                labelIds: labelIds,
                maxResults: maxResults
            });

            messages.push(...(response.data.messages || []));

            // Implementing pagination
            while (response.data.nextPageToken && messages.length < maxResults) {
                response = await this.gmail.users.messages.list({
                    userId: 'me',
                    labelIds: labelIds,
                    maxResults: maxResults - messages.length,
                    pageToken: response.data.nextPageToken
                });
                messages.push(...(response.data.messages || []));
            }

            return messages;
        } catch (error) {
            console.error('An error occurred:', error);
            return [];
        }
    }

    async getMessageDetails(messageId) {
        try {
            const message = await this.gmail.users.messages.get({
                userId: 'me',
                id: messageId,
                format: 'full'
            });

            const headers = message.data.payload.headers;
            const headerDict = headers.reduce((acc, header) => {
                acc[header.name] = header.value;
                return acc;
            }, {});

            const emailDetails = {
                emailId: messageId,
                subject: headerDict.Subject || 'No Subject',
                from: headerDict.From || 'Unknown Sender',
                to: headerDict.To || 'Unknown Recipient',
                date: this.parseDate(headerDict.Date),
                body: this.getBody(message.data.payload),
                attachments: await this.getAttachments(messageId, message.data)
            };

            return emailDetails;
        } catch (error) {
            console.error('An error occurred:', error);
            return null;
        }
    }

    parseDate(dateStr) {
        try {
            return new Date(dateStr).toISOString();
        } catch {
            return null;
        }
    }

    formatDateKey(date) {
        if (!date) return "Unknown Date";
        
        const dt = new Date(date);
        return dt.toLocaleDateString('en-US', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
    }

    getBody(payload) {
        if (payload.parts) {
            for (const part of payload.parts) {
                if (part.mimeType === 'text/plain' || part.mimeType === 'text/html') {
                    if (part.body.data) {
                        return Buffer.from(part.body.data, 'base64').toString('utf-8');
                    }
                }
            }
        } else if (payload.body.data) {
            return Buffer.from(payload.body.data, 'base64').toString('utf-8');
        }
        return "No body found.";
    }

    async getAttachments(messageId, message) {
        const attachments = [];
        const storeDir = path.join(__dirname, '../../attachments');

        if (!fs.existsSync(storeDir)) {
            fs.mkdirSync(storeDir, { recursive: true });
        }

        const parts = message.payload.parts || [];
        for (const part of parts) {
            if (part.filename) {
                const attachmentId = part.body.attachmentId;
                if (attachmentId) {
                    try {
                        const attachment = await this.gmail.users.messages.attachments.get({
                            userId: 'me',
                            messageId: messageId,
                            id: attachmentId
                        });

                        const filePath = path.join(storeDir, part.filename);
                        const fileData = Buffer.from(attachment.data.data, 'base64');
                        
                        fs.mkdirSync(path.dirname(filePath), { recursive: true });
                        fs.writeFileSync(filePath, fileData);
                        attachments.push(part.filename);
                    } catch (error) {
                        console.error(`Error downloading attachment: ${error}`);
                    }
                }
            }
        }
        return attachments;
    }

    async* fetchEmailsGenerator() {
        const messages = await this.listMessages(['INBOX'], 100);
        
        if (!messages.length) {
            yield JSON.stringify({ message: "No messages found." });
            return;
        }

        yield JSON.stringify({ message: `Found ${messages.length} messages. Fetching details...` });
        const groupedEmails = {};
        const startTime = Date.now();

        for (let i = 0; i < messages.length; i++) {
            try {
                const details = await this.getMessageDetails(messages[i].id);
                if (details) {
                    const dateKey = this.formatDateKey(details.date);
                    if (!groupedEmails[dateKey]) {
                        groupedEmails[dateKey] = [];
                    }
                    groupedEmails[dateKey].push(details);
                }

                // Progress tracking
                const currentTime = Date.now();
                const elapsedTime = (currentTime - startTime) / 1000;
                const emailsProcessed = i + 1;
                const remainingEmails = messages.length - emailsProcessed;
                const currentSpeed = emailsProcessed / elapsedTime;
                const remainingTimeSec = remainingEmails / currentSpeed;

                yield JSON.stringify({
                    emails_processed: emailsProcessed,
                    total_emails: messages.length,
                    current_speed: currentSpeed,
                    remaining_emails: remainingEmails,
                    remaining_time_formatted: this.formatTimeRemaining(remainingTimeSec),
                    eta_formatted: this.formatETA(remainingTimeSec)
                });

            } catch (error) {
                yield JSON.stringify({ error: `An error occurred while processing message ${i + 1}: ${error}` });
            }
        }

        yield JSON.stringify({ message: "Email fetching completed." });

        // Sort and save results
        const sortedGroupedEmails = Object.fromEntries(
            Object.entries(groupedEmails).sort((a, b) => new Date(b[0]) - new Date(a[0]))
        );

        fs.writeFileSync(
            'email_results.json',
            JSON.stringify(sortedGroupedEmails, null, 4)
        );
    }

    formatTimeRemaining(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        return `${hours}h ${minutes}m ${secs}s`;
    }

    formatETA(secondsRemaining) {
        const eta = new Date(Date.now() + (secondsRemaining * 1000));
        return eta.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }
}

module.exports = new GmailFetchService(); 