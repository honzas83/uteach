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
    const copyTranscript = $('#copyTranscript');
    const copySummary  = $('#copySummary');
    const downloadPdf  = $('#downloadPdf');
    const newSession   = $('#newSession');

    // State
    let currentFile = null;
    let recordedBlob = null;
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
            showToast('Vyberte prosim zvukovy soubor');
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
    (async function loadMics() {
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
            micSelect.innerHTML = '<option value="">Mikrofon nedostupny</option>';
        }
    })();

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
            recorderHint.textContent = 'Nahravani... kliknete pro zastaveni';
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
            showToast('Nelze pristoupit k mikrofonu');
        }
    }

    async function stopRec() {
        // Stop waveform & timer immediately for responsive UI
        isRecording = false;
        recordBtn.classList.remove('recording');
        recorderHint.textContent = 'Stisknete pro nahravani';
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
            showToast('Chyba pri zastaveni nahravani');
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
                showToast('Obnovena predchozi nahravka');
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
        goToStep(2);
        runProcessing();
    });

    async function runProcessing() {
        const stages = [
            { id: 'stageTranscribe', ms: 2500 },
            { id: 'stageSummarize',  ms: 2000 },
            { id: 'stagePdf',       ms: 1500 }
        ];
        for (const s of stages) {
            const el = $(`#${s.id}`);
            el.classList.add('active');
            await delay(s.ms);
            el.classList.remove('active');
            el.classList.add('done');
        }
        await delay(400);
        goToStep(3);
        fillResults();
    }

    function fillResults() {
        $('#transcriptBody').innerHTML = `
            <p>Dobry den, vitejte na dnesni prednasce. Dnes se budeme zabyvat tematy, ktera jsou klicova pro pochopeni modernich pristupu v oblasti umele inteligence a strojoveho uceni.</p>
            <p>Prvni cast prednasky se zameri na zakladni koncepty neuronovych siti, vcetne perceptronu, aktivacnich funkci a zpetne propagace chyby. Vysvetlime si, jak tyto zakladni stavebni bloky tvori zaklad pro slozitejsi architektury.</p>
            <p>V druhe casti se presuneme k pokrocilym tematum, jako jsou konvolucni neuronove site, rekurentni site a mechanismus pozornosti. Ukazeme si prakticke priklady pouziti v oblasti zpracovani prirozeneho jazyka a pocitacoveho videni.</p>
            <p>Na zaver se podivame na aktualni trendy, vcetne velkych jazykovych modelu a jejich dopadu na spolecnost. Diskutovat budeme take o etickych aspektech nasazeni AI systemu v praxi.</p>
        `;
        $('#summaryBody').innerHTML = `
            <p><strong>Klicove body prednasky:</strong></p>
            <p>1. Zaklady neuronovych siti — perceptron, aktivacni funkce, zpetna propagace chyby jako stavebni bloky modernich architektur.</p>
            <p>2. Pokrocile architektury — konvolucni site (CNN), rekurentni site (RNN), mechanismus pozornosti (Attention) a jejich aplikace.</p>
            <p>3. Prakticke aplikace — zpracovani prirozeneho jazyka (NLP), pocitacove videni, automaticke rozpoznavani reci.</p>
            <p>4. Aktualni trendy a etika — velke jazykove modely (LLM), spolecensky dopad AI, odpovenne nasazeni.</p>
        `;
    }

    /* ---- Results Actions ---- */
    copyTranscript.addEventListener('click', () => copyTxt($('#transcriptBody').innerText, 'Transkript zkopirovan'));
    copySummary.addEventListener('click', () => copyTxt($('#summaryBody').innerText, 'Shrnuti zkopirovano'));

    function copyTxt(t, m) { navigator.clipboard.writeText(t).then(() => showToast(m)); }

    downloadPdf.addEventListener('click', () => showToast('PDF bude k dispozici po pripojeni backendu'));
    newSession.addEventListener('click', resetApp);

    async function resetApp() {
        // Clear backup session from IndexedDB
        if (backupRecorder.sessionId) {
            await backupRecorder.clearSession(backupRecorder.sessionId).catch(() => {});
        }
        currentFile = null;
        recordedBlob = null;
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
