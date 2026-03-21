import pathlib

# Write styles.css
css_content = """/* ═══════════════════════════════════════
   UTEACH.AI — Custom Styles & Animations
   Tailwind handles layout; this file adds
   animations, effects, and edge cases.
   ═══════════════════════════════════════ */

/* ── Base ── */
* { -webkit-tap-highlight-color: transparent; }
::selection { background: rgba(99, 102, 241, 0.2); }

/* ── Background Orbs ── */
.orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(100px);
  opacity: 0.4;
  will-change: transform;
  animation: float 20s ease-in-out infinite;
}
.orb-1 {
  width: 600px; height: 600px;
  background: radial-gradient(circle, rgba(99,102,241,0.15), transparent 70%);
  top: -200px; right: -200px;
}
.orb-2 {
  width: 500px; height: 500px;
  background: radial-gradient(circle, rgba(139,92,246,0.12), transparent 70%);
  bottom: -150px; left: -150px;
  animation-delay: -10s;
}
.dark .orb-1 {
  background: radial-gradient(circle, rgba(99,102,241,0.08), transparent 70%);
  opacity: 0.6;
}
.dark .orb-2 {
  background: radial-gradient(circle, rgba(139,92,246,0.06), transparent 70%);
  opacity: 0.5;
}
@keyframes float {
  0%, 100% { transform: translate(0,0) scale(1); }
  33%  { transform: translate(30px,-20px) scale(1.05); }
  66%  { transform: translate(-20px,15px) scale(0.95); }
}

/* ── Tabs ── */
.tab { color: rgb(161,161,170); cursor: pointer; }
.tab.active {
  background: white; color: rgb(24,24,27);
  box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
}
.dark .tab { color: rgb(113,113,122); }
.dark .tab.active {
  background: rgb(39,39,42); color: rgb(244,244,245);
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
}
.tab:not(.active):hover { color: rgb(113,113,122); }
.dark .tab:not(.active):hover { color: rgb(161,161,170); }

/* ── Result Tabs ── */
.result-tab { color: rgb(161,161,170); cursor: pointer; }
.result-tab.active {
  background: white; color: rgb(24,24,27);
  box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
}
.dark .result-tab { color: rgb(113,113,122); }
.dark .result-tab.active {
  background: rgb(39,39,42); color: rgb(244,244,245);
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
}
.result-tab:not(.active):hover { color: rgb(113,113,122); }
.dark .result-tab:not(.active):hover { color: rgb(161,161,170); }

/* ── Dropzone ── */
.dropzone-active {
  border-color: rgb(129,140,248) !important;
  background: rgba(99,102,241,0.03) !important;
  transform: scale(1.01);
}
.dark .dropzone-active {
  border-color: rgba(99,102,241,0.4) !important;
  background: rgba(99,102,241,0.05) !important;
}

/* ── Record Button ── */
.record-btn .pulse-ring {
  position: absolute; inset: -4px;
  border-radius: 9999px;
  border: 2px solid rgba(239,68,68,0.4);
  opacity: 0; pointer-events: none;
}
.record-btn.recording .pulse-ring {
  animation: pulse-expand 2s cubic-bezier(0.4,0,0.2,1) infinite;
}
.record-btn.recording .pulse-ring.pulse-ring-delay {
  animation-delay: 0.6s;
}
@keyframes pulse-expand {
  0%   { transform: scale(1); opacity: 0.6; }
  100% { transform: scale(1.6); opacity: 0; }
}
.record-btn.recording {
  animation: rec-glow 1.5s ease-in-out infinite alternate;
}
@keyframes rec-glow {
  0%   { box-shadow: 0 0 20px rgba(239,68,68,0.3), 0 10px 25px rgba(239,68,68,0.2); }
  100% { box-shadow: 0 0 30px rgba(239,68,68,0.5), 0 10px 40px rgba(239,68,68,0.3); }
}

/* ── Submit Button ── */
.submit-btn:not(:disabled):hover { transform: translateY(-1px) scale(1.02); }
.submit-btn:not(:disabled):active { transform: translateY(0) scale(0.98); }

/* ── Processing Stages ── */
.proc-stage { opacity: 0.4; }
.proc-stage.proc-active {
  opacity: 1;
  background: rgba(99,102,241,0.04);
}
.dark .proc-stage.proc-active { background: rgba(99,102,241,0.06); }
.proc-stage.proc-active .proc-icon {
  animation: proc-pulse 1.5s ease-in-out infinite;
}
@keyframes proc-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.08); }
}
.proc-stage.proc-done { opacity: 1; }

/* ── Animations ── */
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes scaleIn {
  from { opacity: 0; transform: scale(0.8); }
  to   { opacity: 1; transform: scale(1); }
}
.animate-fadeIn  { animation: fadeIn 0.5s cubic-bezier(0.4,0,0.2,1) forwards; }
.animate-scaleIn { animation: scaleIn 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards; }

/* ── Custom Scrollbar ── */
.custom-scrollbar::-webkit-scrollbar { width: 6px; }
.custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 3px; }
.custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.2); }
.dark .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); }
.dark .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.15); }

/* ── Theme Transitions ── */
html.dark { color-scheme: dark; }
header, main, body, .tab, .result-tab, .status-badge {
  transition: background-color 0.3s, border-color 0.3s, color 0.3s, box-shadow 0.3s;
  transition-timing-function: cubic-bezier(0.4,0,0.2,1);
}

/* ── Focus ── */
:focus-visible {
  outline: 2px solid rgb(99,102,241);
  outline-offset: 2px;
  border-radius: 8px;
}
"""

