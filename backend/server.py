import os
import re
import uuid
import logging
import threading
import yaml
import httpx
import requests
from datetime import date
from ollama import Client as OllamaClient
from flask import Flask, request, jsonify, send_from_directory, send_file

# ── ReportLab (PDF) ──────────────────────────────────────────────
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, HRFlowable,
)
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib.enums import TA_CENTER
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
)

# ── Paths ─────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

_frontend_same = os.path.join(BASE_DIR, 'frontend')
_frontend_parent = os.path.join(BASE_DIR, '..', 'frontend')
FRONTEND_DIR = (
    _frontend_same if os.path.isdir(_frontend_same)
    else _frontend_parent
)

OUTPUT_FILE = os.path.join(BASE_DIR, 'text.txt')
PDF_DIR = os.path.join(BASE_DIR, 'pdfs')
PROMPTS_FILE = os.path.join(
    BASE_DIR, 'prompts', 'promptQWEN.yaml'
)
# Fallback: prompts may be one level up (local dev)
if not os.path.exists(PROMPTS_FILE):
    PROMPTS_FILE = os.path.join(
        BASE_DIR, '..', 'prompts', 'promptQWEN.yaml'
    )

os.makedirs(PDF_DIR, exist_ok=True)

# ── Unicode font (Czech characters) ──────────────────────────────
_FONT_CANDIDATES = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/ttf-dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/dejavu-sans-fonts/DejaVuSans.ttf',
    '/opt/homebrew/share/fonts/dejavu-fonts/DejaVuSans.ttf',
    '/usr/local/share/fonts/DejaVuSans.ttf',
]
_BOLD_CANDIDATES = [
    p.replace('Sans.ttf', 'Sans-Bold.ttf')
    for p in _FONT_CANDIDATES
]


def _first_existing(paths):
    for p in paths:
        if os.path.exists(p):
            return p
    return None


_reg_path = _first_existing(_FONT_CANDIDATES)
_bold_path = _first_existing(_BOLD_CANDIDATES)

if _reg_path:
    pdfmetrics.registerFont(TTFont('Body', _reg_path))
    pdfmetrics.registerFont(
        TTFont('Body-Bold', _bold_path or _reg_path)
    )
    BODY_FONT = 'Body'
    BOLD_FONT = 'Body-Bold'
else:
    BODY_FONT = 'Helvetica'
    BOLD_FONT = 'Helvetica-Bold'

# ── Prompts ───────────────────────────────────────────────────────
if os.path.exists(PROMPTS_FILE):
    with open(PROMPTS_FILE, 'r', encoding='utf-8') as _f:
        PROMPTS = {
            p['id']: p
            for p in yaml.safe_load(_f)['prompts']
        }
    logging.info('Loaded %d prompts from %s', len(PROMPTS), PROMPTS_FILE)
else:
    PROMPTS = {}
    logging.warning('Prompts file not found: %s', PROMPTS_FILE)

# ── KKY University Ollama ─────────────────────────────────────────
OLLAMA_HOST = 'https://ollama.kky.zcu.cz'
OLLAMA_USER = 'hackathon2026'
OLLAMA_PASS = 'pheboa4zeesh4Kie'
OLLAMA_MODEL = os.environ.get('OLLAMA_MODEL', 'qwen3:14b')

# ── KKY ASR ───────────────────────────────────────────────────────
UWEBASR_BASE_URL = 'https://uwebasr.zcu.cz/api/v2/lindat'
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

# ── In-memory task store ──────────────────────────────────────────
tasks: dict[str, dict] = {}

# ── Flask ─────────────────────────────────────────────────────────
app = Flask(__name__, static_folder=FRONTEND_DIR)
app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024


# ══════════════════════════════════════════════════════════════════
# PDF generation
# ══════════════════════════════════════════════════════════════════

def _md_to_html(text: str) -> str:
    return re.sub(r'\*\*(.*?)\*\*', r'<b>\1</b>', text)


def _build_pdf_styles():
    return {
        'title': ParagraphStyle(
            'title', fontName=BOLD_FONT, fontSize=18,
            leading=24, spaceAfter=6, alignment=TA_CENTER,
        ),
        'subtitle': ParagraphStyle(
            'subtitle', fontName=BODY_FONT, fontSize=11,
            leading=14, spaceAfter=20, alignment=TA_CENTER,
            textColor='#666666',
        ),
        'section': ParagraphStyle(
            'section', fontName=BOLD_FONT, fontSize=13,
            leading=18, spaceBefore=18, spaceAfter=6,
        ),
        'body': ParagraphStyle(
            'body', fontName=BODY_FONT, fontSize=10,
            leading=16, spaceAfter=4,
        ),
        'list_item': ParagraphStyle(
            'list_item', fontName=BODY_FONT, fontSize=10,
            leading=16, spaceAfter=3, leftIndent=12,
        ),
    }


