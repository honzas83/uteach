import json
import os
import re

import boto3
import httpx
import requests
import yaml
from flask import Flask, request, jsonify, send_from_directory
from ollama import Client
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

# Root folder for per-model YAML prompt configs
# Structure: config/models/<model_name>/summarize_prompts.yaml
#                                       pii_prompts.yaml
#                                       clean_prompts.yaml
MODELS_CONFIG_DIR = os.path.join(BASE_DIR, 'config', 'models')

# Prompt config filenames (same name expected inside every model folder)
SUMMARIZE_CONFIG  = 'summarize_prompts.yaml'
PII_CONFIG        = 'pii_prompts.yaml'
CLEAN_CONFIG      = 'clean_prompts.yaml'

# Ollama server settings
OLLAMA_HOST     = os.environ.get('OLLAMA_HOST',     'https://ollama.kky.zcu.cz')
OLLAMA_USERNAME = os.environ.get('OLLAMA_USERNAME', '')
OLLAMA_PASSWORD = os.environ.get('OLLAMA_PASSWORD', '')

# Ollama model names per model folder name
OLLAMA_MODEL_NAMES = {
    'gemma':       'gemma3:12b',
    'qwen':        'qwen2.5:14b',
    'ministral-3': 'mistral:latest',
}

# Bedrock model IDs per model folder name
BEDROCK_MODEL_IDS = {
    'claude': 'anthropic.claude-3-haiku-20240307-v1:0',
}

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
# YAML config helpers
# ---------------------------------------------------------------------------

def _config_path(model_name, config_filename):
    """Return full path to a prompt config file for a given model."""
    return os.path.join(MODELS_CONFIG_DIR, model_name, config_filename)


def _load_prompts(model_name, config_filename):
    """Load prompts from config/models/<model_name>/<config_filename>.

    Returns a dict keyed by prompt id, or {} if the file is missing/invalid.
    """
    config_file = _config_path(model_name, config_filename)
    if not os.path.isfile(config_file):
        return {}
    with open(config_file, 'r', encoding='utf-8') as fh:
        data = yaml.safe_load(fh)
    prompts = {}
    for entry in (data or {}).get('prompts', []):
        if 'id' in entry and 'template' in entry:
            prompts[entry['id']] = entry
    return prompts


def _get_prompt(model_name, config_filename, prompt_id):
    """Return a single prompt entry or None."""
    return _load_prompts(model_name, config_filename).get(prompt_id)


def _list_models():
    """Return names of all model folders present under config/models/."""
    if not os.path.isdir(MODELS_CONFIG_DIR):
        return []
    return [
        d for d in os.listdir(MODELS_CONFIG_DIR)
        if os.path.isdir(os.path.join(MODELS_CONFIG_DIR, d))
    ]


def _render_template(template, parameters):
    """Replace {param} placeholders in template with values from parameters dict."""
    try:
        return template.format(**parameters)
    except KeyError as e:
        raise ValueError(f'Missing required parameter: {e}')


# ---------------------------------------------------------------------------
# Model invocation — Bedrock and Ollama
# ---------------------------------------------------------------------------

def _bedrock_invoke(prompt, max_tokens=4096):
    """Invoke Claude via AWS Bedrock."""
    bedrock = boto3.client(
        'bedrock-runtime',
        region_name=os.environ.get('AWS_REGION', 'eu-central-1')
    )
    response = bedrock.invoke_model(
        modelId=BEDROCK_MODEL_IDS['claude'],
        contentType='application/json',
        accept='application/json',
        body=json.dumps({
            'anthropic_version': 'bedrock-2023-05-31',
            'max_tokens': max_tokens,
            'messages': [
                {'role': 'user', 'content': prompt}
            ]
        })
    )
    result = json.loads(response['body'].read())
    return result['content'][0]['text']


def _ollama_invoke(model_name, prompt):
    """Invoke a model on the Ollama server."""
    client = Client(
        host=OLLAMA_HOST,
        auth=httpx.DigestAuth(OLLAMA_USERNAME, OLLAMA_PASSWORD),
    )
    ollama_model = OLLAMA_MODEL_NAMES.get(model_name)
    if not ollama_model:
        raise ValueError(f"No Ollama model name configured for '{model_name}'")
    response = client.chat(
        model=ollama_model,
        stream=False,
        options={"num_ctx": 8192},
        messages=[
            {'role': 'user', 'content': prompt}
        ]
    )
    return response['message']['content']


def _model_invoke(model_name, prompt, max_tokens=4096):
    """Route invocation to Bedrock or Ollama based on model_name."""
    if model_name in BEDROCK_MODEL_IDS:
        return _bedrock_invoke(prompt, max_tokens)
    if model_name in OLLAMA_MODEL_NAMES:
        return _ollama_invoke(model_name, prompt)
    raise ValueError(f"Unknown model: '{model_name}'")


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


def _run_prompt(model_name, rendered_prompt, transcript, max_tokens=4096):
    """Universal worker: prepend rendered prompt to transcript and call the model."""
    full_prompt = f"{rendered_prompt}\n\nTranscript:\n{transcript}"
    return _model_invoke(model_name, full_prompt, max_tokens)


def _run_edit_summary(model_name, summary, instruction):
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
    return _model_invoke(model_name, prompt, max_tokens=2048)


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


