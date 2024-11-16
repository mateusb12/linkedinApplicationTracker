const { google } = require('googleapis');
const authService = require('./gmailAuthService');
const fs = require('fs').promises;
const path = require('path');

class GmailFetchService {
    async* fetchEmailsGenerator() {
        try {
            const auth = authService.getOAuth2Client();
            const gmail = google.gmail({ version: 'v1', auth });
            const emailResults = [];

            // First, get total count of emails
            const response = await gmail.users.messages.list({
                userId: 'me',
                q: 'from:jobs-noreply@linkedin.com'
            });

            const messages = response.data.messages || [];
            const totalEmails = messages.length;
            let processed = 0;
            const startTime = Date.now();

            // Process each email
            for (const message of messages) {
                // Fetch email details
                const emailData = await gmail.users.messages.get({
                    userId: 'me',
                    id: message.id
                });

                // Add email to results array
                emailResults.push(emailData.data);

                processed++;

                // Calculate progress statistics
                const elapsedTime = (Date.now() - startTime) / 1000; // Convert to seconds
                const currentSpeed = processed / elapsedTime;
                const remainingEmails = totalEmails - processed;
                
                // Calculate remaining time and ETA
                const remainingSeconds = remainingEmails / currentSpeed;
                const remainingTime = this.formatTime(remainingSeconds);
                const eta = this.calculateETA(remainingSeconds);

                // Yield progress data
                yield JSON.stringify({
                    emails_processed: processed,
                    total_emails: totalEmails,
                    current_speed: currentSpeed || 0,
                    remaining_emails: remainingEmails || 0,
                    remaining_time_formatted: remainingTime || 'Calculating...',
                    eta_formatted: eta || 'Calculating...',
                    message: 'Processing emails...'
                });
            }

            // Save all emails to JSON file
            const resultsPath = path.join(__dirname, '../data/email_results.json');
            console.log('Attempting to save emails to:', resultsPath);
            
            try {
                await fs.mkdir(path.dirname(resultsPath), { recursive: true });
                console.log('Directory created/verified');
                
                await fs.writeFile(resultsPath, JSON.stringify(emailResults, null, 2));
                console.log('File successfully written');
            } catch (fileError) {
                console.error('Error saving file:', fileError);
                throw fileError;
            }

            // Send completion message
            yield JSON.stringify({
                message: 'Email fetching completed.',
                emails_processed: totalEmails,
                total_emails: totalEmails
            });

        } catch (error) {
            yield JSON.stringify({
                error: error.message
            });
        }
    }

    formatTime(seconds) {
        if (!isFinite(seconds)) return 'Calculating...';
        
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);

        return `${hours}h ${minutes}m ${secs}s`;
    }

    calculateETA(remainingSeconds) {
        if (!isFinite(remainingSeconds)) return 'Calculating...';
        
        const eta = new Date(Date.now() + (remainingSeconds * 1000));
        return eta.toLocaleTimeString();
    }
}

module.exports = new GmailFetchService(); 