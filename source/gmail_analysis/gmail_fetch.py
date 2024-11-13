from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from source.gmail_analysis.gmail_auth import gmail_authenticate
import base64
import os
import email
from datetime import datetime
import json
import time  # Added for tracking time


def list_messages(service, user_id, label_ids=None, max_results=1000):
    """
    List all Messages of the user's mailbox matching the query with pagination.
    """
    if label_ids is None:
        label_ids = ['INBOX']
    messages = []
    try:
        response = service.users().messages().list(
            userId=user_id,
            labelIds=label_ids,
            maxResults=max_results
        ).execute()
        messages.extend(response.get('messages', []))

        # Implementing pagination
        while 'nextPageToken' in response and len(messages) < max_results:
            page_token = response['nextPageToken']
            response = service.users().messages().list(
                userId=user_id,
                labelIds=label_ids,
                maxResults=max_results - len(messages),  # Adjust maxResults to fetch the remaining messages
                pageToken=page_token
            ).execute()
            messages.extend(response.get('messages', []))

        return messages
    except HttpError as error:
        print(f'An error occurred: {error}')
        return []


def get_message_details(service, user_id, msg_id):
    """
    Get the details of a specific message, including headers and attachments.
    """
    try:
        message = service.users().messages().get(userId=user_id, id=msg_id, format='full').execute()

        headers = message['payload'].get('headers', [])
        header_dict = {header['name']: header['value'] for header in headers}

        subject = header_dict.get('Subject', 'No Subject')
        sender = header_dict.get('From', 'Unknown Sender')
        recipient = header_dict.get('To', 'Unknown Recipient')
        date_str = header_dict.get('Date', '')
        timestamp = parse_date(date_str)

        # Get the email body
        body = get_body(message['payload'])

        # Handle attachments
        attachments = get_attachments(service, user_id, message)

        email_details = {
            "Email ID": msg_id,
            "Subject": subject,
            "From": sender,
            "To": recipient,
            "Date": timestamp,  # Original timestamp with time
            "Body": body,
            "Attachments": attachments if attachments else []
        }

        return email_details

    except HttpError as error:
        print(f'An error occurred: {error}')
        return None


def parse_date(date_str):
    """
    Parse the date string from the email headers and return a datetime object.
    """
    try:
        parsed_date = email.utils.parsedate_to_datetime(date_str)
        return parsed_date
    except Exception:
        return None


def format_date_key(dt):
    """
    Format a datetime object into a string like 'Tuesday, 12 November 2024'.
    """
    if not dt:
        return "Unknown Date"

    day_name = dt.strftime('%A')
    day = dt.day  # Removed ordinal suffix
    month = dt.strftime('%B')
    year = dt.year
    return f"{day_name}, {day} {month} {year}"


def get_body(payload):
    """
    Extract the body from the email payload.
    """
    if 'parts' in payload:
        for part in payload['parts']:
            if part['mimeType'] == 'text/plain':
                data = part['body'].get('data')
                if data:
                    return base64.urlsafe_b64decode(data).decode('utf-8')
            elif part['mimeType'] == 'text/html':
                data = part['body'].get('data')
                if data:
                    return base64.urlsafe_b64decode(data).decode('utf-8')
    else:
        data = payload['body'].get('data')
        if data:
            return base64.urlsafe_b64decode(data).decode('utf-8')
    return "No body found."


def get_attachments(service, user_id, message, store_dir='attachments'):
    """
    Download all attachments from the email and save them to the specified directory.
    Returns a list of attachment filenames.
    """
    attachments = []
    if not os.path.exists(store_dir):
        os.makedirs(store_dir)

    parts = message['payload'].get('parts', [])
    for part in parts:
        if part.get('filename'):
            attachment_id = part['body'].get('attachmentId')
            if attachment_id:
                try:
                    attachment = service.users().messages().attachments().get(
                        userId=user_id,
                        messageId=message['id'],
                        id=attachment_id
                    ).execute()
                    file_data = base64.urlsafe_b64decode(attachment['data'].encode('UTF-8'))
                    path = os.path.join(store_dir, part['filename'])

                    # Ensure the directory exists
                    path_dir = os.path.dirname(path)
                    if not os.path.exists(path_dir):
                        os.makedirs(path_dir)

                    with open(path, 'wb') as f:
                        f.write(file_data)
                    attachments.append(part['filename'])
                except HttpError as error:
                    print(f'An error occurred while downloading attachment: {error}')
                except Exception as e:
                    print(f'An error occurred while saving attachment {part["filename"]}: {e}')
    return attachments


def main():
    service = build('gmail', 'v1', credentials=gmail_authenticate())
    user_id = 'me'
    messages = list_messages(service, user_id, max_results=100)

    if not messages:
        print("No messages found.")
    else:
        print(f"Found {len(messages)} messages. Fetching details...")
        grouped_emails = {}
        start_time = time.time()  # Start time for progress tracking

        for index, message in enumerate(messages, 1):
            try:
                details = get_message_details(service, user_id, message['id'])
                if details:
                    # Parse the date string back to datetime object
                    if details['Date']:
                        date_tag = details['Date']
                        dt = date_tag if isinstance(date_tag, datetime) else datetime.strptime(details['Date'], '%d-%b-%Y at %H:%M')
                    else:
                        dt = None

                    # Format the date key
                    date_key = format_date_key(dt)

                    # Initialize the list for the date if not already
                    if date_key not in grouped_emails:
                        grouped_emails[date_key] = []

                    # Append the email details to the corresponding date
                    grouped_emails[date_key].append(details)

                # Progress tracking
                current_time = time.time()
                elapsed_time = current_time - start_time
                emails_processed = index
                total_emails = len(messages)
                remaining_emails = total_emails - emails_processed

                if elapsed_time > 0:
                    current_speed = emails_processed / elapsed_time  # emails per second
                    remaining_time_sec = remaining_emails / current_speed
                    remaining_time_formatted = time.strftime('%Hh %Mm %Ss', time.gmtime(remaining_time_sec))
                    eta_timestamp = current_time + remaining_time_sec
                    eta_formatted = time.strftime('%H:%M', time.localtime(eta_timestamp))
                else:
                    current_speed = 0
                    remaining_time_formatted = 'calculating...'
                    eta_formatted = 'calculating...'

                print(f"Processed {emails_processed}/{total_emails} emails | Current speed: {current_speed:.2f} emails/sec | Remaining emails: {remaining_emails} | Remaining time: {remaining_time_formatted} | ETA: {eta_formatted}")

            except Exception as e:
                print(f"An error occurred while processing message {index}: {e}")
                continue  # Skip to the next message

        # Optionally, sort the grouped_emails by date
        # Convert the keys back to datetime objects for sorting
        def sort_key(item):
            date_str = item[0]
            try:
                return email.utils.parsedate_to_datetime(date_str)
            except ValueError:
                return datetime.min

        # Sorting the dictionary by date
        sorted_grouped_emails = dict(sorted(
            grouped_emails.items(),
            key=sort_key,
            reverse=True  # Most recent first
        ))

        # Write to JSON file
        output_file = 'email_results.json'
        try:
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(sorted_grouped_emails, f, ensure_ascii=False, indent=4, default=str)
            print(f"Email details have been written to {output_file}")
        except IOError as e:
            print(f"An error occurred while writing to the file: {e}")


if __name__ == '__main__':
    main()