# ---------------------------------------------------------------------------
# Helper: validate request and enqueue a YAML-driven prompt job
# ---------------------------------------------------------------------------

def _enqueue_prompt_job(config_filename, data, error_label):
    """Validate request, load prompt from the model's YAML folder, enqueue job.

    Expects data to contain: transcript, model_name, prompt_id, parameters (opt).
    Returns a Flask response tuple on error, or a Job instance on success.
    """
    if not data or 'transcript' not in data:
        return jsonify({'error': 'No transcript provided'}), 400
    if 'model_name' not in data:
        return jsonify({'error': 'No model_name provided'}), 400
    if 'prompt_id' not in data:
        return jsonify({'error': 'No prompt_id provided'}), 400

    model_name = data['model_name']

    prompt_entry = _get_prompt(model_name, config_filename, data['prompt_id'])
    if prompt_entry is None:
        return jsonify({
            'error': (
                f"Unknown prompt_id '{data['prompt_id']}' "
                f"for model '{model_name}'"
            )
        }), 404

    try:
        rendered = _render_template(
            prompt_entry['template'],
            data.get('parameters', {}),
        )
    except ValueError as e:
        return jsonify({'error': str(e)}), 400

    try:
        job = ai_queue.enqueue(_run_prompt, model_name, rendered, data['transcript'])
        return job
    except Exception as e:
        return jsonify({'error': f'{error_label}: {str(e)}'}), 500


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


@app.route('/models', methods=['GET'])
def list_models():
    """Return all available model names (based on config/models/ subfolders)."""
    return jsonify({'models': _list_models()})


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
    """
    POST body (JSON):
      {
        "transcript":  "<transcript text>",
        "model_name":  "claude",
        "prompt_id":   "<id from config/models/claude/clean_prompts.yaml>",
        "parameters":  { ... }
      }
    """
    data = request.get_json()
    result = _enqueue_prompt_job(CLEAN_CONFIG, data, 'AI processing failed')
    if isinstance(result, tuple):
        return result
    return jsonify({'task_id': result.id})


@app.route('/clean-prompts', methods=['GET'])
def list_clean_prompts():
    """Return clean prompts for all models.

    Optional query param: ?model_name=claude
    """
    model_name = request.args.get('model_name')
    models = [model_name] if model_name else _list_models()
    return jsonify({
        m: list(_load_prompts(m, CLEAN_CONFIG).values())
        for m in models
    })


@app.route('/summarize', methods=['POST'])
def summarize():
    """
    POST body (JSON):
      {
        "transcript":  "<transcript text>",
        "model_name":  "gemma",
        "prompt_id":   "<id from config/models/gemma/summarize_prompts.yaml>",
        "parameters":  { "subject_code": "KKY/ITE" }
      }
    """
    data = request.get_json()
    result = _enqueue_prompt_job(SUMMARIZE_CONFIG, data, 'Summarization failed')
    if isinstance(result, tuple):
        return result
    return jsonify({'task_id': result.id})


@app.route('/summarize-prompts', methods=['GET'])
def list_summarize_prompts():
    """Return summarize prompts for all models.

    Optional query param: ?model_name=gemma
    """
    model_name = request.args.get('model_name')
    models = [model_name] if model_name else _list_models()
    return jsonify({
        m: list(_load_prompts(m, SUMMARIZE_CONFIG).values())
        for m in models
    })


@app.route('/pii-detect', methods=['POST'])
def pii_detect():
    """
    POST body (JSON):
      {
        "transcript":  "<transcript text>",
        "model_name":  "qwen",
        "prompt_id":   "<id from config/models/qwen/pii_prompts.yaml>",
        "parameters":  { ... }
      }
    """
    data = request.get_json()
    result = _enqueue_prompt_job(PII_CONFIG, data, 'PII detection failed')
    if isinstance(result, tuple):
        return result
    return jsonify({'task_id': result.id})


@app.route('/pii-prompts', methods=['GET'])
def list_pii_prompts():
    """Return PII prompts for all models.

    Optional query param: ?model_name=qwen
    """
    model_name = request.args.get('model_name')
    models = [model_name] if model_name else _list_models()
    return jsonify({
        m: list(_load_prompts(m, PII_CONFIG).values())
        for m in models
    })


@app.route('/edit-summary', methods=['POST'])
def edit_summary():
    """
    POST body (JSON):
      {
        "summary":     "<previously generated summary text>",
        "instruction": "<user's editing instruction>",
        "model_name":  "claude"
      }
    """
    data = request.get_json()
    if not data or 'summary' not in data:
        return jsonify({'error': 'No summary provided'}), 400
    if 'instruction' not in data or not data['instruction'].strip():
        return jsonify({'error': 'No instruction provided'}), 400
    if 'model_name' not in data:
        return jsonify({'error': 'No model_name provided'}), 400

    summary = data['summary']
    instruction = data['instruction']
    model_name = data['model_name']

    try:
        job = ai_queue.enqueue(_run_edit_summary, model_name, summary, instruction)
        return jsonify({'task_id': job.id})
    except Exception as e:
        return jsonify({
            'error': f'Summary editing failed: {str(e)}'
        }), 500


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5001, threaded=True)