# Write index.html
html_content = """<!DOCTYPE html>
<html lang="cs" class="scroll-smooth">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>UTEACH.AI</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = {
            darkMode: 'class',
            theme: {
                extend: {
                    fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
                    colors: {
                        brand: {
                            50: '#eef2ff', 100: '#e0e7ff', 200: '#c7d2fe',
                            300: '#a5b4fc', 400: '#818cf8', 500: '#6366f1',
                            600: '#4f46e5', 700: '#4338ca', 800: '#3730a3',
                            900: '#312e81', 950: '#1e1b4b',
                        },
                    },
                },
            },
        };
    </script>
    <link rel="stylesheet" href="styles.css">
</head>
<body class="bg-zinc-50 dark:bg-[#0a0a0f] text-zinc-900 dark:text-zinc-100 font-sans antialiased min-h-screen transition-colors duration-500">

    <!-- Background orbs -->
    <div class="fixed inset-0 overflow-hidden pointer-events-none select-none" aria-hidden="true">
        <div class="orb orb-1"></div>
        <div class="orb orb-2"></div>
    </div>

    <!-- ====== TOP BAR ====== -->
    <header class="sticky top-0 z-50 backdrop-blur-xl bg-zinc-50/80 dark:bg-[#0a0a0f]/80 border-b border-zinc-200/50 dark:border-zinc-800/40">
        <div class="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
            <a href="#" class="flex items-center gap-2.5 group">
                <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center shadow-md shadow-brand-500/25 group-hover:shadow-brand-500/40 transition-shadow duration-300">
                    <svg class="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
                    </svg>
                </div>
                <span class="text-lg font-bold tracking-tight">UTEACH<span class="text-brand-500">.</span>AI</span>
            </a>
            <div class="flex items-center gap-3">
                <div id="statusBadge" class="status-badge flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400 transition-all duration-300">
                    <span class="relative flex h-1.5 w-1.5"><span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-60"></span><span class="relative inline-flex rounded-full h-1.5 w-1.5 bg-current"></span></span>
                    <span id="statusText">P\\u0159ipraveno</span>
                </div>
                <button id="themeToggle" class="relative w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 flex items-center justify-center transition-all duration-300 hover:scale-105 active:scale-95" aria-label="P\\u0159epnout motiv">
                    <svg class="w-[18px] h-[18px] absolute transition-all duration-500 opacity-100 rotate-0 scale-100 dark:opacity-0 dark:rotate-90 dark:scale-0" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clip-rule="evenodd"/>
                    </svg>
                    <svg class="w-4 h-4 absolute transition-all duration-500 opacity-0 -rotate-90 scale-0 dark:opacity-100 dark:rotate-0 dark:scale-100" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"/>
                    </svg>
                </button>
            </div>
        </div>
    </header>

    <!-- ====== MAIN ====== -->
    <main class="relative z-10 max-w-3xl mx-auto px-6 pt-10 pb-24">

        <!-- Step Progress -->
        <nav class="mb-12" aria-label="Progress">
            <div class="flex items-center justify-between relative">
                <div class="absolute top-5 left-[16.67%] right-[16.67%] h-[2px] bg-zinc-200 dark:bg-zinc-800 rounded-full"></div>
                <div id="stepperFill" class="absolute top-5 left-[16.67%] h-[2px] bg-gradient-to-r from-brand-500 to-brand-400 rounded-full transition-all duration-700 ease-out" style="width:0%"></div>
                <div class="flex flex-col items-center gap-2.5 flex-1 relative z-10">
                    <div id="stepDot1" class="step-dot w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold border-2 border-brand-500 bg-brand-500 text-white shadow-md shadow-brand-500/25 transition-all duration-500">1</div>
                    <span id="stepLabel1" class="text-xs font-medium text-brand-600 dark:text-brand-400 transition-colors duration-300">Nahr\\u00e1n\\u00ed</span>
                </div>
                <div class="flex flex-col items-center gap-2.5 flex-1 relative z-10">
                    <div id="stepDot2" class="step-dot w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold border-2 border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-400 dark:text-zinc-500 transition-all duration-500">2</div>
                    <span id="stepLabel2" class="text-xs font-medium text-zinc-400 dark:text-zinc-500 transition-colors duration-300">Zpracov\\u00e1n\\u00ed</span>
                </div>
                <div class="flex flex-col items-center gap-2.5 flex-1 relative z-10">
                    <div id="stepDot3" class="step-dot w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold border-2 border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-400 dark:text-zinc-500 transition-all duration-500">3</div>
                    <span id="stepLabel3" class="text-xs font-medium text-zinc-400 dark:text-zinc-500 transition-colors duration-300">V\\u00fdsledek</span>
                </div>
            </div>
        </nav>

        <!-- == STEP 1: INPUT == -->
        <section id="step1" class="step-section">
            <div class="flex gap-1 p-1 bg-zinc-100 dark:bg-zinc-800/80 rounded-xl mb-8 max-w-xs mx-auto">
                <button class="tab active flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all duration-200" data-tab="upload">Nahr\\u00e1t soubor</button>
                <button class="tab flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all duration-200" data-tab="record">Z\\u00e1znam</button>
            </div>

            <!-- Upload Panel -->
            <div id="uploadPanel" class="tab-panel">
                <div id="dropzone" class="group relative cursor-pointer rounded-2xl bg-white dark:bg-zinc-900/60 border border-zinc-200/60 dark:border-zinc-800/60 p-14 text-center transition-all duration-300 hover:shadow-xl hover:shadow-brand-500/[0.04] dark:hover:shadow-brand-400/[0.03] hover:border-brand-200 dark:hover:border-brand-500/20 hover:scale-[1.008]">
                    <input type="file" id="fileInput" class="sr-only" accept="audio/*,video/*,.mp3,.wav,.mp4,.m4a,.ogg,.webm,.flac">
                    <div class="flex flex-col items-center gap-5">
                        <div class="w-16 h-16 rounded-2xl bg-brand-50 dark:bg-brand-500/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                            <svg class="w-7 h-7 text-brand-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                        </div>
                        <div>
                            <p class="text-base font-semibold mb-1.5">P\\u0159et\\u00e1hn\\u011bte soubor sem</p>
                            <p class="text-sm text-zinc-400 dark:text-zinc-500">nebo <button id="browseBtn" type="button" class="text-brand-500 hover:text-brand-600 dark:hover:text-brand-400 font-medium underline underline-offset-2 decoration-brand-500/30 hover:decoration-brand-500/60 transition-colors">vyberte ze za\\u0159\\u00edzen\\u00ed</button></p>
                        </div>
                        <p class="text-xs text-zinc-300 dark:text-zinc-600 tracking-wide">MP3 \\u00b7 WAV \\u00b7 MP4 \\u00b7 M4A \\u00b7 OGG \\u00b7 FLAC \\u2014 max 500 MB</p>
                    </div>
                </div>
                <div id="filePreview" class="hidden mt-6 p-5 rounded-2xl bg-white dark:bg-zinc-900/60 border border-zinc-200/60 dark:border-zinc-800/60 animate-fadeIn">
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-12 rounded-xl bg-brand-50 dark:bg-brand-500/10 flex items-center justify-center flex-shrink-0">
                            <svg class="w-5 h-5 text-brand-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                        </div>
                        <div class="flex-1 min-w-0">
                            <p id="fileName" class="text-sm font-semibold truncate"></p>
                            <p id="fileSize" class="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5"></p>
                        </div>
                        <button id="removeFile" type="button" class="w-8 h-8 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 flex items-center justify-center text-zinc-400 hover:text-red-500 transition-colors duration-200">
                            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                    </div>
                    <div class="mt-4 h-12 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 overflow-hidden">
                        <canvas id="miniWaveCanvas" class="w-full h-full"></canvas>
                    </div>
                </div>
            </div>

            <!-- Record Panel -->
            <div id="recordPanel" class="tab-panel hidden">
                <div class="mb-8 max-w-sm mx-auto">
                    <label for="micSelect" class="block text-xs font-medium text-zinc-400 dark:text-zinc-500 mb-2 text-center uppercase tracking-wider">Mikrofon</label>
                    <div class="relative">
                        <select id="micSelect" class="w-full appearance-none bg-white dark:bg-zinc-900/60 border border-zinc-200/60 dark:border-zinc-800/60 rounded-xl py-2.5 px-4 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 transition-all duration-200 cursor-pointer">
                            <option>Na\\u010d\\u00edt\\u00e1n\\u00ed\\u2026</option>
                        </select>
                        <svg class="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
                    </div>
                </div>
                <div class="flex flex-col items-center gap-6">
                    <button id="recordBtn" type="button" class="record-btn relative w-24 h-24 rounded-full bg-gradient-to-br from-red-500 to-rose-600 text-white flex items-center justify-center shadow-lg shadow-red-500/25 hover:shadow-xl hover:shadow-red-500/35 hover:scale-110 active:scale-95 transition-all duration-300">
                        <svg id="recordIcon" class="w-8 h-8 transition-all duration-200" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="6"/></svg>
                        <svg id="stopIcon" class="w-7 h-7 hidden transition-all duration-200" viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="7" width="10" height="10" rx="1.5"/></svg>
                        <div class="pulse-ring"></div>
                        <div class="pulse-ring pulse-ring-delay"></div>
                    </button>
                    <div id="recorderTime" class="text-4xl font-extralight tabular-nums tracking-[0.15em] text-zinc-300 dark:text-zinc-600 transition-colors duration-300">00:00</div>
                    <p id="recorderHint" class="text-sm text-zinc-400 dark:text-zinc-500">Klikn\\u011bte pro zah\\u00e1jen\\u00ed nahr\\u00e1v\\u00e1n\\u00ed</p>
                    <div class="w-full max-w-md h-20 rounded-2xl bg-zinc-50 dark:bg-zinc-800/30 overflow-hidden">
                        <canvas id="waveCanvas" class="w-full h-full"></canvas>
                    </div>
                </div>
                <div id="recordingPreview" class="hidden mt-8 p-5 rounded-2xl bg-white dark:bg-zinc-900/60 border border-zinc-200/60 dark:border-zinc-800/60 animate-fadeIn">
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                            <svg class="w-5 h-5 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                        </div>
                        <div class="flex-1 min-w-0">
                            <p class="text-sm font-semibold">Nahr\\u00e1vka</p>
                            <p id="recordingDuration" class="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">00:00</p>
                        </div>
                        <button id="discardRecording" type="button" class="w-8 h-8 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 flex items-center justify-center text-zinc-400 hover:text-red-500 transition-colors duration-200">
                            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                    </div>
                </div>
            </div>

            <!-- Submit -->
            <div class="mt-10 flex justify-center">
                <button id="submitBtn" type="button" disabled class="submit-btn relative px-8 py-3.5 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-brand-500 to-brand-600 shadow-lg shadow-brand-500/25 disabled:opacity-35 disabled:cursor-not-allowed disabled:shadow-none transition-all duration-300 overflow-hidden">
                    <span id="submitText">Zpracovat p\\u0159edn\\u00e1\\u0161ku</span>
                    <div id="btnSpinner" class="hidden absolute inset-0 flex items-center justify-center bg-gradient-to-r from-brand-600 to-brand-700 rounded-xl">
                        <svg class="animate-spin w-5 h-5 text-white" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" class="opacity-25"/><path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" fill="currentColor" class="opacity-75"/></svg>
                    </div>
                </button>
            </div>
        </section>

        <!-- == STEP 2: PROCESSING == -->
        <section id="step2" class="step-section hidden">
            <div class="flex flex-col items-center text-center py-8 animate-fadeIn">
                <div class="relative w-32 h-32 mb-10">
                    <div class="absolute inset-0 rounded-full border-2 border-brand-100 dark:border-brand-900/40"></div>
                    <div class="absolute inset-0 rounded-full border-[2.5px] border-brand-500 border-t-transparent animate-spin" style="animation-duration:1.2s"></div>
                    <div class="absolute inset-3 rounded-full border-2 border-brand-200 dark:border-brand-800/40 border-b-transparent animate-spin" style="animation-duration:2s;animation-direction:reverse"></div>
                    <div class="absolute inset-0 flex items-center justify-center">
                        <svg class="w-8 h-8 text-brand-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                    </div>
                </div>
                <h2 class="text-xl font-semibold mb-2">Zpracov\\u00e1v\\u00e1me p\\u0159edn\\u00e1\\u0161ku</h2>
                <p class="text-sm text-zinc-400 dark:text-zinc-500 mb-10">Obvykle to trv\\u00e1 1\\u20133 minuty</p>
                <div class="w-full max-w-sm space-y-3">
                    <div id="proc1" class="proc-stage flex items-center gap-3 p-3.5 rounded-xl transition-all duration-500">
                        <div class="proc-icon w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-500">
                            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                        </div>
                        <span class="text-sm font-medium flex-1 text-left">Nahr\\u00e1v\\u00e1n\\u00ed souboru</span>
                        <div class="proc-check opacity-0 transition-opacity duration-500"><svg class="w-4 h-4 text-emerald-500" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg></div>
                    </div>
                    <div id="proc2" class="proc-stage flex items-center gap-3 p-3.5 rounded-xl transition-all duration-500">
                        <div class="proc-icon w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-500">
                            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                        </div>
                        <span class="text-sm font-medium flex-1 text-left">Transkripce audia</span>
                        <div class="proc-check opacity-0 transition-opacity duration-500"><svg class="w-4 h-4 text-emerald-500" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg></div>
                    </div>
                    <div id="proc3" class="proc-stage flex items-center gap-3 p-3.5 rounded-xl transition-all duration-500">
                        <div class="proc-icon w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-500">
                            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                        </div>
                        <span class="text-sm font-medium flex-1 text-left">Generov\\u00e1n\\u00ed souhrnu</span>
                        <div class="proc-check opacity-0 transition-opacity duration-500"><svg class="w-4 h-4 text-emerald-500" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg></div>
                    </div>
                </div>
            </div>
        </section>

        <!-- == STEP 3: RESULTS == -->
        <section id="step3" class="step-section hidden">
            <div class="animate-fadeIn">
                <div class="text-center mb-8">
                    <div class="w-16 h-16 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center mx-auto mb-4 animate-scaleIn">
                        <svg class="w-7 h-7 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                    </div>
                    <h2 class="text-xl font-semibold mb-1">P\\u0159edn\\u00e1\\u0161ka zpracov\\u00e1na</h2>
                    <p class="text-sm text-zinc-400 dark:text-zinc-500">V\\u00fdsledky jsou p\\u0159ipraveny</p>
                </div>
                <div class="flex gap-1 p-1 bg-zinc-100 dark:bg-zinc-800/80 rounded-xl mb-6 max-w-xs mx-auto">
                    <button class="result-tab active flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all duration-200" data-result="transcript">P\\u0159epis</button>
                    <button class="result-tab flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all duration-200" data-result="summary">Souhrn</button>
                </div>
                <div id="resultTranscript" class="result-panel p-6 rounded-2xl bg-white dark:bg-zinc-900/60 border border-zinc-200/60 dark:border-zinc-800/60 min-h-[240px] max-h-[400px] overflow-y-auto custom-scrollbar">
                    <p class="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300 whitespace-pre-wrap" id="transcriptContent"></p>
                </div>
                <div id="resultSummary" class="result-panel hidden p-6 rounded-2xl bg-white dark:bg-zinc-900/60 border border-zinc-200/60 dark:border-zinc-800/60 min-h-[240px] max-h-[400px] overflow-y-auto custom-scrollbar">
                    <div class="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300" id="summaryContent"></div>
                </div>
                <div class="flex items-center justify-center gap-3 mt-6">
                    <button id="copyResult" type="button" class="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 active:scale-[0.97] transition-all duration-200">
                        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                        Kop\\u00edrovat
                    </button>
                    <button id="newSession" type="button" class="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium bg-brand-500 text-white hover:bg-brand-600 shadow-md shadow-brand-500/20 active:scale-[0.97] transition-all duration-200">
                        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        Nov\\u00e1 p\\u0159edn\\u00e1\\u0161ka
                    </button>
                </div>
            </div>
        </section>
    </main>

    <!-- ====== PRIVACY MODAL ====== -->
    <div id="privacyModal" class="fixed inset-0 z-[100] hidden">
        <div id="modalBackdrop" class="absolute inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm opacity-0 transition-opacity duration-300"></div>
        <div class="absolute inset-0 flex items-center justify-center p-6">
            <div id="modalContent" class="relative w-full max-w-lg bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl dark:shadow-black/40 border border-zinc-200/60 dark:border-zinc-800/60 scale-95 opacity-0 transition-all duration-300">
                <button id="modalClose" type="button" class="absolute top-4 right-4 w-8 h-8 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">
                    <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
                <div class="p-8">
                    <h3 class="text-lg font-semibold mb-1">Nastaven\\u00ed zpracov\\u00e1n\\u00ed</h3>
                    <p class="text-sm text-zinc-400 dark:text-zinc-500 mb-8">Voliteln\\u00e9 nastaven\\u00ed pro lep\\u0161\\u00ed v\\u00fdsledky</p>
                    <div class="mb-6">
                        <label class="block text-sm font-medium mb-2.5">Seznam student\\u016f</label>
                        <div id="studentDropzone" class="cursor-pointer rounded-xl border border-dashed border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-800/30 p-6 text-center hover:border-brand-400/50 dark:hover:border-brand-500/30 transition-all duration-200">
                            <input type="file" id="studentFileInput" class="sr-only" accept=".csv,.pdf,.xlsx">
                            <p class="text-sm text-zinc-400 dark:text-zinc-500"><span class="text-brand-500 font-medium">Nahr\\u00e1t</span> CSV, PDF nebo XLSX</p>
                        </div>
                        <div id="studentFileTag" class="hidden mt-2.5 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-brand-50 dark:bg-brand-500/10 text-sm">
                            <span id="studentFileName" class="text-brand-600 dark:text-brand-400 font-medium truncate max-w-[200px]"></span>
                            <button id="removeStudentFile" type="button" class="text-brand-400 hover:text-red-500 transition-colors"><svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
                        </div>
                    </div>
                    <div class="mb-8">
                        <label for="customInstructions" class="block text-sm font-medium mb-2.5">Vlastn\\u00ed instrukce</label>
                        <textarea id="customInstructions" rows="3" class="w-full rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-800/50 px-4 py-3 text-sm placeholder:text-zinc-300 dark:placeholder:text-zinc-600 resize-none focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 transition-all duration-200" placeholder="Nap\\u0159. zam\\u011b\\u0159te se na kl\\u00ed\\u010dov\\u00e9 pojmy\\u2026"></textarea>
                    </div>
                    <div class="flex gap-3">
                        <button id="privacySkip" type="button" class="flex-1 py-3 rounded-xl text-sm font-medium bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 active:scale-[0.98] transition-all duration-200">P\\u0159esko\\u010dit</button>
                        <button id="privacyConfirm" type="button" class="flex-1 py-3 rounded-xl text-sm font-medium bg-brand-500 text-white hover:bg-brand-600 shadow-md shadow-brand-500/20 active:scale-[0.98] transition-all duration-200">Pokra\\u010dovat</button>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Toast -->
    <div id="toast" class="fixed bottom-8 left-1/2 -translate-x-1/2 z-[200] px-5 py-3 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium shadow-2xl translate-y-4 opacity-0 pointer-events-none transition-all duration-300">
        <span id="toastMessage"></span>
    </div>

    <script src="main.js"></script>
</body>
</html>"""

base = pathlib.Path('/Users/teddysk52/Desktop/UTEACH.AI/frontend')

import re
def decode_unicode(s):
    return re.sub(r'\\u([0-9a-fA-F]{4})', lambda m: chr(int(m.group(1), 16)), s)

html_decoded = decode_unicode(html_content)
base.joinpath('index.html').write_text(html_decoded, encoding='utf-8')
print(f'index.html: {len(html_decoded.splitlines())} lines')

base.joinpath('styles.css').write_text(css_content.strip(), encoding='utf-8')
print(f'styles.css: {len(css_content.strip().splitlines())} lines')
