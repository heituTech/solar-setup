// Shared AI assistant dock. Every page includes this script; it injects the
// collapsed dock, so the markup lives in exactly one place.
// The conversation stays client-side. The answer flow bundles the question with
// the two member knowledge bases, copies it, and opens a free AI chat page.
(function () {
  if (document.getElementById('aiDock')) return;

  const DOCK_HTML = `
  <div class="ai-dock" id="aiDock">
    <button type="button" class="ai-toggle" id="aiToggle" aria-expanded="false" aria-controls="aiCard">
      <span data-i18n="ai_assistant">AI Assistant</span>
      <svg class="ai-chevron" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 14l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
    </button>
    <div class="card ai-card" id="aiCard">
      <div class="ai-head">
        <div class="ai-kb-links">
          <button type="button" class="ai-kb-chip" id="aiKbApp" data-i18n="ai_kb_app">App usage guide</button>
          <button type="button" class="ai-kb-chip" id="aiKbSolar" data-i18n="ai_kb_solar">Solar config guide</button>
        </div>
        <button type="button" class="ai-clear" id="aiClear" data-i18n="ai_clear">Clear</button>
      </div>
      <div class="ai-messages" id="aiMessages"></div>
      <div class="ai-input-row">
        <input type="text" id="aiInput" data-i18n-placeholder="ai_input_placeholder" placeholder="Ask about the app or solar configuration…">
        <button class="btn btn-primary" id="aiSend" data-i18n="ai_send">Send</button>
      </div>
    </div>
  </div>`;

  document.body.insertAdjacentHTML('beforeend', DOCK_HTML);

  const dock = document.getElementById('aiDock');
  const toggle = document.getElementById('aiToggle');
  const box = document.getElementById('aiMessages');
  const input = document.getElementById('aiInput');

  function token() {
    return localStorage.getItem('member_token') || localStorage.getItem('staff_token') || '';
  }

  let kbPromise = null;
  function loadKnowledge() {
    if (!kbPromise) {
      const opts = { headers: { Authorization: 'Bearer ' + token() } };
      kbPromise = Promise.all([
        fetch('/pv/skill/member/app', opts).then((r) => { if (!r.ok) throw { status: r.status }; return r.text(); }),
        fetch('/pv/skill/member/solar_config', opts).then((r) => { if (!r.ok) throw { status: r.status }; return r.text(); }),
      ]).catch((e) => { kbPromise = null; throw e; });
    }
    return kbPromise;
  }

  function append(role, text) {
    const div = document.createElement('div');
    div.className = 'ai-msg ' + role;
    div.textContent = text;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  }

  function renderWelcome() {
    if (box.children.length) return; // keep an ongoing conversation across language switches
    append('bot', t('ai_welcome'));
  }

  function requireLogin() {
    if (token()) return true;
    append('bot', t('ai_login_required'));
    return false;
  }

  // navigator.clipboard only exists in secure contexts (HTTPS/localhost);
  // fall back to a hidden textarea + execCommand on plain HTTP deployments.
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise((resolve, reject) => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try {
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        ok ? resolve() : reject(new Error('copy_failed'));
      } catch (e) {
        document.body.removeChild(ta);
        reject(e);
      }
    });
  }

  function downloadTextFile(name, content) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type: 'text/markdown;charset=utf-8' }));
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function send() {
    if (!requireLogin()) return;
    const q = input.value.trim();
    if (!q) return;
    input.value = '';
    append('user', q);
    let appMd, solarMd;
    try {
      [appMd, solarMd] = await loadKnowledge();
    } catch (e) {
      append('bot', t('error'));
      return;
    }
    const prompt = 'You are an assistant for the Solar Setup web app. Use the two knowledge bases below to answer the user question. Answer in the same language as the question.\n\n=== Knowledge base 1: App usage guide ===\n' + appMd + '\n\n=== Knowledge base 2: Solar system configuration ===\n' + solarMd + '\n\n=== User question ===\n' + q;
    try {
      await copyText(prompt);
      window.open('https://chat.openai.com/', '_blank');
      append('bot', t('ai_copied'));
    } catch {
      append('bot', t('ai_copy_failed'));
      const pre = document.createElement('pre');
      pre.className = 'ai-prompt';
      pre.textContent = prompt;
      box.appendChild(pre);
      box.scrollTop = box.scrollHeight;
    }
  }

  // The dock starts collapsed; tapping anywhere else collapses it again.
  toggle.addEventListener('click', () => {
    const open = dock.classList.toggle('open');
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  document.addEventListener('click', (e) => {
    if (!dock.classList.contains('open')) return;
    if (dock.contains(e.target)) return;
    dock.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
  });

  document.getElementById('aiClear').addEventListener('click', () => {
    box.innerHTML = '';
    renderWelcome();
  });

  document.getElementById('aiKbApp').addEventListener('click', async () => {
    if (!requireLogin()) return;
    try {
      const [appMd] = await loadKnowledge();
      downloadTextFile('member-app.md', appMd);
    } catch (e) { append('bot', t('error')); }
  });

  document.getElementById('aiKbSolar').addEventListener('click', async () => {
    if (!requireLogin()) return;
    try {
      const [, solarMd] = await loadKnowledge();
      downloadTextFile('solar-config.md', solarMd);
    } catch (e) { append('bot', t('error')); }
  });

  document.getElementById('aiSend').addEventListener('click', send);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') send();
  });

  // Keep the welcome line in sync after the dictionary is reloaded.
  document.addEventListener('lang:change', () => {
    if (box.children.length === 1 && box.firstChild.classList.contains('bot')) {
      box.firstChild.textContent = t('ai_welcome');
    }
  });

  if (window.I18N_READY && typeof window.I18N_READY.then === 'function') {
    window.I18N_READY.then(renderWelcome);
  } else {
    renderWelcome();
  }
})();