def _extract_number(line: str) -> str:
    m = re.match(r'^(\d+)', line)
    return m.group(1) if m else ''


def _section_to_flowables(text: str, styles: dict) -> list:
    items = []
    for raw_line in text.split('\n'):
        line = raw_line.strip()
        if not line:
            items.append(Spacer(1, 3))
            continue
        html = _md_to_html(line)
        if re.match(r'^#{1,3}\s', line):
            heading = re.sub(r'^#+\s*', '', html)
            items.append(Paragraph(heading, styles['section']))
        elif re.match(r'^\d+\.', line):
            content = re.sub(r'^\d+\.\s*', '', html)
            num = _extract_number(line)
            items.append(Paragraph(
                f'<b>{num}.</b> {content}',
                styles['list_item'],
            ))
        elif line.startswith(('- ', '* ')):
            content = html[2:]
            items.append(Paragraph(
                f'&bull; {content}', styles['list_item'],
            ))
        else:
            items.append(Paragraph(html, styles['body']))
    return items


def generate_pdf(
    task_id: str, subject_code: str, sections: dict
) -> str:
    path = os.path.join(PDF_DIR, f'{task_id}.pdf')
    styles = _build_pdf_styles()
    doc = SimpleDocTemplate(
        path, pagesize=A4,
        leftMargin=2.5 * cm, rightMargin=2.5 * cm,
        topMargin=2.5 * cm, bottomMargin=2.5 * cm,
    )
    story = [
        Paragraph('UTEACH.AI', styles['title']),
        Paragraph(
            f'{subject_code} &nbsp;&middot;&nbsp; '
            f'{date.today().strftime("%d. %m. %Y")}',
            styles['subtitle'],
        ),
        HRFlowable(
            width='100%', thickness=1,
            color='#e2e8f0', spaceAfter=10,
        ),
    ]
    section_labels = {
        'lecture_summary': PROMPTS.get(
            'lecture_summary', {}
        ).get('name', 'Shrnutí přednášky'),
        'not_in_slides': PROMPTS.get(
            'not_in_slides', {}
        ).get('name', 'Co nenajdete v prezentaci'),
        'glossary': PROMPTS.get(
            'glossary', {}
        ).get('name', 'Důležité pojmy'),
    }
    for key, label in section_labels.items():
        if sections.get(key):
            story.append(Spacer(1, 8))
            story.append(Paragraph(label, styles['section']))
            story.append(HRFlowable(
                width='100%', thickness=0.5,
                color='#cbd5e1', spaceAfter=6,
            ))
            story.extend(
                _section_to_flowables(sections[key], styles)
            )
    doc.build(story)
    return path


# ══════════════════════════════════════════════════════════════════
# Ollama AI calls
# ══════════════════════════════════════════════════════════════════

def _ollama_client():
    return OllamaClient(
        host=OLLAMA_HOST,
        auth=httpx.DigestAuth(OLLAMA_USER, OLLAMA_PASS),
    )


def call_ollama(
    prompt_id: str, subject_code: str, transcript: str,
):
    """Call university Ollama for one YAML prompt."""
    logging.info(
        'Ollama [%s] starting (model=%s)',
        prompt_id, OLLAMA_MODEL,
    )
    try:
        client = _ollama_client()
        prompt_cfg = PROMPTS[prompt_id]
        system = prompt_cfg['template'].format(
            subject_code=subject_code,
        )
        response = client.chat(
            model=OLLAMA_MODEL,
            stream=False,
            options={'num_ctx': 8192},
            messages=[
                {'role': 'system', 'content': system},
                {
                    'role': 'user',
                    'content': (
                        f'Přepis přednášky:\n\n{transcript}'
                    ),
                },
            ],
        )
        result = response['message']['content']
        logging.info(
            'Ollama [%s] done (%d chars)',
            prompt_id, len(result),
        )
        return result
    except Exception as e:
        logging.error('Ollama [%s] failed: %s', prompt_id, e)
        raise


def call_ollama_raw(system: str, user_msg: str):
    """Call Ollama with raw system/user messages."""
    logging.info('Ollama raw call starting (model=%s)', OLLAMA_MODEL)
    try:
        client = _ollama_client()
        response = client.chat(
            model=OLLAMA_MODEL,
            stream=False,
            options={'num_ctx': 8192},
            messages=[
                {'role': 'system', 'content': system},
                {'role': 'user', 'content': user_msg},
            ],
        )
        result = response['message']['content']
        logging.info('Ollama raw call done (%d chars)', len(result))
        return result
    except Exception as e:
        logging.error('Ollama raw call failed: %s', e)
        raise


