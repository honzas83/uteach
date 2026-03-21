import os
import re
import json
import uuid
import threading
import requests
import boto3
from flask import Flask, request, jsonify, send_from_directory

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# In Docker: /app/server.py + /app/frontend/
# Locally:   backend/server.py + frontend/
_frontend_same_level = os.path.join(BASE_DIR, 'frontend')
_frontend_parent_level = os.path.join(BASE_DIR, '..', 'frontend')
FRONTEND_DIR = _frontend_same_level if os.path.isdir(_frontend_same_level) else _frontend_parent_level

OUTPUT_FILE = os.path.join(BASE_DIR, 'text.txt')

app = Flask(__name__, static_folder=FRONTEND_DIR)
app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024  # 500 MB upload limit

UWEBASR_BASE_URL = "https://uwebasr.zcu.cz/api/v2/lindat"

# Language → SpeechCloud app_id
LANGUAGE_MODELS = {
    'cs': 'generic/cs/zipformer',
    'sk': 'generic/sk/zipformer',
    'en': 'generic/en/zipformer',
    'de': 'generic/de/zipformer',
    'pl': 'generic/pl/zipformer',
    'hu': 'generic/hu/zipformer',
    'hr': 'generic/hr/zipformer',
    'sr': 'generic/sr/zipformer',
    'nl': 'generic/nl',
}

# In-memory task store (keyed by UUID)
tasks: dict[str, dict] = {}


@app.route('/health')
def health():
    return jsonify({'status': 'ok'}), 200


@app.route('/')
def index():
    return send_from_directory(FRONTEND_DIR, 'index.html')


@app.route('/<path:filename>')
def static_files(filename):
    return send_from_directory(FRONTEND_DIR, filename)


@app.route('/transcribe', methods=['POST'])
def transcribe():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    f = request.files['file']
    if not f.filename:
        return jsonify({'error': 'No file selected'}), 400

    lang = request.form.get('language', 'cs')
    app_id = LANGUAGE_MODELS.get(lang, 'generic/cs/zipformer')

    task_id = str(uuid.uuid4())
    tasks[task_id] = {'status': 'processing', 'result': None, 'error': None}

    # Read file bytes before handing off to the background thread
    file_data = f.read()

    def run():
        api_url = f"{UWEBASR_BASE_URL}/{app_id}?format=plaintext"
        try:
            resp = requests.post(
                api_url,
                data=file_data,
                headers={'Content-Type': 'application/octet-stream'},
                timeout=3600,
            )
            if resp.status_code == 200:
                text = resp.text
                with open(OUTPUT_FILE, 'w', encoding='utf-8') as fh:
                    fh.write(text)
                tasks[task_id].update(status='done', result=text)
            elif resp.status_code == 503:
                tasks[task_id].update(
                    status='error',
                    error='All ASR workers are currently busy. Please try again in a few minutes.',
                )
            else:
                tasks[task_id].update(
                    status='error',
                    error=f'API returned HTTP {resp.status_code}: {resp.text[:300]}',
                )
        except requests.Timeout:
            tasks[task_id].update(status='error', error='The request timed out after 1 hour.')
        except requests.RequestException as e:
            tasks[task_id].update(status='error', error=f'Network error: {e}')

    threading.Thread(target=run, daemon=True).start()
    return jsonify({'task_id': task_id})


@app.route('/status/<task_id>')
def status(task_id):
    task = tasks.get(task_id)
    if task is None:
        return jsonify({'error': 'Task not found'}), 404
    return jsonify(task)


@app.route('/parse-students', methods=['POST'])
def parse_students():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    f = request.files['file']
    filename = f.filename.lower()

    try:
        if filename.endswith('.pdf'):
            import pdfplumber
            names = []
            with pdfplumber.open(f) as pdf:
                for page in pdf.pages:
                    tables = page.extract_tables()
                    for table in tables:
                        for row in table:
                            if not row or len(row) < 2:
                                continue
                            # Column "Příjmení a jméno" — typically second column
                            for cell in row:
                                if not cell or not isinstance(cell, str):
                                    continue
                                cell = cell.strip()
                                # Skip headers and non-name cells
                                if cell in ('Příjmení a jméno', 'Poř.', 'Os. číslo',
                                            'Poznámka', 'Týden', ''):
                                    continue
                                # Skip cells that look like student IDs (A25B0489P)
                                if re.match(r'^A\d{2}B\d{4}P$', cell):
                                    continue
                                # Skip pure numbers
                                if re.match(r'^\d+\.?$', cell):
                                    continue
                                # Match "SURNAME Firstname" pattern (uppercase + mixed)
                                if re.match(r'^[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]{2,}', cell):
                                    # Convert "AKSMANN Petr" → "Petr Aksmann"
                                    parts = cell.split()
                                    if len(parts) >= 2:
                                        surname = parts[0].title()
                                        first = ' '.join(parts[1:])
                                        names.append(f"{first} {surname}")
            return jsonify({'names': names})

        elif filename.endswith('.csv') or filename.endswith('.txt'):
            content = f.read().decode('utf-8')
            names = [n.strip() for n in content.replace('\n', ',').split(',') if n.strip()]
            return jsonify({'names': names})

        else:
            return jsonify({'error': 'Unsupported file format. Use PDF, CSV, or TXT.'}), 400

    except Exception as e:
        return jsonify({'error': f'Failed to parse file: {str(e)}'}), 500


@app.route('/clean', methods=['POST'])
def clean_transcript():
    data = request.get_json()
    if not data or 'transcript' not in data:
        return jsonify({'error': 'No transcript provided'}), 400

    transcript = data['transcript']
    student_names = data.get('student_names', [])

    names_instruction = ""
    if student_names:
        names_list = ", ".join(student_names)
        names_instruction = (
            f"\n3. Replace any mention of these student names with '[student]': {names_list}. "
            "Also catch partial matches, nicknames, or misspellings of these names."
        )

    prompt = (
        "You are a text editor. Process the following "
        "lecture transcript according to these rules:\n\n"
        "1. Remove all political discussions, political opinions, "
        "political debates, and any politically charged content. "
        "Replace removed sections with "
        "'[politicky obsah odstranen]'.\n"
        "2. Keep all educational, academic, and "
        "lecture-related content intact."
        f"{names_instruction}\n"
        "4. Do NOT add any commentary, explanations, or notes. "
        "Return ONLY the cleaned transcript.\n"
        "5. Preserve the original language of the transcript. "
        "Do not translate.\n"
        "6. Preserve paragraph structure and formatting.\n\n"
        f"Transcript:\n{transcript}"
    )

    try:
        bedrock = boto3.client('bedrock-runtime', region_name=os.environ.get('AWS_REGION', 'eu-central-1'))
        response = bedrock.invoke_model(
            modelId='anthropic.claude-3-haiku-20240307-v1:0',
            contentType='application/json',
            accept='application/json',
            body=json.dumps({
                'anthropic_version': 'bedrock-2023-05-31',
                'max_tokens': 4096,
                'messages': [{'role': 'user', 'content': prompt}]
            })
        )
        result = json.loads(response['body'].read())
        cleaned = result['content'][0]['text']
        return jsonify({'cleaned': cleaned})
    except Exception as e:
        return jsonify({'error': f'AI processing failed: {str(e)}'}), 500


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5001, threaded=True)
