from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from source.gmail_analysis.gmail_auth import gmail_authenticate
import base64
import os
import email
from datetime import datetime

def list_messages(service, user_id, label_ids=['INBOX'], max_results=10):
    """
    List all Messages of the user's mailbox matching the query.
    """
    try:
        response = service.users().messages().list(
            userId=user_id,
            labelIds=label_ids,
            maxResults=max_results
        ).execute()
        messages = response.get('messages', [])
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

        print(f"\n--- Email ID: {msg_id} ---")
        print(f"Subject: {subject}")
        print(f"From: {sender}")
        print(f"To: {recipient}")
        print(f"Date: {timestamp}")

        # # Get the email body
        # body = get_body(message['payload'])
        # print(f"Body:\n{body}")
        #
        # # Handle attachments
        # attachments = get_attachments(service, user_id, message)
        # if attachments:
        #     print(f"Attachments: {', '.join(attachments)}")
        # else:
        #     print("No attachments found.")

        return message

    except HttpError as error:
        print(f'An error occurred: {error}')
        return None

def parse_date(date_str):
    """
    Parse the date string from the email headers and return a formatted timestamp.
    """
    try:
        parsed_date = email.utils.parsedate_to_datetime(date_str)
        return parsed_date.strftime('%Y-%m-%d %H:%M:%S')
    except Exception:
        return date_str

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
        if part['filename']:
            attachment_id = part['body'].get('attachmentId')
            if attachment_id:
                attachment = service.users().messages().attachments().get(
                    userId=user_id,
                    messageId=message['id'],
                    id=attachment_id
                ).execute()
                file_data = base64.urlsafe_b64decode(attachment['data'].encode('UTF-8'))
                path = os.path.join(store_dir, part['filename'])

                with open(path, 'wb') as f:
                    f.write(file_data)
                attachments.append(part['filename'])
    return attachments

def main():
    service = build('gmail', 'v1', credentials=gmail_authenticate())
    user_id = 'me'
    messages = list_messages(service, user_id, max_results=10)

    if not messages:
        print("No messages found.")
    else:
        print(f"Found {len(messages)} messages. Fetching details...\n")
        for message in messages:
            get_message_details(service, user_id, message['id'])

if __name__ == '__main__':
    main()