# ══════════════════════════════════════════════════════════════════
# Background processing
# ══════════════════════════════════════════════════════════════════

def process_task(
    task_id: str, file_data: bytes,
    lang: str, subject_code: str,
):
    t = tasks[task_id]
    logging.info(
        'Task %s: started (lang=%s, %d bytes)',
        task_id[:8], lang, len(file_data),
    )

    # 1. Transcription
    app_id = LANGUAGE_MODELS.get(lang, 'generic/cs/zipformer')
    api_url = f'{UWEBASR_BASE_URL}/{app_id}?format=plaintext'
    logging.info('Task %s: ASR request to %s', task_id[:8], app_id)
    try:
        resp = requests.post(
            api_url, data=file_data,
            headers={'Content-Type': 'application/octet-stream'},
            timeout=3600,
        )
        if resp.status_code == 503:
            logging.warning('Task %s: ASR 503 (busy)', task_id[:8])
            t.update(
                status='error',
                error='All ASR workers are busy. Try again.',
            )
            return
        if resp.status_code != 200:
            logging.error(
                'Task %s: ASR HTTP %d', task_id[:8], resp.status_code,
            )
            t.update(
                status='error',
                error=f'ASR API HTTP {resp.status_code}.',
            )
            return
        transcript = resp.text
        logging.info(
            'Task %s: ASR done (%d chars)',
            task_id[:8], len(transcript),
        )
    except requests.Timeout:
        logging.error('Task %s: ASR timeout', task_id[:8])
        t.update(
            status='error',
            error='ASR request timed out after 1 hour.',
        )
        return
    except requests.RequestException as e:
        logging.error('Task %s: ASR network error: %s', task_id[:8], e)
        t.update(status='error', error=f'Network error: {e}')
        return

    with open(OUTPUT_FILE, 'w', encoding='utf-8') as fh:
        fh.write(transcript)
    t['result'] = transcript

    # 2. AI summarisation via Ollama (parallel)
    t['status'] = 'summarizing'
    logging.info('Task %s: starting AI summarisation', task_id[:8])
    sections = {}
    prompt_ids = [
        pid for pid in
        ('lecture_summary', 'not_in_slides', 'glossary')
        if pid in PROMPTS
    ]
    try:
        from concurrent.futures import ThreadPoolExecutor, as_completed

        def _run_prompt(pid):
            return pid, call_ollama(
                pid, subject_code, transcript,
            )

        with ThreadPoolExecutor(max_workers=3) as pool:
            futures = {
                pool.submit(_run_prompt, pid): pid
                for pid in prompt_ids
            }
            for future in as_completed(futures):
                pid, result = future.result()
                sections[pid] = result
        logging.info(
            'Task %s: AI summarisation done (%d sections)',
            task_id[:8], len(sections),
        )
    except Exception as e:
        logging.error(
            'Task %s: AI summarisation failed: %s',
            task_id[:8], e, exc_info=True,
        )
        t.update(
            status='done', summary=None, pdf_ready=False,
            error=f'AI summarisation failed: {e}',
        )
        return

    t['summary'] = sections.get('lecture_summary', '')

    # 3. PDF generation
    t['status'] = 'generating_pdf'
    logging.info('Task %s: generating PDF', task_id[:8])
    try:
        generate_pdf(task_id, subject_code, sections)
        logging.info('Task %s: PDF ready', task_id[:8])
        t.update(status='done', pdf_ready=True)
    except Exception as e:
        logging.error(
            'Task %s: PDF generation failed: %s',
            task_id[:8], e, exc_info=True,
        )
        t.update(
            status='done', pdf_ready=False,
            error=f'PDF generation failed: {e}',
        )


# ══════════════════════════════════════════════════════════════════
# Routes
# ══════════════════════════════════════════════════════════════════

@app.route('/health')
def health():
    return jsonify({
        'status': 'ok',
        'model': OLLAMA_MODEL,
    }), 200


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
    subject_code = (
        request.form.get('subject_code', 'KKY').strip()
        or 'KKY'
    )
    file_data = f.read()

    task_id = str(uuid.uuid4())
    tasks[task_id] = {
        'status': 'processing',
        'result': None,
        'summary': None,
        'pdf_ready': False,
        'error': None,
    }

    threading.Thread(
        target=process_task,
        args=(task_id, file_data, lang, subject_code),
        daemon=True,
    ).start()
    return jsonify({'task_id': task_id})


@app.route('/status/<task_id>')
def status(task_id):
    task = tasks.get(task_id)
    if task is None:
        return jsonify({'error': 'Task not found'}), 404
    return jsonify(task)


