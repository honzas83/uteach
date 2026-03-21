/* ========================================
   UTEACH.AI — Application Logic
   ======================================== */
(function () {
    'use strict';

    const $ = (s) => document.querySelector(s);
    const $$ = (s) => document.querySelectorAll(s);

    // DOM
    const themeToggle  = $('#themeToggle');
    const stepperFill  = $('#stepperFill');
    const tabs         = $$('.tab');
    const panelUpload  = $('#panelUpload');
    const panelRecord  = $('#panelRecord');
    const dropzone     = $('#dropzone');
    const fileInput    = $('#fileInput');
    const browseBtn    = $('#browseBtn');
    const filePreview  = $('#filePreview');
    const fileNameEl   = $('#fileName');
    const fileSizeEl   = $('#fileSize');
    const removeFile   = $('#removeFile');
    const audioPlayer  = $('#audioPlayer');
    const micSelect    = $('#micSelect');
    const recordBtn    = $('#recordBtn');
    const recorderTime = $('#recorderTime');
    const recorderHint = $('#recorderHint');
    const waveCanvas   = $('#waveCanvas');
    const recPreview   = $('#recordingPreview');
    const recordedAudio= $('#recordedAudio');
    const discardBtn   = $('#discardRecording');
    const submitBtn    = $('#submitBtn');
    const toast        = $('#toast');
    const toastMsg     = $('#toastMessage');
    const langSelect   = $('#langSelect');
    const copyTranscript = $('#copyTranscript');
    const copySummary  = $('#copySummary');
    const copyPii      = $('#copyPii');
    const downloadPdf  = $('#downloadPdf');
    const newSession   = $('#newSession');

    // Model / prompt selection DOM
    const modelSelect  = $('#modelSelect');
    const promptSelect = $('#promptSelect');
    const promptDesc   = $('#promptDesc');
    const promptParams = $('#promptParams');

    // Edit summary DOM
    const editInstruction = $('#editInstruction');
    const editSummaryBtn  = $('#editSummaryBtn');

    // Privacy modal DOM
    const privacyModal   = $('#privacyModal');
    const privacyClose   = $('#privacyModalClose');
    const privacySkip    = $('#privacySkip');
    const privacyConfirm = $('#privacyConfirm');
    const studentDropzone   = $('#studentDropzone');
    const studentFileInput  = $('#studentFileInput');
    const studentBrowseBtn  = $('#studentBrowseBtn');
    const studentFileTag    = $('#studentFileTag');
    const studentFileName   = $('#studentFileName');
    const studentFileRemove = $('#studentFileRemove');
    const privacyPrompt     = $('#privacyPrompt');

    // State
    let currentFile = null;
    let recordedBlob = null;
    let studentFile = null;
    let privacyText = '';
    let isRecording = false;
    let recInterval = null;
    let recSec = 0;
    let audioCtx = null;
    let analyser = null;
    let animFrame = null;
    let liveStream = null;  // for waveform visualization only

    // Model/prompt state
    let allPrompts = {};        // { model_name: [ promptEntry, ... ] }
    let currentSummaryText = '';

    // Backup recorder instance
    const backupRecorder = new AutoBackupAudioRecorder({
        timeslice: 5000,
        onChunkSaved: ({ index, size }) => {
            console.log(`Chunk #${index} saved (${size} bytes)`);
        },
        onStateChange: ({ state, sessionId }) => {
            console.log(`Recorder state: ${state}, session: ${sessionId}`);
        }
    });

    /* ---- Theme ---- */
    (function initTheme() {
        if (localStorage.getItem('uteach-theme') === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
        }
    })();

    themeToggle.addEventListener('click', () => {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        if (isDark) {
            document.documentElement.removeAttribute('data-theme');
            localStorage.setItem('uteach-theme', 'light');
        } else {
            document.documentElement.setAttribute('data-theme', 'dark');
            localStorage.setItem('uteach-theme', 'dark');
        }
    });

    /* ---- Stepper ---- */
    function goToStep(n) {
        $$('.stepper-node').forEach((node, i) => {
            node.classList.remove('active', 'done');
            if (i + 1 < n) node.classList.add('done');
            if (i + 1 === n) node.classList.add('active');
        });

        // Fill progress bar: 0% for step 1, 50% for step 2, 100% for step 3
        stepperFill.style.width = ((n - 1) / 2 * 100) + '%';

        $$('.section').forEach(s => s.classList.remove('active'));
        $(`#step${n}`).classList.add('active');
    }

    /* ---- Tabs ---- */
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            if (tab.dataset.tab === 'upload') {
                panelUpload.classList.add('active');
                panelRecord.classList.remove('active');
            } else {
                panelRecord.classList.add('active');
                panelUpload.classList.remove('active');
                loadMics();
            }
            updateSubmit();
        });
    });

    /* ---- File Upload ---- */
    browseBtn.addEventListener('click', e => { e.stopPropagation(); fileInput.click(); });
    dropzone.addEventListener('click', () => fileInput.click());

    dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('dragover'); });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    dropzone.addEventListener('drop', e => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
    });

    fileInput.addEventListener('change', () => {
        if (fileInput.files.length) handleFile(fileInput.files[0]);
    });

    function handleFile(file) {
        if (!file.type.startsWith('audio/')) {
            showToast('Vyberte prosím zvukový soubor');
            return;
        }
        currentFile = file;
        fileNameEl.textContent = file.name;
        fileSizeEl.textContent = fmtSize(file.size);
        audioPlayer.src = URL.createObjectURL(file);
        dropzone.classList.add('hidden');
        filePreview.classList.remove('hidden');
        updateSubmit();
    }

    removeFile.addEventListener('click', () => {
        currentFile = null;
        fileInput.value = '';
        audioPlayer.src = '';
        dropzone.classList.remove('hidden');
        filePreview.classList.add('hidden');
        updateSubmit();
    });

    function fmtSize(b) {
        if (b < 1024) return b + ' B';
        if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
        return (b / 1048576).toFixed(1) + ' MB';
    }

    /* ---- Microphones ---- */
    let micsLoaded = false;
    async function loadMics() {
        if (micsLoaded) return;
        try {
            const tmp = await navigator.mediaDevices.getUserMedia({ audio: true });
            tmp.getTracks().forEach(t => t.stop());
            const devs = await navigator.mediaDevices.enumerateDevices();
            const mics = devs.filter(d => d.kind === 'audioinput');
            micSelect.innerHTML = '';
            mics.forEach((m, i) => {
                const o = document.createElement('option');
                o.value = m.deviceId;
                o.textContent = m.label || `Mikrofon ${i + 1}`;
                micSelect.appendChild(o);
            });
        } catch {
            micSelect.innerHTML = '<option value="">Mikrofon nedostupný</option>';
        }
        micsLoaded = true;
    }

    /* ---- Model & Prompt selection ---- */
    async function loadModels() {
        try {
            const res = await fetch('/models');
            const data = await res.json();
            const models = data.models || [];

            modelSelect.innerHTML = '';
            if (!models.length) {
                modelSelect.innerHTML = '<option value="">Žádné modely</option>';
                return;
            }

            models.forEach((m, i) => {
                const o = document.createElement('option');
                o.value = m;
                o.textContent = m;
                if (i === 0) o.selected = true;
                modelSelect.appendChild(o);
            });

            await loadPromptsForModel(models[0]);
        } catch (e) {
            modelSelect.innerHTML = '<option value="">Nelze načíst modely</option>';
            console.warn('Model load failed:', e);
        }
    }

    async function loadPromptsForModel(modelName) {
        promptSelect.disabled = true;
        promptSelect.innerHTML = '<option value="">Načítání...</option>';
        promptDesc.textContent = '';
        promptParams.innerHTML = '';

        try {
            const res = await fetch('/summarize-prompts?model_name=' + encodeURIComponent(modelName));
            const data = await res.json();
            const prompts = data[modelName] || [];
            allPrompts[modelName] = prompts;

            promptSelect.innerHTML = '';
            if (!prompts.length) {
                promptSelect.innerHTML = '<option value="">Žádné prompty pro tento model</option>';
                return;
            }

            prompts.forEach((p, i) => {
                const o = document.createElement('option');
                o.value = p.id;
                o.textContent = p.name;
                if (i === 0) o.selected = true;
                promptSelect.appendChild(o);
            });

            promptSelect.disabled = false;
            renderPromptDetails(modelName, prompts[0].id);
        } catch (e) {
            promptSelect.innerHTML = '<option value="">Chyba načítání promptů</option>';
            console.warn('Prompt load failed:', e);
        }
    }

    function renderPromptDetails(modelName, promptId) {
        const prompts = allPrompts[modelName] || [];
        const entry = prompts.find(p => p.id === promptId);
        if (!entry) { promptDesc.textContent = ''; promptParams.innerHTML = ''; return; }

        promptDesc.textContent = entry.description || '';

        promptParams.innerHTML = '';
        (entry.parameters || []).forEach(param => {
            const div = document.createElement('div');
            div.className = 'param-field';
            div.innerHTML = `
                <label class="param-label" for="param_${param.name}">${param.name}</label>
                <input class="param-input" id="param_${param.name}" type="text"
                    placeholder="${param.description || ''}" data-param="${param.name}">
            `;
            promptParams.appendChild(div);
        });
    }

    function getPromptParameters() {
        const params = {};
        promptParams.querySelectorAll('.param-input').forEach(input => {
            params[input.dataset.param] = input.value.trim();
        });
        return params;
    }

    modelSelect.addEventListener('change', () => {
        if (modelSelect.value) loadPromptsForModel(modelSelect.value);
    });

    promptSelect.addEventListener('change', () => {
        renderPromptDetails(modelSelect.value, promptSelect.value);
    });

    // Load models on startup
    loadModels();

    /* ---- Recording (via AutoBackupAudioRecorder) ---- */
    recordBtn.addEventListener('click', () => isRecording ? stopRec() : startRec());

    async function startRec() {
        try {
            // Start backup recorder with selected microphone
            const selectedDeviceId = micSelect.value || undefined;
            await backupRecorder.start(selectedDeviceId);

            // Get the live stream from the recorder for waveform viz
            liveStream = backupRecorder.stream;

            isRecording = true;
            recordBtn.classList.add('recording');
            recorderHint.textContent = 'Nahrávání... klikněte pro zastavení';
            micSelect.disabled = true;

            recSec = 0;
            recorderTime.textContent = '00:00';
            recInterval = setInterval(() => {
                recSec++;
                recorderTime.textContent =
                    String(Math.floor(recSec / 60)).padStart(2, '0') + ':' +
                    String(recSec % 60).padStart(2, '0');
            }, 1000);

            if (liveStream) initWave(liveStream);
        } catch {
            showToast('Nelze přistoupit k mikrofonu');
        }
    }

    async function stopRec() {
        // Stop waveform & timer immediately for responsive UI
        isRecording = false;
        recordBtn.classList.remove('recording');
        recorderHint.textContent = 'Stiskněte pro nahrávání';
        micSelect.disabled = false;
        clearInterval(recInterval);
        if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
        if (audioCtx) { audioCtx.close(); audioCtx = null; }
        liveStream = null;

        // Stop backup recorder & assemble blob from IndexedDB chunks
        try {
            const result = await backupRecorder.stop();
            if (result && result.blob && result.blob.size > 0) {
                recordedBlob = result.blob;
                recordedAudio.src = result.url;
                recPreview.classList.remove('hidden');
                updateSubmit();
            }
        } catch (err) {
            console.error('Stop recording failed:', err);
            showToast('Chyba při zastavení nahrávání');
        }
    }

    discardBtn.addEventListener('click', async () => {
        // Clear from IndexedDB too
        if (backupRecorder.sessionId) {
            await backupRecorder.clearSession(backupRecorder.sessionId).catch(() => {});
        }
        recordedBlob = null;
        recordedAudio.src = '';
        recPreview.classList.add('hidden');
        recSec = 0;
        recorderTime.textContent = '00:00';
        clearCanvas();
        updateSubmit();
    });

    // On page load — check for a recoverable session from a previous crash
    (async function tryRecoverSession() {
        try {
            const recovered = await backupRecorder.recoverLatestSession();
            if (recovered && recovered.blob && recovered.blob.size > 0) {
                recordedBlob = recovered.blob;
                recordedAudio.src = recovered.url;

                // Switch to record tab & show preview
                tabs.forEach(t => t.classList.remove('active'));
                tabs[1].classList.add('active');
                panelRecord.classList.add('active');
                panelUpload.classList.remove('active');
                recPreview.classList.remove('hidden');
                updateSubmit();
                showToast('Obnovena předchozí nahrávka');
            }
        } catch {
            // No session to recover — that's fine
        }
    })();

    /* ---- Waveform ---- */
    function initWave(s) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        audioCtx.createMediaStreamSource(s).connect(analyser);

        const ctx = waveCanvas.getContext('2d');
        const buf = new Uint8Array(analyser.frequencyBinCount);

        function draw() {
            animFrame = requestAnimationFrame(draw);
            analyser.getByteFrequencyData(buf);

            const dpr = devicePixelRatio || 1;
            waveCanvas.width = waveCanvas.offsetWidth * dpr;
            waveCanvas.height = waveCanvas.offsetHeight * dpr;
            ctx.scale(dpr, dpr);

            const w = waveCanvas.offsetWidth, h = waveCanvas.offsetHeight;
            ctx.clearRect(0, 0, w, h);

            const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
            const bars = 52, gap = 2.5;
            const bw = (w - gap * (bars - 1)) / bars;
            const step = Math.floor(buf.length / bars);

            for (let i = 0; i < bars; i++) {
                const v = buf[i * step] / 255;
                const bh = Math.max(2, v * h * 0.85);
                const x = i * (bw + gap);
                const y = (h - bh) / 2;

                // Gradient bar
                const grd = ctx.createLinearGradient(x, y, x, y + bh);
                grd.addColorStop(0, accent);
                grd.addColorStop(1, 'rgba(139,92,246,0.6)');
                ctx.fillStyle = grd;
                ctx.beginPath();
                ctx.roundRect(x, y, bw, bh, 2);
                ctx.fill();
            }
        }
        draw();
    }

    function clearCanvas() {
        const ctx = waveCanvas.getContext('2d');
        ctx.clearRect(0, 0, waveCanvas.width, waveCanvas.height);
    }

    /* ---- Submit ---- */
    function updateSubmit() {
        const up = panelUpload.classList.contains('active');
        const ok = up ? !!currentFile : !!recordedBlob;
        submitBtn.disabled = !ok;
        submitBtn.classList.toggle('disabled', !ok);
    }

    submitBtn.addEventListener('click', () => {
        if (submitBtn.disabled) return;
        openPrivacyModal();
    });

    /* ---- Privacy Modal ---- */
    function openPrivacyModal() {
        privacyModal.classList.remove('hidden');
    }
    function closePrivacyModal() {
        privacyModal.classList.add('hidden');
    }

    privacyClose.addEventListener('click', closePrivacyModal);
    privacyModal.addEventListener('click', (e) => {
        if (e.target === privacyModal) closePrivacyModal();
    });

    privacySkip.addEventListener('click', () => {
        studentFile = null;
        privacyText = '';
        privacyPrompt.value = '';
        studentFileTag.classList.add('hidden');
        studentDropzone.style.display = '';
        closePrivacyModal();
        goToStep(2);
        runProcessing();
    });

    privacyConfirm.addEventListener('click', () => {
        privacyText = privacyPrompt.value.trim();
        closePrivacyModal();
        goToStep(2);
        runProcessing();
    });

    // Student file upload
    studentBrowseBtn.addEventListener('click', (e) => { e.stopPropagation(); studentFileInput.click(); });
    studentDropzone.addEventListener('click', () => studentFileInput.click());

    studentDropzone.addEventListener('dragover', (e) => { e.preventDefault(); studentDropzone.classList.add('dragover'); });
    studentDropzone.addEventListener('dragleave', () => studentDropzone.classList.remove('dragover'));
    studentDropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        studentDropzone.classList.remove('dragover');
        if (e.dataTransfer.files.length) handleStudentFile(e.dataTransfer.files[0]);
    });

    studentFileInput.addEventListener('change', () => {
        if (studentFileInput.files.length) handleStudentFile(studentFileInput.files[0]);
    });

    function handleStudentFile(file) {
        const ext = file.name.split('.').pop().toLowerCase();
        if (ext !== 'csv' && ext !== 'pdf') {
            showToast('Vyberte prosím soubor CSV nebo PDF');
            return;
        }
        studentFile = file;
        studentFileName.textContent = file.name;
        studentFileTag.classList.remove('hidden');
        studentDropzone.style.display = 'none';
    }

    studentFileRemove.addEventListener('click', () => {
        studentFile = null;
        studentFileInput.value = '';
        studentFileTag.classList.add('hidden');
        studentDropzone.style.display = '';
    });

    /* ---- Polling helper ---- */
    async function pollJob(taskId) {
        while (true) {
            await delay(2000);
            const res = await fetch('/status/' + taskId);
            const data = await res.json();
            if (data.status === 'finished') return data.result;
            if (data.status === 'failed') throw new Error(data.error || 'Job failed');
        }
    }

    /* ---- Processing ---- */
    async function runProcessing() {
        const stageTranscribe = $('#stageTranscribe');
        const stageSummarize  = $('#stageSummarize');
        const stagePdf        = $('#stagePdf');

        const modelName  = modelSelect.value;
        const promptId   = promptSelect.value;
        const parameters = getPromptParameters();

        // --- Stage 1: Transcription ---
        stageTranscribe.classList.add('active');

        const formData = new FormData();
        const isUpload = panelUpload.classList.contains('active');
        if (isUpload && currentFile) {
            formData.append('file', currentFile);
        } else if (recordedBlob) {
            formData.append('file', recordedBlob, 'recording.webm');
        } else {
            showToast('Žádný soubor k odeslání');
            goToStep(1);
            return;
        }
        formData.append('language', langSelect ? langSelect.value : 'cs');

        let transcript = null;
        try {
            const res = await fetch('/transcribe', { method: 'POST', body: formData });
            const data = await res.json();
            if (!res.ok || data.error) {
                showToast(data.error || 'Chyba při odeslání souboru');
                goToStep(1);
                stageTranscribe.classList.remove('active');
                return;
            }
            transcript = await pollJob(data.task_id);
        } catch (e) {
            showToast(e.message || 'Nelze se připojit k serveru');
            goToStep(1);
            stageTranscribe.classList.remove('active');
            return;
        }

        stageTranscribe.classList.remove('active');
        stageTranscribe.classList.add('done');

        // --- Stage 2: AI cleaning ---
        stageSummarize.classList.add('active');

        let studentNames = [];
        if (studentFile) {
            try {
                const sf = new FormData();
                sf.append('file', studentFile);
                const parseRes = await fetch('/parse-students', { method: 'POST', body: sf });
                const parseData = await parseRes.json();
                if (parseRes.ok && parseData.names) studentNames = parseData.names;
            } catch (e) {
                console.warn('Student file parse failed:', e);
            }
        }

        try {
            const cleanRes = await fetch('/clean', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    transcript,
                    model_name: modelName,
                    prompt_id: 'remove_political_anonymize',
                    parameters: { student_names: studentNames.join(', ') },
                })
            });
            const cleanData = await cleanRes.json();
            if (cleanRes.ok && cleanData.task_id) {
                try { transcript = await pollJob(cleanData.task_id); } catch (e) {
                    console.warn('AI cleaning failed:', e);
                }
            }
        } catch (e) {
            console.warn('AI cleaning unavailable:', e);
        }

        stageSummarize.classList.remove('active');
        stageSummarize.classList.add('done');

        // --- Stage 3: Summarization + optional PII detection ---
        stagePdf.classList.add('active');

        let summaryText = '';
        let piiText = '';

        // Summarization using selected prompt
        try {
            const sumRes = await fetch('/summarize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ transcript, model_name: modelName, prompt_id: promptId, parameters })
            });
            const sumData = await sumRes.json();
            if (sumRes.ok && sumData.task_id) {
                try { summaryText = await pollJob(sumData.task_id); } catch (e) {
                    console.warn('Summarization polling failed:', e);
                }
            }
        } catch (e) {
            console.warn('Summarization failed:', e);
        }

        // PII detection — run in parallel after summary, show card if results
        try {
            const piiRes = await fetch('/pii-detect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ transcript, model_name: modelName, prompt_id: 'detect_all', parameters: {} })
            });
            const piiData = await piiRes.json();
            if (piiRes.ok && piiData.task_id) {
                try { piiText = await pollJob(piiData.task_id); } catch (e) {
                    console.warn('PII detection polling failed:', e);
                }
            }
        } catch (e) {
            console.warn('PII detection failed:', e);
        }

        stagePdf.classList.remove('active');
        stagePdf.classList.add('done');

        currentSummaryText = summaryText;

        await delay(300);
        goToStep(3);
        fillResults(transcript, summaryText, piiText);
    }

    function fillResults(transcript, summaryText, piiText) {
        // Transcript
        const body = $('#transcriptBody');
        body.innerHTML = '';
        if (transcript) {
            transcript.split('\n').filter(Boolean).forEach(line => {
                const p = document.createElement('p');
                p.textContent = line;
                body.appendChild(p);
            });
        } else {
            body.innerHTML = '<p>Transkripce nebyla získána.</p>';
        }

        // Summary
        const summary = $('#summaryBody');
        if (summaryText) {
            summary.innerHTML = summaryText.split('\n').filter(Boolean)
                .map(line => '<p>' + escHtml(line) + '</p>').join('');
        } else {
            summary.innerHTML = '<p><em>Shrnutí nebylo vygenerováno.</em></p>';
        }

        // PII
        const piiCard = $('#piiCard');
        const piiBody = $('#piiBody');
        if (piiText && piiText.trim()) {
            piiBody.innerHTML = piiText.split('\n').filter(Boolean)
                .map(line => '<p>' + escHtml(line) + '</p>').join('');
            piiCard.classList.remove('hidden');
        } else {
            piiCard.classList.add('hidden');
        }
    }

    function escHtml(s) {
        const d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }

    /* ---- Edit summary ---- */
    editSummaryBtn.addEventListener('click', async () => {
        const instruction = editInstruction.value.trim();
        if (!instruction) { showToast('Zadejte instrukci pro úpravu'); return; }
        if (!currentSummaryText) { showToast('Nejprve vygenerujte shrnutí'); return; }

        editSummaryBtn.disabled = true;
        editSummaryBtn.textContent = 'Upravuji...';

        try {
            const res = await fetch('/edit-summary', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    summary: currentSummaryText,
                    instruction,
                    model_name: modelSelect.value,
                })
            });
            const data = await res.json();
            if (!res.ok || !data.task_id) throw new Error(data.error || 'Chyba');
            const edited = await pollJob(data.task_id);
            currentSummaryText = edited;
            const summary = $('#summaryBody');
            summary.innerHTML = edited.split('\n').filter(Boolean)
                .map(line => '<p>' + escHtml(line) + '</p>').join('');
            editInstruction.value = '';
            showToast('Shrnutí upraveno');
        } catch (e) {
            showToast(e.message || 'Úprava shrnutí selhala');
        } finally {
            editSummaryBtn.disabled = false;
            editSummaryBtn.innerHTML = `
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M11.5 2.5a1.5 1.5 0 0 1 2.12 2.12L5 13.12 2 14l.88-3L11.5 2.5z"/>
                </svg>
                Upravit shrnutí`;
        }
    });

    /* ---- Results Actions ---- */
    copyTranscript.addEventListener('click', () => copyTxt($('#transcriptBody').innerText, 'Transkript zkopírován'));
    copySummary.addEventListener('click', () => copyTxt($('#summaryBody').innerText, 'Shrnutí zkopírováno'));
    copyPii && copyPii.addEventListener('click', () => copyTxt($('#piiBody').innerText, 'PII zkopírováno'));

    function copyTxt(t, m) { navigator.clipboard.writeText(t).then(() => showToast(m)); }

    downloadPdf.addEventListener('click', () => showToast('PDF bude k dispozici po připojení backendu'));
    newSession.addEventListener('click', resetApp);

    async function resetApp() {
        // Clear backup session from IndexedDB
        if (backupRecorder.sessionId) {
            await backupRecorder.clearSession(backupRecorder.sessionId).catch(() => {});
        }
        currentFile = null;
        recordedBlob = null;
        studentFile = null;
        privacyText = '';
        currentSummaryText = '';
        privacyPrompt.value = '';
        studentFileInput.value = '';
        studentFileTag.classList.add('hidden');
        studentDropzone.style.display = '';
        fileInput.value = '';
        audioPlayer.src = '';
        recordedAudio.src = '';
        dropzone.classList.remove('hidden');
        filePreview.classList.add('hidden');
        recPreview.classList.add('hidden');
        recorderTime.textContent = '00:00';
        editInstruction.value = '';
        clearCanvas();

        tabs.forEach(t => t.classList.remove('active'));
        tabs[0].classList.add('active');
        panelUpload.classList.add('active');
        panelRecord.classList.remove('active');

        $$('.proc-item').forEach(s => s.classList.remove('active', 'done'));

        updateSubmit();
        goToStep(1);
    }

    /* ---- Toast ---- */
    let toastTimer = null;
    function showToast(msg) {
        if (toastTimer) clearTimeout(toastTimer);
        toastMsg.textContent = msg;
        toast.classList.remove('hidden');
        void toast.offsetHeight;
        toast.classList.add('show');
        toastTimer = setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.classList.add('hidden'), 300);
        }, 2500);
    }

    function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

    // roundRect polyfill
    if (!CanvasRenderingContext2D.prototype.roundRect) {
        CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
            if (w < 2*r) r = w/2; if (h < 2*r) r = h/2;
            this.moveTo(x+r,y);
            this.arcTo(x+w,y,x+w,y+h,r);
            this.arcTo(x+w,y+h,x,y+h,r);
            this.arcTo(x,y+h,x,y,r);
            this.arcTo(x,y,x+w,y,r);
            this.closePath();
            return this;
        };
    }
})();
