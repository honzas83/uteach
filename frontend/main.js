/* ═══════════════════════════════════════════════════
   UTEACH.AI — Main Application Logic
   Premium lecture processing UI
   ═══════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ─────────── Helpers ─────────── */
  const $ = (s, ctx = document) => ctx.querySelector(s);
  const $$ = (s, ctx = document) => [...ctx.querySelectorAll(s)];

  /* ─────────── DOM refs ─────────── */
  const dom = {
    themeToggle:      $('#themeToggle'),
    stepperFill:      $('#stepperFill'),
    stepDots:         [1, 2, 3].map(i => $(`#stepDot${i}`)),
    stepLabels:       [1, 2, 3].map(i => $(`#stepLabel${i}`)),
    tabs:             $$('.tab'),
    uploadPanel:      $('#uploadPanel'),
    recordPanel:      $('#recordPanel'),
    dropzone:         $('#dropzone'),
    fileInput:        $('#fileInput'),
    browseBtn:        $('#browseBtn'),
    filePreview:      $('#filePreview'),
    fileName:         $('#fileName'),
    fileSize:         $('#fileSize'),
    removeFile:       $('#removeFile'),
    miniWaveCanvas:   $('#miniWaveCanvas'),
    micSelect:        $('#micSelect'),
    recordBtn:        $('#recordBtn'),
    recordIcon:       $('#recordIcon'),
    stopIcon:         $('#stopIcon'),
    recorderTime:     $('#recorderTime'),
    recorderHint:     $('#recorderHint'),
    waveCanvas:       $('#waveCanvas'),
    levelIndicator:   $('#levelIndicator'),
    recordingPreview: $('#recordingPreview'),
    recordingDuration:$('#recordingDuration'),
    discardRecording: $('#discardRecording'),
    submitBtn:        $('#submitBtn'),
    submitText:       $('#submitText'),
    btnSpinner:       $('#btnSpinner'),
    step1:            $('#step1'),
    step2:            $('#step2'),
    step3:            $('#step3'),
    procStages:       [1, 2, 3].map(i => $(`#proc${i}`)),
    resultSummary:    $('#resultSummary'),
    summaryContent:   $('#summaryContent'),
    editInstructions: $('#editInstructions'),
    regenerateBtn:    $('#regenerateBtn'),
    downloadPdf:      $('#downloadPdf'),
    downloadAudio:    $('#downloadAudio'),
    downloadTranscript:$('#downloadTranscript'),
    newSession:       $('#newSession'),
    privacyModal:     $('#privacyModal'),
    modalBackdrop:    $('#modalBackdrop'),
    modalContent:     $('#modalContent'),
    modalClose:       $('#modalClose'),
    privacyConfirm:   $('#privacyConfirm'),
    studentDropzone:  $('#studentDropzone'),
    studentFileInput: $('#studentFileInput'),
    studentFileTag:   $('#studentFileTag'),
    studentFileName:  $('#studentFileName'),
    removeStudentFile:$('#removeStudentFile'),
    presentationDropzone:  $('#presentationDropzone'),
    presentationFileInput: $('#presentationFileInput'),
    presentationFileTag:   $('#presentationFileTag'),
    presentationFileName:  $('#presentationFileName'),
    removePresentationFile:$('#removePresentationFile'),
    customInstructions:$('#customInstructions'),
    toast:            $('#toast'),
    toastMessage:     $('#toastMessage'),
  };

  /* ─────────── State ─────────── */
  const state = {
    currentStep:   1,
    uploadedFile:  null,
    recordedBlob:  null,
    isRecording:   false,
    mediaRecorder: null,
    audioChunks:   [],
    audioStream:   null,
    analyser:      null,
    audioCtx:      null,
    animFrame:     null,
    recStartTime:  0,
    timerInterval: null,
    studentFile:   null,
    presentationFile: null,
    inputSource:   null,   // 'upload' | 'record'
    taskId:        null,
    transcript:    '',
    summaryText:   '',
    pdfReady:      false,
    taskError:     null,
  };

  /* ═══════════════ THEME ═══════════════ */
  function initTheme() {
    const saved = localStorage.getItem('uteach-theme');
    if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
    }
    dom.themeToggle.addEventListener('click', () => {
      document.documentElement.classList.toggle('dark');
      localStorage.setItem('uteach-theme',
        document.documentElement.classList.contains('dark') ? 'dark' : 'light'
      );
    });
  }

  /* ═══════════════ STATUS BADGE (removed from UI) ═══════════════ */
  function setStatus() { /* badge removed — no-op */ }

  /* ═══════════════ STEPPER ═══════════════ */
  function updateStepper(step) {
    state.currentStep = step;
    const pct = step === 1 ? 0 : step === 2 ? 50 : 100;
    const maxWidth = 66.67;
    dom.stepperFill.style.width = (pct / 100 * maxWidth) + '%';

    dom.stepDots.forEach((dot, i) => {
      const s = i + 1;
      dot.className = 'step-dot w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-all duration-300 ';
      if (s < step) {
        dot.className += 'border-brand-500 bg-brand-500 text-white';
        dot.innerHTML = '<i data-lucide="check" class="w-4 h-4"></i>';
        if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [dot] });
      } else if (s === step) {
        dot.className += 'border-brand-500 bg-brand-500 text-white';
        dot.textContent = s;
      } else {
        dot.className += 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-400 dark:text-zinc-500';
        dot.textContent = s;
      }
    });

    dom.stepLabels.forEach((label, i) => {
      const s = i + 1;
      label.className = 'text-xs font-medium transition-colors duration-200 ';
      if (s <= step) label.className += 'text-brand-600 dark:text-brand-400';
      else label.className += 'text-zinc-400 dark:text-zinc-500';
    });
  }

  /* ═══════════════ TAB SWITCHING ═══════════════ */
  function initTabs() {
    dom.tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.tab;
        const wasActive = dom.tabs.find(t => t.classList.contains('active'));
        if (wasActive && wasActive.dataset.tab === target) return;

        dom.tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        const show = target === 'upload' ? dom.uploadPanel : dom.recordPanel;
        const hide = target === 'upload' ? dom.recordPanel : dom.uploadPanel;

        hide.classList.add('hidden');
        show.classList.remove('hidden');
        show.classList.add('tab-panel-enter');
        show.addEventListener('animationend', () => {
          show.classList.remove('tab-panel-enter');
        }, { once: true });
      });
    });
  }

  /* ═══════════════ FILE UPLOAD ═══════════════ */
  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  function fakeDuration() {
    const min = Math.floor(Math.random() * 60) + 5;
    const sec = Math.floor(Math.random() * 60);
    return '~' + min + ':' + sec.toString().padStart(2, '0');
  }

  function handleFile(file) {
    if (!file) return;
    const validTypes = ['audio/', 'video/'];
    const validExt = /\.(mp3|wav|mp4|m4a|ogg|webm|flac|mpeg|mpg|avi|mkv|mov)$/i;
    if (!validTypes.some(t => file.type.startsWith(t)) && !validExt.test(file.name)) {
      showToast('Nepodporovaný formát souboru');
      return;
    }
    if (file.size > 500 * 1024 * 1024) {
      showToast('Soubor je příliš velký (max 500 MB)');
      return;
    }
    state.uploadedFile = file;
    state.recordedBlob = null;
    state.inputSource = 'upload';
    dom.fileName.textContent = file.name;
    dom.fileSize.textContent = formatSize(file.size) + ' \u2022 ' + fakeDuration();
    dom.dropzone.classList.add('hidden');
    dom.filePreview.classList.remove('hidden');
    drawMiniWaveform();
    updateSubmitBtn();
  }

  function clearFile() {
    state.uploadedFile = null;
    state.inputSource = null;
    dom.fileInput.value = '';
    dom.dropzone.classList.remove('hidden');
    dom.filePreview.classList.add('hidden');
    updateSubmitBtn();
  }

  function drawMiniWaveform() {
    const canvas = dom.miniWaveCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);

    const isDark = document.documentElement.classList.contains('dark');
    const color = isDark ? 'rgba(108, 108, 214, 0.4)' : 'rgba(108, 108, 214, 0.25)';
    const barW = 3;
    const gap = 2;
    const total = Math.floor(rect.width / (barW + gap));
    const mid = rect.height / 2;

    ctx.fillStyle = color;
    for (let i = 0; i < total; i++) {
      const h = Math.random() * (rect.height * 0.7) + rect.height * 0.1;
      const x = i * (barW + gap);
      ctx.beginPath();
      ctx.roundRect(x, mid - h / 2, barW, h, 1.5);
      ctx.fill();
    }
  }

  function initUpload() {
    dom.browseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dom.fileInput.click();
    });
    dom.dropzone.addEventListener('click', () => dom.fileInput.click());
    dom.fileInput.addEventListener('change', (e) => handleFile(e.target.files[0]));
    dom.removeFile.addEventListener('click', clearFile);

    ['dragenter', 'dragover'].forEach(evt => {
      dom.dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        dom.dropzone.classList.add('dropzone-active');
      });
    });
    ['dragleave', 'drop'].forEach(evt => {
      dom.dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        dom.dropzone.classList.remove('dropzone-active');
      });
    });
    dom.dropzone.addEventListener('drop', (e) => {
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    });
  }

  /* ═══════════════ MICROPHONE ═══════════════ */
  async function loadMicrophones() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      const devices = await navigator.mediaDevices.enumerateDevices();
      const mics = devices.filter(d => d.kind === 'audioinput');
      dom.micSelect.innerHTML = '';
      if (mics.length === 0) {
        dom.micSelect.innerHTML = '<option>Žádný mikrofon</option>';
        return;
      }
      mics.forEach((mic, i) => {
        const opt = document.createElement('option');
        opt.value = mic.deviceId;
        opt.textContent = mic.label || ('Mikrofon ' + (i + 1));
        dom.micSelect.appendChild(opt);
      });
    } catch (err) {
      dom.micSelect.innerHTML = '<option>Přístup odepřen</option>';
    }
  }

  /* ═══════════════ RECORDING ═══════════════ */
  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m.toString().padStart(2, '0') + ':' + s.toString().padStart(2, '0');
  }

  async function startRecording() {
    try {
      const deviceId = dom.micSelect.value;
      const constraints = { audio: deviceId ? { deviceId: { exact: deviceId } } : true };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      state.audioStream = stream;

      const audioCtx = new AudioContext();
      state.audioCtx = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      state.analyser = analyser;

      const recorder = new MediaRecorder(stream);
      state.mediaRecorder = recorder;
      state.audioChunks = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) state.audioChunks.push(e.data);
      };
      recorder.onstop = () => {
        state.recordedBlob = new Blob(state.audioChunks, { type: 'audio/webm' });
        state.audioChunks = [];
        finishRecording();
      };

      recorder.start();
      state.isRecording = true;
      state.currentVolume = 0;
      state.recStartTime = Date.now();

      // Visual recording state
      dom.recordIcon.classList.add('hidden');
      dom.stopIcon.classList.remove('hidden');
      dom.recordBtn.classList.add('recording');
      dom.recorderHint.textContent = 'Nahrávání\u2026 klikněte pro zastavení';
      dom.recorderTime.classList.remove('text-zinc-300', 'dark:text-zinc-600');
      dom.recorderTime.classList.add('text-red-500');
      setStatus('Nahrávání\u2026', 'recording');

      // Glow the waveform container
      const waveWrap = dom.waveCanvas.parentElement;
      waveWrap.classList.add('recording-glow');

      // Show level indicator
      if (dom.levelIndicator) {
        dom.levelIndicator.classList.remove('hidden');
        dom.levelIndicator.textContent = 'Ticho';
      }

      state.timerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - state.recStartTime) / 1000);
        dom.recorderTime.textContent = formatTime(elapsed);
      }, 1000);

      // Volume‑reactive glow loop
      startVolumeGlow();
      drawWaveform();
    } catch (err) {
      showToast('Nelze získat přístup k mikrofonu');
    }
  }

  function stopRecording() {
    if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
      state.mediaRecorder.stop();
    }
    if (state.audioStream) {
      state.audioStream.getTracks().forEach(t => t.stop());
    }
    if (state.audioCtx) {
      state.audioCtx.close();
      state.audioCtx = null;
    }
    state.isRecording = false;
    clearInterval(state.timerInterval);
    cancelAnimationFrame(state.animFrame);
    cancelAnimationFrame(state.glowFrame);

    // Freeze the waveform history as a static grayscale snapshot
    freezeWaveform();

    dom.recordIcon.classList.remove('hidden');
    dom.stopIcon.classList.add('hidden');
    dom.recordBtn.classList.remove('recording');
    dom.recordBtn.style.boxShadow = '';
    dom.recorderTime.classList.add('text-zinc-300', 'dark:text-zinc-600');
    dom.recorderTime.classList.remove('text-red-500');

    // Remove waveform container glow
    const waveWrap = dom.waveCanvas.parentElement;
    waveWrap.classList.remove('recording-glow');

    // Hide level indicator
    if (dom.levelIndicator) dom.levelIndicator.classList.add('hidden');

    setStatus('Připraveno', 'ready');
  }

  function finishRecording() {
    const elapsed = Math.floor((Date.now() - state.recStartTime) / 1000);
    dom.recordingDuration.textContent = formatTime(elapsed);
    dom.recordingPreview.classList.remove('hidden');
    dom.recorderHint.textContent = 'Nahrávka připravena';
    state.uploadedFile = null;
    state.inputSource = 'record';
    updateSubmitBtn();
  }

  function discardRecording() {
    state.recordedBlob = null;
    state.inputSource = null;
    dom.recordingPreview.classList.add('hidden');
    dom.recorderTime.textContent = '00:00';
    dom.recorderHint.textContent = 'Klikněte pro zahájení nahrávání';
    clearWaveCanvas();
    updateSubmitBtn();
    drawIdleWave(); // bring back the idle animation
  }

  function initRecording() {
    dom.recordBtn.addEventListener('click', () => {
      if (state.isRecording) stopRecording();
      else startRecording();
    });
    dom.discardRecording.addEventListener('click', discardRecording);
  }

  /* ═══════════════ WAVEFORM (CANVAS) ═══════════════ */
  // Scrolling history buffer — each entry is a smoothed RMS amplitude (0‒1)
  const waveHistory = [];
  let smoothedRMS = 0;

  function drawWaveform() {
    const canvas = dom.waveCanvas;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const analyser = state.analyser;
    if (!analyser) return;

    const barW = 3;
    const gap = 2;
    const maxBars = Math.floor(rect.width / (barW + gap));
    const mid = rect.height / 2;
    const timeDomain = new Uint8Array(analyser.fftSize);

    waveHistory.length = 0;
    smoothedRMS = 0;

    function draw() {
      if (!state.isRecording) return;
      state.animFrame = requestAnimationFrame(draw);

      analyser.getByteTimeDomainData(timeDomain);

      // Compute RMS from time‑domain data
      let sumSq = 0;
      for (let i = 0; i < timeDomain.length; i++) {
        const v = (timeDomain[i] - 128) / 128;
        sumSq += v * v;
      }
      const rms = Math.sqrt(sumSq / timeDomain.length);
      // Exponential smoothing — fast attack, slow release
      smoothedRMS = rms > smoothedRMS
        ? smoothedRMS + (rms - smoothedRMS) * 0.35
        : smoothedRMS + (rms - smoothedRMS) * 0.12;

      // Push to scrolling history
      waveHistory.push(smoothedRMS);
      if (waveHistory.length > maxBars) waveHistory.shift();

      // Expose current volume for record‑button glow
      state.currentVolume = smoothedRMS;

      // Draw
      const isDark = document.documentElement.classList.contains('dark');
      ctx.clearRect(0, 0, rect.width, rect.height);

      const barCount = waveHistory.length;
      const startX = (maxBars - barCount) * (barW + gap);

      for (let i = 0; i < barCount; i++) {
        const amp = waveHistory[i];
        const h = Math.max(2, amp * rect.height * 1.6 + 2);
        const x = startX + i * (barW + gap);
        const age = 1 - (barCount - 1 - i) / maxBars; // 0..1, newest = 1

        // Red gradient bar — opacity fades with age
        const alpha = isDark
          ? 0.2 + amp * 0.55 * (0.3 + age * 0.7)
          : 0.15 + amp * 0.5 * (0.3 + age * 0.7);
        ctx.fillStyle = `rgba(239, 68, 68, ${Math.min(alpha, 0.85)})`;
        ctx.beginPath();
        ctx.roundRect(x, mid - h / 2, barW, h, 1.5);
        ctx.fill();

        // Mirror reflection (half height, lower opacity)
        const mirrorH = h * 0.35;
        const mirrorAlpha = alpha * 0.25;
        ctx.fillStyle = `rgba(239, 68, 68, ${Math.min(mirrorAlpha, 0.2)})`;
        ctx.beginPath();
        ctx.roundRect(x, mid + h / 2 + 1, barW, mirrorH, 1.5);
        ctx.fill();
      }

      // Playhead glow on the newest bar
      if (barCount > 0) {
        const lastX = startX + (barCount - 1) * (barW + gap);
        const lastH = Math.max(2, waveHistory[barCount - 1] * rect.height * 1.6 + 2);
        ctx.save();
        ctx.shadowColor = 'rgba(239, 68, 68, 0.5)';
        ctx.shadowBlur = 6;
        ctx.fillStyle = 'rgba(239, 68, 68, 0.9)';
        ctx.beginPath();
        ctx.roundRect(lastX, mid - lastH / 2, barW, lastH, 1.5);
        ctx.fill();
        ctx.restore();
      }

      // Update level indicator
      updateLevelIndicator(smoothedRMS);
    }
    draw();
  }

  function clearWaveCanvas() {
    const canvas = dom.waveCanvas;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    waveHistory.length = 0;
    smoothedRMS = 0;
  }

  /**
   * After recording stops, freeze the last waveform snapshot on canvas.
   * Called from stopRecording() so the user sees what they captured.
   */
  function freezeWaveform() {
    const canvas = dom.waveCanvas;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const barW = 3;
    const gap = 2;
    const maxBars = Math.floor(rect.width / (barW + gap));
    const mid = rect.height / 2;
    const isDark = document.documentElement.classList.contains('dark');

    const barCount = waveHistory.length;
    const startX = (maxBars - barCount) * (barW + gap);

    for (let i = 0; i < barCount; i++) {
      const amp = waveHistory[i];
      const h = Math.max(2, amp * rect.height * 1.6 + 2);
      const x = startX + i * (barW + gap);

      const alpha = isDark ? 0.15 + amp * 0.3 : 0.12 + amp * 0.25;
      ctx.fillStyle = isDark
        ? `rgba(113, 113, 122, ${alpha})`
        : `rgba(161, 161, 170, ${alpha})`;
      ctx.beginPath();
      ctx.roundRect(x, mid - h / 2, barW, h, 1.5);
      ctx.fill();
    }
  }

  /* ── Level Indicator ── */
  function updateLevelIndicator(rms) {
    const el = dom.levelIndicator;
    if (!el) return;
    const db = rms > 0 ? 20 * Math.log10(rms) : -60;
    if (db < -40) {
      el.textContent = 'Ticho';
      el.className = 'level-indicator text-[11px] font-medium transition-colors duration-200 text-zinc-300 dark:text-zinc-600';
    } else if (db < -20) {
      el.textContent = 'Dobrá úroveň';
      el.className = 'level-indicator text-[11px] font-medium transition-colors duration-200 text-emerald-500';
    } else {
      el.textContent = 'Příliš hlasité';
      el.className = 'level-indicator text-[11px] font-medium transition-colors duration-200 text-amber-500';
    }
  }

  /* ── Volume‑Reactive Button Glow ── */
  function startVolumeGlow() {
    function tick() {
      if (!state.isRecording) return;
      state.glowFrame = requestAnimationFrame(tick);
      const v = state.currentVolume || 0;
      // Map volume (0‑1) to glow intensity
      const spread = 10 + v * 25;
      const alpha = 0.15 + v * 0.45;
      dom.recordBtn.style.boxShadow =
        `0 0 ${spread}px rgba(239, 68, 68, ${alpha})`;
    }
    state.glowFrame = requestAnimationFrame(tick);
  }

  /* ═══════════════ SUBMIT BUTTON ═══════════════ */
  function updateSubmitBtn() {
    const hasInput = !!(state.uploadedFile || state.recordedBlob);
    dom.submitBtn.disabled = !hasInput;
    dom.submitBtn.classList.toggle('pointer-events-none', !hasInput);
  }

  function initSubmit() {
    dom.submitBtn.addEventListener('click', () => {
      if (dom.submitBtn.disabled) return;
      openModal();
    });
  }

  /* ═══════════════ PRIVACY MODAL ═══════════════ */
  function openModal() {
    dom.privacyModal.classList.remove('hidden');
    dom.privacyModal.classList.remove('modal-leaving');
    dom.privacyModal.classList.add('modal-entering');
  }

  function closeModal() {
    dom.privacyModal.classList.remove('modal-entering');
    dom.privacyModal.classList.add('modal-leaving');
    // Always close after timeout — don't rely solely on animationend
    setTimeout(() => {
      dom.privacyModal.classList.add('hidden');
      dom.privacyModal.classList.remove('modal-leaving');
    }, 300);
  }

  function initModal() {
    dom.modalClose.addEventListener('click', closeModal);
    dom.modalBackdrop.addEventListener('click', closeModal);
    dom.privacyConfirm.addEventListener('click', () => {
      closeModal();
      setTimeout(startProcessing, 350);
    });

    dom.studentDropzone.addEventListener('click', () => dom.studentFileInput.click());
    dom.studentFileInput.addEventListener('change', (e) => {
      const f = e.target.files[0];
      if (f) {
        state.studentFile = f;
        dom.studentFileName.textContent = f.name;
        dom.studentFileTag.classList.remove('hidden');
        dom.studentDropzone.classList.add('hidden');
      }
    });
    dom.removeStudentFile.addEventListener('click', () => {
      state.studentFile = null;
      dom.studentFileInput.value = '';
      dom.studentFileTag.classList.add('hidden');
      dom.studentDropzone.classList.remove('hidden');
    });

    // Presentation upload
    dom.presentationDropzone.addEventListener('click', () => dom.presentationFileInput.click());
    dom.presentationFileInput.addEventListener('change', (e) => {
      const f = e.target.files[0];
      if (f) {
        state.presentationFile = f;
        dom.presentationFileName.textContent = f.name;
        dom.presentationFileTag.classList.remove('hidden');
        dom.presentationDropzone.classList.add('hidden');
      }
    });
    dom.removePresentationFile.addEventListener('click', () => {
      state.presentationFile = null;
      dom.presentationFileInput.value = '';
      dom.presentationFileTag.classList.add('hidden');
      dom.presentationDropzone.classList.remove('hidden');
    });
  }

  /* ═══════════════ SCROLL LOCK ═══════════════ */
  function setScrollLock(locked) {
    document.body.classList.toggle('overflow-hidden', locked);
    document.body.classList.toggle('overflow-auto', !locked);
  }

  /* ═══════════════ STEP TRANSITION HELPER ═══════════════ */
  function transitionStep(from, to, onVisible) {
    from.classList.add('step-leaving');
    const handler = () => {
      from.removeEventListener('animationend', handler);
      clearTimeout(fallback);
      from.classList.add('hidden');
      from.classList.remove('step-leaving');
      to.classList.remove('hidden');
      to.classList.add('step-entering');
      if (onVisible) onVisible();
      to.addEventListener('animationend', function h2() {
        to.removeEventListener('animationend', h2);
        to.classList.remove('step-entering');
      });
    };
    from.addEventListener('animationend', handler);
    // Fallback if animationend never fires
    const fallback = setTimeout(handler, 500);
  }

  /* ── Markdown → HTML helper ── */
  function mdToHtml(text) {
    return text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/^\d+\.\s+/gm, '<li>')
      .replace(/^[-•]\s+/gm, '<li>')
      .replace(/\n/g, '<br>');
  }

  /* ═══════════════ PROCESSING (real API) ═══════════════ */
  function startProcessing() {
    transitionStep(dom.step1, dom.step2, () => {
      updateStepper(2);
      setStatus('Zpracování\u2026', 'processing');

      const stages = dom.procStages;
      activateStage(stages[0]); // "Nahrávání souboru"

      // Build FormData
      const fd = new FormData();
      if (state.inputSource === 'upload' && state.uploadedFile) {
        fd.append('file', state.uploadedFile);
      } else if (state.inputSource === 'record' && state.recordedBlob) {
        fd.append('file', state.recordedBlob, 'recording.webm');
      }
      fd.append('language', 'cs');
      fd.append('subject_code', 'KKY');

      fetch('/transcribe', { method: 'POST', body: fd })
        .then(r => r.json())
        .then(data => {
          if (data.error) throw new Error(data.error);
          completeStage(stages[0]);
          activateStage(stages[1]); // "Transkripce audia"
          pollTask(data.task_id, stages);
        })
        .catch(err => {
          showToast('Chyba: ' + err.message);
          transitionStep(dom.step2, dom.step1, () => updateStepper(1));
        });
    });
  }

  function pollTask(taskId, stages) {
    let stage1Done = false;
    let stage2Done = false;
    const poll = setInterval(() => {
      fetch('/status/' + taskId)
        .then(r => r.json())
        .then(task => {
          if (task.status === 'summarizing' && !stage1Done) {
            stage1Done = true;
            completeStage(stages[1]);
            activateStage(stages[2]); // "Generování souhrnu"
          }
          if (task.status === 'generating_pdf' && !stage2Done) {
            stage1Done = true;
            stage2Done = true;
            completeStage(stages[1]);
            completeStage(stages[2]);
          }
          if (task.status === 'done' || task.status === 'error') {
            clearInterval(poll);
            if (!stage1Done) completeStage(stages[1]);
            if (!stage2Done) completeStage(stages[2]);
            // Store results in state for downloads
            state.taskId = taskId;
            state.transcript = task.result || '';
            state.summaryText = task.summary || '';
            state.pdfReady = task.pdf_ready || false;
            state.taskError = task.error || null;
            setTimeout(showResults, 600);
          }
        })
        .catch(() => {}); // silently retry
    }, 2000);
  }

  function activateStage(el) {
    el.classList.add('proc-active');
    const icon = el.querySelector('.proc-icon');
    icon.classList.add('bg-brand-50', 'dark:bg-brand-500/10', 'text-brand-500');
  }

  function completeStage(el) {
    el.classList.remove('proc-active');
    el.classList.add('proc-done');
    const check = el.querySelector('.proc-check');
    // checkPop animation in CSS handles opacity
    check.style.opacity = '';
    check.classList.remove('opacity-0');
    const icon = el.querySelector('.proc-icon');
    icon.classList.remove('bg-brand-50', 'dark:bg-brand-500/10', 'text-brand-500');
    icon.classList.add('bg-emerald-50', 'dark:bg-emerald-500/10', 'text-emerald-500');
  }

  /* ═══════════════ RESULTS ═══════════════ */
  async function convertToMp3(blob) {
    const arrayBuffer = await blob.arrayBuffer();
    const audioCtx = new OfflineAudioContext(1, 1, 44100);
    const decoded = await audioCtx.decodeAudioData(arrayBuffer);

    // Resample to 44100 mono
    const sampleRate = 44100;
    const offCtx = new OfflineAudioContext(1, Math.ceil(decoded.duration * sampleRate), sampleRate);
    const src = offCtx.createBufferSource();
    src.buffer = decoded;
    src.connect(offCtx.destination);
    src.start();
    const rendered = await offCtx.startRendering();
    const samples = rendered.getChannelData(0);

    // Convert float32 → int16
    const int16 = new Int16Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }

    // Encode with lamejs
    const mp3enc = new lamejs.Mp3Encoder(1, sampleRate, 128);
    const maxChunk = 1152;
    const mp3Chunks = [];
    for (let i = 0; i < int16.length; i += maxChunk) {
      const chunk = int16.subarray(i, i + maxChunk);
      const buf = mp3enc.encodeBuffer(chunk);
      if (buf.length > 0) mp3Chunks.push(buf);
    }
    const tail = mp3enc.flush();
    if (tail.length > 0) mp3Chunks.push(tail);

    return new Blob(mp3Chunks, { type: 'audio/mpeg' });
  }

  function showResults() {
    transitionStep(dom.step2, dom.step3, () => {
      updateStepper(3);
      setStatus('Hotovo', 'done');
      setScrollLock(false);

      // Show real summary or error
      if (state.taskError && !state.summaryText) {
        dom.summaryContent.innerHTML = '<p class="text-red-500">Chyba: ' + state.taskError + '</p>';
      } else if (state.summaryText) {
        dom.summaryContent.innerHTML = '<div class="prose dark:prose-invert text-sm leading-relaxed">' + mdToHtml(state.summaryText) + '</div>';
      } else {
        dom.summaryContent.innerHTML = '<p class="text-zinc-400">Shrnutí nebylo vygenerováno.</p>';
      }

      // Enable "Download audio" only if user recorded
      if (state.inputSource === 'record' && state.recordedBlob) {
        dom.downloadAudio.disabled = false;
        dom.downloadAudio.classList.remove('disabled:opacity-30', 'disabled:cursor-not-allowed', 'disabled:pointer-events-none');
      } else {
        dom.downloadAudio.disabled = true;
      }

      if (typeof lucide !== 'undefined') lucide.createIcons();
    });
  }

  function initResults() {
    dom.regenerateBtn.addEventListener('click', () => {
      const instructions = dom.editInstructions.value.trim();
      if (!instructions) { showToast('Napište, co chcete změnit'); return; }
      showToast('Přegenerováváme souhrn\u2026');
      const text = state.transcript || '';
      fetch('/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: text + '\n\nDodatečné instrukce: ' + instructions }),
      })
        .then(r => r.json())
        .then(data => {
          dom.editInstructions.value = '';
          if (data.summary) {
            state.summaryText = data.summary;
            dom.summaryContent.innerHTML = '<div class="prose dark:prose-invert text-sm leading-relaxed">' + mdToHtml(data.summary) + '</div>';
            showToast('Souhrn aktualizován');
          } else {
            showToast('Chyba: ' + (data.error || 'neznámá'));
          }
        })
        .catch(err => showToast('Chyba: ' + err.message));
    });

    dom.downloadPdf.addEventListener('click', () => {
      if (state.pdfReady && state.taskId) {
        window.open('/pdf/' + state.taskId, '_blank');
      } else {
        showToast('PDF není k dispozici');
      }
    });

    dom.downloadAudio.addEventListener('click', async () => {
      if (dom.downloadAudio.disabled) return;
      if (!state.recordedBlob) { showToast('Žádná nahrávka k dispozici'); return; }
      showToast('Převádím na MP3…');
      try {
        const mp3Blob = await convertToMp3(state.recordedBlob);
        const url = URL.createObjectURL(mp3Blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'uteach-nahravka.mp3';
        a.click();
        URL.revokeObjectURL(url);
      } catch (err) {
        showToast('Chyba při převodu na MP3');
      }
    });

    dom.downloadTranscript.addEventListener('click', () => {
      const text = state.transcript || '';
      if (!text) { showToast('Přepis není k dispozici'); return; }
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'uteach-prepis.txt';
      a.click();
      URL.revokeObjectURL(url);
      showToast('Stahuji přepis\u2026');
    });

    dom.newSession.addEventListener('click', resetApp);
  }

  /* ═══════════════ RESET ═══════════════ */
  function resetApp() {
    state.uploadedFile = null;
    state.recordedBlob = null;
    state.studentFile = null;
    state.presentationFile = null;
    state.inputSource = null;
    state.taskId = null;
    state.transcript = '';
    state.summaryText = '';
    state.pdfReady = false;
    state.taskError = null;
    dom.fileInput.value = '';
    dom.dropzone.classList.remove('hidden');
    dom.filePreview.classList.add('hidden');
    dom.recordingPreview.classList.add('hidden');
    dom.recorderTime.textContent = '00:00';
    dom.recorderHint.textContent = 'Klikněte pro zahájení nahrávání';
    clearWaveCanvas();
    dom.submitBtn.disabled = true;
    dom.submitBtn.classList.add('pointer-events-none');
    dom.btnSpinner.classList.add('hidden');
    if (dom.submitText) dom.submitText.classList.remove('opacity-0');
    dom.summaryContent.innerHTML = '';
    dom.editInstructions.value = '';
    dom.customInstructions.value = '';
    dom.studentFileInput.value = '';
    dom.studentFileTag.classList.add('hidden');
    dom.studentDropzone.classList.remove('hidden');
    dom.presentationFileInput.value = '';
    dom.presentationFileTag.classList.add('hidden');
    dom.presentationDropzone.classList.remove('hidden');
    // Reset download audio button
    dom.downloadAudio.disabled = true;

    // Clear localStorage
    localStorage.removeItem('uteach-customInstructions');
    localStorage.removeItem('uteach-editInstructions');

    dom.procStages.forEach(el => {
      el.classList.remove('proc-active', 'proc-done');
      const check = el.querySelector('.proc-check');
      check.classList.remove('opacity-100');
      check.classList.add('opacity-0');
      const icon = el.querySelector('.proc-icon');
      icon.className = 'proc-icon w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-300';
    });

    dom.tabs.forEach(t => t.classList.remove('active'));
    dom.tabs[0].classList.add('active');
    dom.uploadPanel.classList.remove('hidden');
    dom.recordPanel.classList.add('hidden');

    dom.step3.classList.add('hidden');
    dom.step2.classList.add('hidden');
    dom.step1.classList.remove('hidden');
    updateStepper(1);
    setScrollLock(true);
    setStatus('Připraveno', 'ready');
  }

  /* ═══════════════ TOAST ═══════════════ */
  function showToast(msg) {
    dom.toastMessage.textContent = msg;
    dom.toast.classList.remove('translate-y-4', 'opacity-0', 'pointer-events-none');
    dom.toast.classList.add('translate-y-0', 'opacity-100');
    setTimeout(() => {
      dom.toast.classList.add('translate-y-4', 'opacity-0', 'pointer-events-none');
      dom.toast.classList.remove('translate-y-0', 'opacity-100');
    }, 2500);
  }

  /* ═══════════════ IDLE WAVEFORM ANIMATION ═══════════════ */
  function drawIdleWave() {
    const canvas = dom.waveCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const barW = 3;
    const gap = 2;
    const total = Math.floor(rect.width / (barW + gap));
    const mid = rect.height / 2;

    function animate(ts) {
      if (state.isRecording) return;
      const isDark = document.documentElement.classList.contains('dark');
      const t = ts * 0.001; // seconds
      ctx.clearRect(0, 0, rect.width, rect.height);

      for (let i = 0; i < total; i++) {
        const norm = i / total;
        // Multi-sine blend for natural organic motion
        const wave1 = Math.sin(norm * 4.5 + t * 1.2) * 2.5;
        const wave2 = Math.sin(norm * 7.0 - t * 0.8) * 1.5;
        const wave3 = Math.sin(norm * 2.0 + t * 0.5) * 1.0;
        const h = Math.max(2, 4 + wave1 + wave2 + wave3);
        const x = i * (barW + gap);
        // Subtle opacity variation per bar
        const alpha = isDark ? 0.12 + Math.abs(wave1) * 0.02 : 0.16 + Math.abs(wave1) * 0.03;
        ctx.fillStyle = isDark
          ? `rgba(113, 113, 122, ${alpha})`
          : `rgba(161, 161, 170, ${alpha})`;
        ctx.beginPath();
        ctx.roundRect(x, mid - h / 2, barW, h, 1.5);
        ctx.fill();
      }
      requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate);
  }

  /* ═══════════════ LOCAL STORAGE PERSISTENCE ═══════════════ */
  function initLocalStorage() {
    // Restore saved values
    const savedCustom = localStorage.getItem('uteach-customInstructions');
    if (savedCustom) dom.customInstructions.value = savedCustom;

    const savedEdit = localStorage.getItem('uteach-editInstructions');
    if (savedEdit) dom.editInstructions.value = savedEdit;

    // Save on input
    dom.customInstructions.addEventListener('input', () => {
      localStorage.setItem('uteach-customInstructions', dom.customInstructions.value);
    });
    dom.editInstructions.addEventListener('input', () => {
      localStorage.setItem('uteach-editInstructions', dom.editInstructions.value);
    });
  }

  /* ═══════════════ INIT ═══════════════ */
  function init() {
    initTheme();
    initTabs();
    initUpload();
    initRecording();
    initSubmit();
    initModal();
    initResults();
    initLocalStorage();
    loadMicrophones();
    updateStepper(1);
    drawIdleWave();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
