import os
import re
import json
import uuid
import requests
import boto3
from flask import Flask, request, jsonify, send_from_directory
from redis import Redis
from rq import Queue
from rq.job import Job, NoSuchJobError

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

# Redis + RQ setup
REDIS_URL = os.environ.get('REDIS_URL', 'redis://localhost:6379/0')
redis_conn = Redis.from_url(REDIS_URL)

# Separate queues so long ASR jobs don't starve fast AI jobs
asr_queue = Queue('asr', connection=redis_conn, default_timeout=3600)
ai_queue  = Queue('ai',  connection=redis_conn, default_timeout=600)


# ---------------------------------------------------------------------------
# Worker task functions (must be importable at module level for RQ)
# ---------------------------------------------------------------------------

def _run_transcribe(file_data, app_id):
    api_url = f"{UWEBASR_BASE_URL}/{app_id}?format=plaintext"
    try:
        resp = requests.post(
            api_url,
            data=file_data,
            headers={'Content-Type': 'application/octet-stream'},
            timeout=3600,
        )
        if resp.status_code == 200:
            return resp.text
        elif resp.status_code == 503:
            raise RuntimeError('All ASR workers are currently busy. Please try again in a few minutes.')
        else:
            raise RuntimeError(f'API returned HTTP {resp.status_code}: {resp.text[:300]}')
    except requests.Timeout:
        raise RuntimeError('The request timed out after 1 hour.')
    except requests.RequestException as e:
        raise RuntimeError(f'Network error: {e}')


def _run_clean(transcript, student_names, custom_prompt):
    names_instruction = ""
    if student_names:
        names_list = ", ".join(student_names)
        names_instruction = (
            "\n3. Replace any mention of these student "
            "names with '[student]': "
            f"{names_list}. "
            "Also catch partial matches, nicknames, "
            "or misspellings of these names."
        )

    custom_instruction = ""
    if custom_prompt:
        custom_instruction = (
            f"\n7. Additional instructions: {custom_prompt}"
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
        "6. Preserve paragraph structure and formatting."
        f"{custom_instruction}\n\n"
        f"Transcript:\n{transcript}"
    )

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
    return result['content'][0]['text']


def _run_summarize(transcript):
    prompt = (
        "You are an academic assistant. Create a concise "
        "summary of the following lecture transcript.\n\n"
        "Rules:\n"
        "1. Write the summary in the SAME language as "
        "the transcript.\n"
        "2. Use bullet points for key topics.\n"
        "3. Keep it under 300 words.\n"
        "4. Start with a one-sentence overview.\n"
        "5. Then list the main points covered.\n"
        "6. Do NOT add information not in the transcript.\n"
        "7. Do NOT include any meta-commentary.\n\n"
        f"Transcript:\n{transcript}"
    )

    bedrock = boto3.client(
        'bedrock-runtime',
        region_name=os.environ.get('AWS_REGION', 'eu-central-1')
    )
    response = bedrock.invoke_model(
        modelId='anthropic.claude-3-haiku-20240307-v1:0',
        contentType='application/json',
        accept='application/json',
        body=json.dumps({
            'anthropic_version': 'bedrock-2023-05-31',
            'max_tokens': 2048,
            'messages': [
                {'role': 'user', 'content': prompt}
            ]
        })
    )
    result = json.loads(response['body'].read())
    return result['content'][0]['text']


def _run_edit_summary(summary, instruction):
    prompt = (
        "You are an academic text editor. You will receive a "
        "lecture summary and an editing instruction. "
        "Apply the instruction to the summary.\n\n"
        "Rules:\n"
        "1. Follow the instruction precisely.\n"
        "2. Preserve the original language unless told otherwise.\n"
        "3. Return ONLY the edited summary — no explanations, "
        "no meta-commentary.\n"
        "4. Keep bullet-point structure unless the instruction "
        "says otherwise.\n\n"
        f"Instruction: {instruction}\n\n"
        f"Summary:\n{summary}"
    )

    bedrock = boto3.client(
        'bedrock-runtime',
        region_name=os.environ.get('AWS_REGION', 'eu-central-1')
    )
    response = bedrock.invoke_model(
        modelId='anthropic.claude-3-haiku-20240307-v1:0',
        contentType='application/json',
        accept='application/json',
        body=json.dumps({
            'anthropic_version': 'bedrock-2023-05-31',
            'max_tokens': 2048,
            'messages': [
                {'role': 'user', 'content': prompt}
            ]
        })
    )
    result = json.loads(response['body'].read())
    return result['content'][0]['text']


