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
    const downloadPdf  = $('#downloadPdf');
    const newSession   = $('#newSession');

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
        if (!file.type.startsWith('audio/') && !file.type.startsWith('video/')) {
            showToast('Vyberte prosím zvukový nebo video soubor');
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

    /* ---- Recording (via AutoBackupAudioRecorder) ---- */
    recordBtn.addEventListener('click', () => isRecording ? stopRec() : startRec());

    async function startRec() {
        try {
            // Start backup recorder — it requests getUserMedia internally
            await backupRecorder.start();

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

    async function runProcessing() {
        const stageTranscribe = $('#stageTranscribe');
        const stageSummarize  = $('#stageSummarize');
        const stagePdf        = $('#stagePdf');

        // --- Stage 1: Transcription via backend ---
        stageTranscribe.classList.add('active');

        // Build FormData with the audio file
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

        let taskId;
        try {
            const res = await fetch('/transcribe', { method: 'POST', body: formData });
            const data = await res.json();
            if (!res.ok || data.error) {
                showToast(data.error || 'Chyba při odeslání souboru');
                goToStep(1);
                stageTranscribe.classList.remove('active');
                return;
            }
            taskId = data.task_id;
        } catch (e) {
            showToast('Nelze se připojit k serveru. Spusťte server.py');
            goToStep(1);
            stageTranscribe.classList.remove('active');
            return;
        }

        // Poll for transcription result
        let transcript = null;
        while (true) {
            await delay(2000);
            try {
                const statusRes = await fetch('/status/' + taskId);
                const statusData = await statusRes.json();
                if (statusData.status === 'done') {
                    transcript = statusData.result;
                    break;
                } else if (statusData.status === 'error') {
                    showToast(statusData.error || 'Chyba při transkripci');
                    goToStep(1);
                    stageTranscribe.classList.remove('active');
                    return;
                }
                // still processing — keep polling
            } catch {
                showToast('Ztráta spojení se serverem');
                goToStep(1);
                stageTranscribe.classList.remove('active');
                return;
            }
        }

        stageTranscribe.classList.remove('active');
        stageTranscribe.classList.add('done');

        // --- Stage 2: AI cleaning (privacy + student names) ---
        stageSummarize.classList.add('active');

        const rawTranscript = transcript;
        let aiUsed = false;

        // Parse student names from uploaded file
        let studentNames = [];
        if (studentFile) {
            try {
                const sf = new FormData();
                sf.append('file', studentFile);
                const parseRes = await fetch('/parse-students', {
                    method: 'POST', body: sf
                });
                const parseData = await parseRes.json();
                if (parseRes.ok && parseData.names) {
                    studentNames = parseData.names;
                }
            } catch (e) {
                console.warn('Student file parse failed:', e);
            }
        }

        try {
            const cleanRes = await fetch('/clean', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    transcript: transcript,
                    student_names: studentNames,
                    custom_prompt: privacyText
                })
            });
            const cleanData = await cleanRes.json();
            if (cleanRes.ok && cleanData.cleaned) {
                transcript = cleanData.cleaned;
                aiUsed = true;
            } else {
                console.warn('AI cleaning failed:', cleanData.error);
            }
        } catch (e) {
            console.warn('AI cleaning unavailable:', e);
        }

        stageSummarize.classList.remove('active');
        stageSummarize.classList.add('done');

        // --- Stage 3: AI summarization ---
        stagePdf.classList.add('active');

        let summaryText = '';
        try {
            const sumRes = await fetch('/summarize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ transcript: transcript })
            });
            const sumData = await sumRes.json();
            if (sumRes.ok && sumData.summary) {
                summaryText = sumData.summary;
            }
        } catch (e) {
            console.warn('Summarization failed:', e);
        }

        stagePdf.classList.remove('active');
        stagePdf.classList.add('done');

        await delay(300);
        goToStep(3);
        fillResults(transcript, summaryText, aiUsed ? rawTranscript : null);
    }

    function fillResults(transcript, summaryText, rawTranscript) {
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

        const summary = $('#summaryBody');
        let html = '';

        // AI summary
        if (summaryText) {
            html += '<div style="margin-bottom:16px;">';
            summaryText.split('\n').filter(Boolean).forEach(line => {
                html += '<p>' + escHtml(line) + '</p>';
            });
            html += '</div>';
        } else {
            html += '<p><em>Shrnutí nebylo vygenerováno.</em></p>';
        }

        // AI cleaning diff
        if (rawTranscript && rawTranscript !== transcript) {
            html += '<hr style="border:none;border-top:1px solid '
                + 'var(--border);margin:16px 0;">';
            html += '<p style="font-weight:600;font-size:0.82rem;'
                + 'margin-bottom:8px;">'
                + '🔍 Změny AI čištění:</p>';

            const rawLines = rawTranscript.split('\n')
                .filter(Boolean);
            const cleanLines = transcript.split('\n')
                .filter(Boolean);
            const cleanSet = new Set(cleanLines);
            const rawSet = new Set(rawLines);

            const removed = rawLines.filter(l => !cleanSet.has(l));
            const added = cleanLines.filter(l => !rawSet.has(l));

            if (removed.length) {
                removed.slice(0, 10).forEach(l => {
                    html += '<p style="color:#e53e3e;font-size:0.78rem;'
                        + 'text-decoration:line-through;opacity:0.7;">'
                        + escHtml(l) + '</p>';
                });
                if (removed.length > 10) {
                    html += '<p style="color:var(--text-3);'
                        + 'font-size:0.75rem;">...a dalších '
                        + (removed.length - 10) + ' řádků</p>';
                }
            }

            if (added.length) {
                added.slice(0, 10).forEach(l => {
                    html += '<p style="color:#38a169;'
                        + 'font-size:0.78rem;">'
                        + escHtml(l) + '</p>';
                });
            }
        }

        summary.innerHTML = html;
    }

    function escHtml(s) {
        const d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }

    /* ---- Results Actions ---- */
    copyTranscript.addEventListener('click', () => copyTxt($('#transcriptBody').innerText, 'Transkript zkopírován'));
    copySummary.addEventListener('click', () => copyTxt($('#summaryBody').innerText, 'Shrnutí zkopírováno'));

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
