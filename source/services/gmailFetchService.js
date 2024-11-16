const { google } = require('googleapis');
const authService = require('./gmailAuthService');

class GmailFetchService {
    async* fetchEmailsGenerator() {
        try {
            const auth = authService.getAuthClient();
            const gmail = google.gmail({ version: 'v1', auth });

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
                await gmail.users.messages.get({
                    userId: 'me',
                    id: message.id
                });

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
                    current_speed: currentSpeed,
                    remaining_emails: remainingEmails,
                    remaining_time_formatted: remainingTime,
                    eta_formatted: eta,
                    message: 'Processing emails...'
                });
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