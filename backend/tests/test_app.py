import sys
import os
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from server import app


@pytest.fixture
def client():
    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client


def test_health_endpoint(client):
    """Health check returns 200 and correct JSON."""
    resp = client.get('/health')
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['status'] == 'ok'


def test_index_page(client):
    """Homepage returns HTML."""
    resp = client.get('/')
    assert resp.status_code == 200
    assert b'<html' in resp.data.lower() or b'<!doctype' in resp.data.lower()


def test_static_css(client):
    """CSS file is served."""
    resp = client.get('/styles.css')
    assert resp.status_code == 200


def test_static_js(client):
    """JS files are served."""
    resp = client.get('/app.js')
    assert resp.status_code == 200


def test_transcribe_no_file(client):
    """POST /transcribe without file returns 400."""
    resp = client.post('/transcribe')
    assert resp.status_code == 400
    data = resp.get_json()
    assert 'error' in data


def test_transcribe_empty_file(client):
    """POST /transcribe with empty filename returns 400."""
    from io import BytesIO
    resp = client.post('/transcribe', data={
        'file': (BytesIO(b''), ''),
    }, content_type='multipart/form-data')
    assert resp.status_code == 400


def test_transcribe_returns_task_id(client):
    """POST /transcribe with valid file returns task_id."""
    from io import BytesIO
    resp = client.post('/transcribe', data={
        'file': (BytesIO(b'fake audio data'), 'test.wav'),
        'language': 'en',
    }, content_type='multipart/form-data')
    assert resp.status_code == 200
    data = resp.get_json()
    assert 'task_id' in data
    assert len(data['task_id']) == 36  # UUID format


def test_status_unknown_task(client):
    """GET /status/<unknown> returns 404."""
    resp = client.get('/status/00000000-0000-0000-0000-000000000000')
    assert resp.status_code == 404


def test_status_after_transcribe(client):
    """Status endpoint returns task info after transcribe."""
    from io import BytesIO
    resp = client.post('/transcribe', data={
        'file': (BytesIO(b'fake audio'), 'test.wav'),
    }, content_type='multipart/form-data')
    task_id = resp.get_json()['task_id']

    resp = client.get(f'/status/{task_id}')
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['status'] in ('processing', 'done', 'error')