@app.route('/pdf/<task_id>')
def download_pdf(task_id):
    pdf_path = os.path.join(PDF_DIR, f'{task_id}.pdf')
    if not os.path.exists(pdf_path):
        return jsonify({'error': 'PDF not ready'}), 404
    return send_file(
        pdf_path, as_attachment=True,
        download_name='lecture_summary.pdf',
    )


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
                            for cell in row:
                                if not cell:
                                    continue
                                if not isinstance(cell, str):
                                    continue
                                cell = cell.strip()
                                skip = (
                                    'Příjmení a jméno',
                                    'Poř.', 'Os. číslo',
                                    'Poznámka', 'Týden', '',
                                )
                                if cell in skip:
                                    continue
                                if re.match(
                                    r'^A\d{2}B\d{4}P$', cell,
                                ):
                                    continue
                                if re.match(
                                    r'^\d+\.?$', cell,
                                ):
                                    continue
                                pat = r'^[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]{2,}'
                                if re.match(pat, cell):
                                    parts = cell.split()
                                    if len(parts) >= 2:
                                        surname = parts[0].title()
                                        first = ' '.join(parts[1:])
                                        names.append(
                                            f"{first} {surname}"
                                        )
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
                    for i, cell in enumerate(row):
                        c = cell.strip().lower()
                        if 'jméno' in c or 'name' in c:
                            name_col = i
                            break
                    if name_col is not None:
                        continue
                    name_col = 1 if len(row) > 1 else 0
                if name_col >= len(row):
                    continue
                cell = row[name_col].strip()
                if not cell:
                    continue
                if re.match(r'^A\d{2}B\d{4}P$', cell):
                    continue
                if re.match(r'^\d+\.?$', cell):
                    continue
                pat = r'^[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]{2,}'
                if re.match(pat, cell):
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
                n.strip()
                for n in content.replace('\n', ',').split(',')
                if n.strip()
            ]
            return jsonify({'names': names})

        else:
            return jsonify({
                'error': 'Unsupported format. Use PDF, CSV, TXT.',
            }), 400

    except Exception as e:
        return jsonify({
            'error': f'Failed to parse file: {str(e)}',
        }), 500


@app.route('/clean', methods=['POST'])
def clean_transcript():
    data = request.get_json()
    if not data or 'transcript' not in data:
        return jsonify({'error': 'No transcript provided'}), 400

    transcript = data['transcript']
    student_names = data.get('student_names', [])
    custom_prompt = data.get('custom_prompt', '')

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

    system = (
        "You are a text editor. Process the transcript "
        "according to these rules:\n"
        "1. Remove all political discussions and "
        "politically charged content. Replace with "
        "'[politicky obsah odstranen]'.\n"
        "2. Keep all educational content intact."
        f"{names_instruction}\n"
        "4. Return ONLY the cleaned transcript.\n"
        "5. Preserve the original language.\n"
        "6. Preserve paragraph structure."
        f"{custom_instruction}"
    )

    try:
        cleaned = call_ollama_raw(
            system, f"Transcript:\n{transcript}",
        )
        return jsonify({'cleaned': cleaned})
    except Exception as e:
        return jsonify({
            'error': f'AI processing failed: {str(e)}',
        }), 500


@app.route('/summarize', methods=['POST'])
def summarize():
    data = request.get_json()
    if not data or 'transcript' not in data:
        return jsonify({'error': 'No transcript provided'}), 400

    transcript = data['transcript']

    # Use YAML prompt if available, otherwise fallback
    if 'lecture_summary' in PROMPTS:
        prompt_cfg = PROMPTS['lecture_summary']
        system = prompt_cfg['template'].format(
            subject_code='KKY',
        )
    else:
        system = (
            "Jsi akademický asistent. Vytvoř stručné shrnutí "
            "přepisu přednášky.\n"
            "Pravidla:\n"
            "1. Piš ve STEJNÉM jazyce jako přepis.\n"
            "2. Použij odrážky pro klíčová témata.\n"
            "3. Nepřekračuj 300 slov.\n"
            "4. Začni jednou větou přehledu.\n"
            "5. Pak uveď hlavní probírané body.\n"
            "6. NEPŘIDÁVEJ informace, které nejsou v přepisu.\n"
            "7. NEZAHRNUJ žádný meta-komentář."
        )

    try:
        summary = call_ollama_raw(
            system, f"Přepis přednášky:\n\n{transcript}",
        )
        return jsonify({'summary': summary})
    except Exception as e:
        return jsonify({
            'error': f'Summarization failed: {str(e)}',
        }), 500


if __name__ == '__main__':
    app.run(
        debug=True, host='0.0.0.0',
        port=5001, threaded=True,
    )