# ---------------------------------------------------------------------------
# Helper: uniform job-status response
# ---------------------------------------------------------------------------

def _job_response(job):
    s = job.get_status()
    payload = {'status': str(s)}
    if s == 'finished':
        payload['result'] = job.result
    elif s == 'failed':
        payload['error'] = str(job.latest_result().exc_string) if job.latest_result() else 'Unknown error'
    return payload


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

    # Read file bytes before handing off to the background worker
    file_data = f.read()

    job = asr_queue.enqueue(_run_transcribe, file_data, app_id)
    return jsonify({'task_id': job.id})


@app.route('/status/<task_id>')
def status(task_id):
    try:
        job = Job.fetch(task_id, connection=redis_conn)
    except NoSuchJobError:
        return jsonify({'error': 'Task not found'}), 404
    return jsonify(_job_response(job))


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

        elif filename.endswith('.csv'):
            import csv
            import io
            content = f.read().decode('utf-8')
            reader = csv.reader(io.StringIO(content))
            names = []
            name_col = None
            for row in reader:
                if name_col is None:
                    # Auto-detect name column from header
                    for i, cell in enumerate(row):
                        c = cell.strip().lower()
                        if 'jméno' in c or 'jmeno' in c or 'name' in c:
                            name_col = i
                            break
                    if name_col is not None:
                        continue
                    # No header found — try column 1 (index 1)
                    name_col = 1 if len(row) > 1 else 0
                if name_col >= len(row):
                    continue
                cell = row[name_col].strip()
                if not cell:
                    continue
                # Skip headers/IDs/numbers
                if re.match(r'^A\d{2}B\d{4}P$', cell):
                    continue
                if re.match(r'^\d+\.?$', cell):
                    continue
                # "SURNAME Firstname" → "Firstname Surname"
                if re.match(
                    r'^[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]{2,}', cell
                ):
                    parts = cell.split()
                    if len(parts) >= 2:
                        surname = parts[0].title()
                        first = ' '.join(parts[1:])
                        names.append(f"{first} {surname}")
                        continue
                names.append(cell)
            return jsonify({'names': names})

        elif filename.endswith('.txt'):
            content = f.read().decode('utf-8')
            names = [
                n.strip() for n in
                content.replace('\n', ',').split(',')
                if n.strip()
            ]
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
    custom_prompt = data.get('custom_prompt', '')

    try:
        job = ai_queue.enqueue(_run_clean, transcript, student_names, custom_prompt)
        return jsonify({'task_id': job.id})
    except Exception as e:
        return jsonify({'error': f'AI processing failed: {str(e)}'}), 500


@app.route('/summarize', methods=['POST'])
def summarize():
    data = request.get_json()
    if not data or 'transcript' not in data:
        return jsonify({'error': 'No transcript provided'}), 400

    transcript = data['transcript']

    try:
        job = ai_queue.enqueue(_run_summarize, transcript)
        return jsonify({'task_id': job.id})
    except Exception as e:
        return jsonify({
            'error': f'Summarization failed: {str(e)}'
        }), 500


@app.route('/edit-summary', methods=['POST'])
def edit_summary():
    data = request.get_json()
    if not data or 'summary' not in data:
        return jsonify({'error': 'No summary provided'}), 400
    if 'instruction' not in data or not data['instruction'].strip():
        return jsonify({'error': 'No instruction provided'}), 400

    summary = data['summary']
    instruction = data['instruction']

    try:
        job = ai_queue.enqueue(_run_edit_summary, summary, instruction)
        return jsonify({'task_id': job.id})
    except Exception as e:
        return jsonify({
            'error': f'Summary editing failed: {str(e)}'
        }), 500


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5001, threaded=True)
