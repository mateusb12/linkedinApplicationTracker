const { google } = require('googleapis');
const authService = require('./gmailAuthService');
const fs = require('fs').promises;
const path = require('path');

class GmailFetchService {
    async* fetchEmailsGenerator(amount) {
        try {
            // Set amount to a large number if it's null or undefined
            amount = amount || Number.MAX_SAFE_INTEGER;

            const auth = authService.getOAuth2Client();
            const gmail = google.gmail({ version: 'v1', auth });
            const emailResults = [];
            let processed = 0;
            const startTime = Date.now();
            let nextPageToken = null;
            let totalEmails = amount; // Initialize totalEmails

            // First, get the total number of available emails
            const initialResponse = await gmail.users.messages.list({
                userId: 'me',
                q: 'from:jobs-noreply@linkedin.com',
                maxResults: 1
            });

            // Update totalEmails to be the minimum of requested amount and available emails
            if (initialResponse.data.resultSizeEstimate !== undefined) {
                totalEmails = Math.min(amount, initialResponse.data.resultSizeEstimate);
            }

            do {
                // Calculate maxResults for this request
                const maxResults = Math.min(500, amount - processed); // Gmail API allows up to 500

                // Fetch emails with pagination
                const response = await gmail.users.messages.list({
                    userId: 'me',
                    q: 'from:jobs-noreply@linkedin.com',
                    pageToken: nextPageToken || undefined, // Use the nextPageToken for pagination
                    maxResults: maxResults // Adjust maxResults dynamically
                });

                const messages = response.data.messages || [];
                nextPageToken = response.data.nextPageToken; // Update the nextPageToken

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
                    const remainingEmails = totalEmails - processed; // Use totalEmails here

                    // Calculate remaining time and ETA
                    const remainingSeconds = remainingEmails / (currentSpeed || 1);
                    const remainingTime = this.formatTime(remainingSeconds);
                    const eta = this.calculateETA(remainingSeconds);

                    // Yield progress data
                    yield JSON.stringify({
                        emails_processed: processed,
                        total_emails: totalEmails,
                        current_speed: currentSpeed || 0,
                        remaining_emails: remainingEmails || 0,
                        remaining_time_formatted: remainingTime,
                        eta_formatted: eta,
                        message: 'Processing emails...'
                    });

                    // Stop if we've fetched the desired amount
                    if (processed >= amount) {
                        break;
                    }
                }

                // Break the loop if we've fetched the desired amount
                if (processed >= amount) {
                    break;
                }

            } while (nextPageToken && processed < amount); // Continue if there's a next page and we haven't fetched enough emails

            // Save all emails to JSON file
            const resultsPath = path.join(__dirname, '../data/email_results.json');

            try {
                await fs.mkdir(path.dirname(resultsPath), { recursive: true });
                await fs.writeFile(resultsPath, JSON.stringify(emailResults, null, 2));
            } catch (fileError) {
                console.error('Error saving file:', fileError);
                throw fileError;
            }

            // Send completion message
            yield JSON.stringify({
                message: 'Email fetching completed.',
                emails_processed: processed,
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

// Add this block at the end of the file
if (require.main === module) {
    (async () => {
        const gmailFetchService = new GmailFetchService();
        let emailsFetched = 0;

        for await (const progress of gmailFetchService.fetchEmailsGenerator(500)) {
            const progressData = JSON.parse(progress);
            if (progressData.emails_processed) {
                emailsFetched = progressData.emails_processed;
            }
            console.log(progressData.message);
        }

        console.log(`Total emails fetched: ${emailsFetched}`);
    })();
}
