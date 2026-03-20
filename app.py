import os
import uuid
import threading
import requests
from flask import Flask, request, jsonify, render_template

OUTPUT_FILE = os.path.join(os.path.dirname(__file__), 'text.txt')

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024  # 500 MB upload limit

UWEBASR_BASE_URL = "https://uwebasr.zcu.cz/api/v2/lindat"

# Language → SpeechCloud app_id (Zipformer = newest/best; Dutch only has Wav2Vec)
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


@app.route('/')
def index():
    return render_template('index.html')


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


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5001, threaded=True)
