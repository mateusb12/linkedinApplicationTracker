
# Summary Diagram

Here's a simplified flow diagram to visualize the process:

1. **User Action**: Clicks "Fetch Emails" button in `index.ejs`.

2. **Client-Side Logic**:  
   - `fetchEmails()` in `utils.js` sends POST request to `/fetch_emails`.

3. **Server-Side Handling**:  
   - `/fetch_emails` route in `dataRoutes.js` verifies authentication via `gmailAuthService.js`.  
   - Calls `startFetching(amount)` in `gmailFetchService.js` to begin fetch.

4. **Email Fetching Process**:  
   - `fetchEmails(taskId, amount)` interacts with Gmail API.  
   - Updates `progressStore` with real-time metrics.

5. **Client-Side Polling**:  
   - `pollFetchProgress(taskId, elements)` in `utils.js` sends GET requests to `/fetch_progress/:taskId` every second.  
   - Updates UI based on progress data.

6. **Completion**:  
   - Once fetching is complete, status is updated to `completed`.  
   - Client stops polling and notifies the user.

7. **Error Handling**:  
   - Any errors during the process are logged and communicated to the user.
