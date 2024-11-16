#app.py

from flask import Flask, render_template, redirect, url_for, request, session, Response

from google_auth_oauthlib.flow import Flow
import os
import pickle

from source.gmail_analysis.gmail_auth import gmail_authenticate
from source.gmail_analysis.gmail_fetch import fetch_emails_generator
from source.path.path_reference import get_credentials_path

app = Flask(__name__)
app.secret_key = 'your_secret_key'  # Replace with your secret key
app.config['SERVER_NAME'] = 'localhost:8080'

os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'

SCOPES = ['https://www.googleapis.com/auth/gmail.readonly']
CLIENT_SECRETS_FILE = get_credentials_path()


@app.route('/')
def index():
    authenticated = os.path.exists('token.pickle')
    return render_template('index.html', authenticated=authenticated)


@app.route('/call_function')
def call_function():
    flow = Flow.from_client_secrets_file(
        CLIENT_SECRETS_FILE, scopes=SCOPES,
        redirect_uri='http://localhost:8080/oauth2callback')
    authorization_url, state = flow.authorization_url(
        access_type='offline',
        include_granted_scopes='true')
    session['state'] = state
    return redirect(authorization_url)


@app.route('/oauth2callback')
def oauth2callback():
    state = session['state']
    flow = Flow.from_client_secrets_file(
        CLIENT_SECRETS_FILE, scopes=SCOPES, state=state,
        redirect_uri='http://localhost:8080/oauth2callback')
    flow.fetch_token(authorization_response=request.url)

    creds = flow.credentials
    # Save the credentials for the next run
    with open('token.pickle', 'wb') as token:
        pickle.dump(creds, token)

    return redirect(url_for('index'))

@app.route('/fetch_emails')
def fetch_emails():
    def generate():
        for progress in fetch_emails_generator():
            yield f"data: {progress}\n\n"
    return Response(generate(), mimetype='text/event-stream')


if __name__ == '__main__':
    app.run(debug=True, port=8080)
