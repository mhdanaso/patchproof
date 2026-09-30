/* ProofPatch frontend: plain browser JavaScript calling the FastAPI workflow. */
const API_BASE = (window.PROOFPATCH_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
const state = {
  incident: null,
  evidence: [],
  analysis: null,
  approvals: [],
  verifications: [],
  report: null,
  busy: false,
  error: '',
  manualCheckFormOpen: false,
};

const incidentArea = document.querySelector('#incident');
const toast = document.querySelector('#toast');
let toastTimer;
let revealedIncidentId = null;
const revealObserver = !window.matchMedia('(prefers-reduced-motion: reduce)').matches && 'IntersectionObserver' in window
  ? new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -24px 0px' })
  : null;

function attachScrollEffects(root = document) {
  if (!revealObserver) return;
  root.querySelectorAll('.surface:not(.hidden), .stepper, .incident-toolbar, .flow-cards article').forEach((element) => {
    if (element.dataset.revealReady) return;
    element.dataset.revealReady = 'true';
    element.classList.add('reveal-on-scroll');
    revealObserver.observe(element);
  });
}

document.querySelector('#new-incident').addEventListener('click', startDemo);
document.querySelector('#banner-start').addEventListener('click', startDemo);
document.querySelector('#toggle-report-form').addEventListener('click', () => {
  const panel = document.querySelector('#report-problem-panel');
  panel.classList.remove('hidden');
  document.querySelector('#problem-title').focus();
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
});
document.querySelector('#cancel-report-form').addEventListener('click', () => {
  document.querySelector('#report-problem-panel').classList.add('hidden');
});
document.querySelector('#report-problem-form').addEventListener('submit', submitProblem);
document.querySelector('#refresh-button').addEventListener('click', restoreLatestIncident);
document.querySelectorAll('.site-nav .nav-link').forEach((link) => {
  link.addEventListener('click', (event) => {
    const section = document.querySelector(link.getAttribute('href'));
    if (!section || section.classList.contains('hidden')) {
      event.preventDefault();
      showToast('Start or report an incident to open this section.');
      return;
    }
    document.querySelectorAll('.site-nav .nav-link').forEach((item) => item.classList.remove('active'));
    link.classList.add('active');
  });
});
incidentArea.addEventListener('click', handleIncidentAction);
incidentArea.addEventListener('submit', handleIncidentSubmit);

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }
  if (!response.ok) {
    const detail = data && typeof data === 'object' ? data.detail : data;
    throw new Error(detail || `Request failed (${response.status})`);
  }
  return data;
}

function jsonBody(value) { return { method: 'POST', body: JSON.stringify(value) }; }

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3600);
}

function setBusy(busy) {
  state.busy = busy;
  renderIncident();
}

async function perform(action, successMessage) {
  if (state.busy) return;
  state.error = '';
  setBusy(true);
  try {
    await action();
    if (successMessage) showToast(successMessage);
  } catch (error) {
    state.error = error.message || 'Something went wrong while contacting the API.';
    showToast(state.error);
  } finally {
    state.busy = false;
    renderIncident();
  }
}

async function startDemo() {
  if (state.busy) return;
  state.error = '';
  state.manualCheckFormOpen = false;
  setBusy(true);
  document.querySelector('#welcome-banner').classList.add('hidden');
  incidentArea.classList.remove('hidden');
  try {
    state.incident = await api('/api/incidents', jsonBody({
      title: 'Checkout errors are increasing',
      service: 'demo-checkout',
      severity: 'high',
      description: 'Checkout health checks began returning HTTP 500 after a payment timeout configuration change.',
      symptoms: ['HTTP 500 responses', 'Checkout health check failing'],
      source: 'seeded-demo',
    }));
    state.evidence = await api(`/api/incidents/${state.incident.id}/evidence/collect-demo`, { method: 'POST' });
    state.analysis = await api(`/api/incidents/${state.incident.id}/analyze`, { method: 'POST' });
    state.approvals = [];
    state.verifications = [];
    state.report = null;
    showToast('Demo incident created and analyzed. Review the evidence below.');
  } catch (error) {
    state.error = error.message || 'Could not start the demo incident.';
    showToast(state.error);
  } finally {
    state.busy = false;
    renderIncident();
    incidentArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

async function submitProblem(event) {
  event.preventDefault();
  if (state.busy) return;

  const form = event.currentTarget;
  const values = new FormData(form);
  const title = String(values.get('title') || '').trim();
  const service = String(values.get('service') || '').trim();
  const description = String(values.get('description') || '').trim();
  const symptoms = String(values.get('symptoms') || '')
    .split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 30);

  if (!title || !service || !description) {
    form.reportValidity();
    return;
  }

  state.incident = null;
  state.evidence = [];
  state.analysis = null;
  state.approvals = [];
  state.verifications = [];
  state.report = null;
  state.error = '';
  state.manualCheckFormOpen = false;
  setBusy(true);
  try {
    state.incident = await api('/api/incidents', jsonBody({
      title,
      service,
      severity: values.get('severity'),
      description,
      symptoms,
      source: 'user-reported',
    }));

    await api(`/api/incidents/${state.incident.id}/evidence`, jsonBody({
      source: 'user report',
      observation: description,
      details: { kind: 'description' },
    }));
    for (const symptom of symptoms) {
      await api(`/api/incidents/${state.incident.id}/evidence`, jsonBody({
        source: 'reported symptom',
        observation: symptom,
        details: { kind: 'symptom' },
      }));
    }

    state.evidence = await api(`/api/incidents/${state.incident.id}/evidence`);
    state.analysis = await api(`/api/incidents/${state.incident.id}/analyze`, { method: 'POST' });
    state.report = await api(`/api/incidents/${state.incident.id}/report`);
    state.approvals = state.report.approvals || [];
    state.verifications = state.report.verifications || [];
    form.reset();
    document.querySelector('#report-problem-panel').classList.add('hidden');
    document.querySelector('#welcome-banner').classList.add('hidden');
    incidentArea.classList.remove('hidden');
    showToast('Problem saved and analyzed. Review the suggested solution below.');
  } catch (error) {
    state.error = error.message || 'Could not save and analyze this problem.';
    showToast(state.error);
  } finally {
    state.busy = false;
    renderIncident();
    if (state.incident) incidentArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

async function restoreLatestIncident() {
  if (state.busy) return;
  await perform(async () => {
    const incidents = await api('/api/incidents');
    if (!incidents.length) {
      state.incident = null;
      state.evidence = [];
      state.analysis = null;
      state.approvals = [];
      state.verifications = [];
      state.report = null;
      document.querySelector('#welcome-banner').classList.remove('hidden');
      incidentArea.classList.add('hidden');
      showToast('No incidents found yet. Start the demo walkthrough.');
      return;
    }
    state.incident = incidents[0];
    state.report = await api(`/api/incidents/${state.incident.id}/report`);
    state.evidence = state.report.evidence || [];
    state.analysis = state.report.analysis;
    state.approvals = state.report.approvals || [];
    state.verifications = state.report.verifications || [];
    document.querySelector('#welcome-banner').classList.add('hidden');
    incidentArea.classList.remove('hidden');
  }, 'Latest incident refreshed.');
}

function handleIncidentAction(event) {
  const button = event.target.closest('[data-action]');
  if (!button || state.busy) return;
  if (button.dataset.action === 'analyze') {
    perform(async () => {
      state.evidence = await api(`/api/incidents/${state.incident.id}/evidence`);
      state.analysis = await api(`/api/incidents/${state.incident.id}/analyze`, { method: 'POST' });
      state.report = null;
    }, 'Evidence analyzed.');
  } else if (button.dataset.action === 'collect') {
    perform(async () => {
      state.evidence = await api(`/api/incidents/${state.incident.id}/evidence/collect-demo`, { method: 'POST' });
      state.analysis = await api(`/api/incidents/${state.incident.id}/analyze`, { method: 'POST' });
      state.report = null;
    }, 'Demo evidence refreshed and analyzed.');
  } else if (button.dataset.action === 'report') {
    perform(async () => {
      state.report = await api(`/api/incidents/${state.incident.id}/report`);
    }, 'Incident report updated.');
  } else if (button.dataset.action === 'new-service-check') {
    state.manualCheckFormOpen = true;
    renderIncident();
    incidentArea.querySelector('#service-check-name')?.focus();
  } else if (button.dataset.action === 'verify') {
    const form = incidentArea.querySelector('#verify-form');
    const values = new FormData(form);
    const setting = values.get('application_setting_name');
    const configured = values.get('configured_setting_name');
    const timeout = Number(values.get('timeout_value'));
    perform(async () => {
      const verification = await api(`/api/incidents/${state.incident.id}/verify`, jsonBody({
        application_setting_name: setting,
        configured_setting_names: [configured],
        timeout_value: timeout,
      }));
      state.verifications = [...state.verifications, verification];
      state.report = await api(`/api/incidents/${state.incident.id}/report`);
    }, 'Sandbox verification recorded.');
  }
}

function handleIncidentSubmit(event) {
  const form = event.target;
  if (form.id === 'service-check-form') {
    event.preventDefault();
    if (state.busy) return;
    const values = new FormData(form);
    const checkName = String(values.get('check_name') || '').trim();
    const outcome = String(values.get('outcome') || '');
    const note = String(values.get('note') || '').trim();
    if (!checkName || !['passed', 'failed'].includes(outcome)) {
      form.reportValidity();
      return;
    }
    perform(async () => {
      const record = await api(`/api/incidents/${state.incident.id}/service-check`, jsonBody({
        check_name: checkName,
        outcome,
        note,
      }));
      state.verifications = [...state.verifications, record];
      state.manualCheckFormOpen = false;
      state.report = await api(`/api/incidents/${state.incident.id}/report`);
    }, 'Service check recorded.');
    return;
  }
  if (form.id !== 'approval-form') return;
  event.preventDefault();
  if (state.busy) return;
  const values = new FormData(form);
  const decision = event.submitter?.value || values.get('decision');
  const approver = String(values.get('approver') || '').trim();
  const note = String(values.get('note') || '').trim();
  if (!approver) {
    form.querySelector('[name="approver"]').focus();
    showToast('Enter the name of the person reviewing this fix.');
    return;
  }
  perform(async () => {
    const record = await api(`/api/incidents/${state.incident.id}/approvals`, jsonBody({ decision, approver, note }));
    state.approvals = [...state.approvals, record];
    state.report = await api(`/api/incidents/${state.incident.id}/report`);
  }, decision === 'approved' ? 'Approval recorded. You can now verify the proposal.' : 'Rejection recorded. Verification remains locked.');
}

function currentStage() {
  if (!state.evidence.length) return 0;
  if (!state.analysis) return 1;
  const decision = state.approvals.at(-1)?.decision;
  if (decision === 'rejected') return 2;
  if (decision !== 'approved') return 2;
  if (state.incident.source !== 'seeded-demo') return state.verifications.length ? 4 : 3;
  return state.verifications.length ? 4 : 3;
}

function statusLabel() {
  if (!state.evidence.length) return ['Evidence needed', 'is-warn'];
  if (!state.analysis) return ['Ready to analyze', 'is-warn'];
  const decision = state.approvals.at(-1)?.decision;
  if (decision === 'rejected') return ['Rejected by reviewer', 'is-bad'];
  if (!decision) return ['Awaiting human review', 'is-warn'];
  const verification = state.verifications.at(-1);
  if (state.incident.source !== 'seeded-demo') {
    if (!verification) return ['Approved · Check pending', 'is-warn'];
    return verification.status === 'passed'
      ? ['Check recorded · Passed', 'is-good']
      : ['Check recorded · Failed', 'is-bad'];
  }
  if (!verification) return ['Approved · Ready to verify', 'is-good'];
  return verification.status === 'passed' ? ['Verified · Passed', 'is-good'] : ['Verification failed', 'is-bad'];
}

function stepperMarkup() {
  const active = currentStage();
  const labels = ['Evidence', 'Analysis', 'Human review', state.incident.source === 'seeded-demo' ? 'Verification' : 'Service check'];
  return `<div class="stepper" aria-label="Incident workflow progress">${labels.map((label, index) => {
    const failed = index === 3 && state.verifications.at(-1)?.status === 'failed';
    const done = index < active || (index === 3 && state.verifications.length > 0 && !failed);
    const current = index === active && !done && !failed;
    return `<div class="step ${done ? 'done' : ''} ${current ? 'current' : ''} ${failed ? 'failed' : ''}"><span class="step-bubble">${failed ? '×' : done ? '✓' : index + 1}</span><span>${label}</span></div>`;
  }).join('')}</div>`;
}

function evidenceMarkup() {
  if (!state.evidence.length) return '<div class="empty-inline">No evidence has been collected yet.</div>';
  const symbols = { 'health check': '⌁', 'application log': '≡', 'recent change': '↻' };
  return `<div class="evidence-list">${state.evidence.map((item) => `<article class="evidence-item"><span class="evidence-symbol">${symbols[item.source?.toLowerCase()] || '•'}</span><div><strong>${escapeHtml(item.source)}</strong><p>${escapeHtml(item.observation)}</p></div><span class="evidence-time">${item.collected_at ? formatTime(item.collected_at) : 'Demo source'}</span></article>`).join('')}</div>`;
}

function analysisMarkup() {
  if (!state.analysis) return `<div class="empty-inline">${state.busy ? 'Analyzing the incident…' : 'Collect evidence, then analyze this incident.'}</div><button class="button button-secondary" data-action="analyze" ${state.busy || !state.evidence.length ? 'disabled' : ''}>Analyze evidence</button>`;
  const finding = state.analysis.root_cause || {};
  const ai = state.analysis.ai_analysis;
  const supported = new Set(finding.supporting_evidence_ids || []);
  const evidenceLinks = state.evidence.filter((item) => supported.has(item.id)).map((item) => `<a class="source-link" href="#evidence">${escapeHtml(item.source)}</a>`).join(' · ');
  const recs = (state.analysis.recommendations || []).map((item, index) => `<div class="recommendation"><div class="recommendation-top"><strong>Recommendation ${index + 1}</strong><span class="risk ${escapeHtml(item.risk)}">${escapeHtml(item.risk)} risk</span></div><p>${escapeHtml(item.action)}</p><p style="margin-top:5px">${escapeHtml(item.rationale)}</p></div>`).join('');
  const aiMarkup = ai ? `<div class="ai-enrichment"><div class="ai-enrichment-heading"><span class="ai-badge">✦ ${escapeHtml(ai.provider === 'ai' ? 'AI analysis' : 'Evidence-based guidance')}</span></div><h4>${escapeHtml(ai.summary)}</h4><p>${escapeHtml(ai.likely_cause)}</p><div class="ai-fix"><strong>Suggested solution</strong><p>${escapeHtml(ai.recommended_fix)}</p></div><div class="ai-meta"><span>${Math.round(Number(ai.confidence || 0) * 100)}% confidence</span></div><details><summary>View verification plan and unknowns</summary><ul>${(ai.verification_plan || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul><p>${escapeHtml((ai.unknowns || []).join(' '))}</p></details></div>` : '';
  return `<div class="analysis-pair ${ai ? '' : 'single'}"><div class="analysis-box"><div class="analysis-top"><span class="confidence">${escapeHtml(finding.confidence || 'unknown')} confidence</span><span class="analysis-state">${finding.status === 'likely' ? 'Evidence supports this finding' : 'More evidence needed'}</span></div><h4>${escapeHtml(finding.summary || 'No root cause returned.')}</h4><ul class="rationale-list">${(finding.rationale || []).map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>${evidenceLinks ? `<div class="section-divider"></div><span class="analysis-state">Supported by: ${evidenceLinks}</span>` : ''}</div>${aiMarkup}</div><div class="recommendation-section"><div class="surface-heading"><div><h3>Suggested actions</h3></div><span class="subtle-count">Human approval required</span></div>${recs || '<div class="empty-inline">No recommendations returned.</div>'}</div>`;
}

function approvalMarkup() {
  const decision = state.approvals.at(-1);
  if (decision) {
    const rejected = decision.decision === 'rejected';
    return `<div class="decision-record"><strong>${rejected ? 'Rejected' : 'Approved'} by ${escapeHtml(decision.approver)}</strong>${escapeHtml(decision.note || 'No note added.')}${rejected ? '<p class="disabled-explanation">Verification is unavailable because this proposal was rejected.</p>' : ''}</div>`;
  }
  return `<form id="approval-form"><div class="approval-form"><div class="field full"><label for="approver">Reviewer name</label><input id="approver" name="approver" placeholder="Who is reviewing this?" maxlength="120" required /></div><div class="field full"><label for="approval-note">Decision note <span style="font-weight:400;color:#9aa39b">(optional)</span></label><textarea id="approval-note" name="note" maxlength="1000" placeholder="Reason for your decision"></textarea></div></div><div class="approval-actions"><button class="button button-approve" name="decision" value="approved" ${state.busy || !state.analysis ? 'disabled' : ''}>Approve proposal</button><button class="button button-reject" name="decision" value="rejected" ${state.busy || !state.analysis ? 'disabled' : ''}>Reject</button></div><p class="approval-note">This records your decision. No changes are applied automatically.</p></form>`;
}

function verificationMarkup() {
  if (state.incident.source !== 'seeded-demo') {
    const decision = state.approvals.at(-1)?.decision;
    const latest = state.verifications.at(-1);
    if (decision !== 'approved') {
      return `<div class="empty-inline">${decision === 'rejected' ? 'The proposal was rejected. A service check cannot be recorded.' : 'Approve the proposal above before recording a service check.'}</div>`;
    }
    const previousResult = latest
      ? `<div class="decision-record manual-check-result"><strong>${latest.status === 'passed' ? '✓ Check recorded as passed' : '× Check recorded as failed'}</strong><span>${escapeHtml(latest.check_name || 'Project check')}</span>${latest.note ? `<p>${escapeHtml(latest.note)}</p>` : ''}<time>${formatTime(latest.checked_at)}</time></div>`
      : '';
    const form = !latest || state.manualCheckFormOpen
      ? `<form id="service-check-form" class="service-check-form"><div class="field"><label for="service-check-name">Check performed</label><input id="service-check-name" name="check_name" maxlength="120" placeholder="e.g. GET /health or checkout test" required /></div><div class="field"><label for="service-check-outcome">Result</label><select id="service-check-outcome" name="outcome" required><option value="" selected disabled>Choose result</option><option value="passed">Passed</option><option value="failed">Failed</option></select></div><div class="field full"><label for="service-check-note">Result note <span style="font-weight:400;color:#9aa39b">(optional)</span></label><textarea id="service-check-note" name="note" maxlength="1000" rows="2" placeholder="What did the check show?"></textarea></div><button class="button button-primary" type="submit" ${state.busy ? 'disabled' : ''}>Record service check</button></form>`
      : `<button class="button button-secondary" type="button" data-action="new-service-check">Record another check</button>`;
    return `<p class="service-check-guidance">Run a project-specific test or health check yourself, then record its result here. ProofPatch does not execute the check.</p>${previousResult}${form}`;
  }
  const latest = state.verifications.at(-1);
  const decision = state.approvals.at(-1)?.decision;
  if (latest) {
    return `<div class="decision-record"><strong>${latest.status === 'passed' ? '✓ Checks passed' : '× Checks failed'}</strong>${escapeHtml(latest.summary)}<div class="verification-checks">${(latest.checks || []).map((check) => `<div class="check-row"><span class="check-icon ${check.passed ? '' : 'fail'}">${check.passed ? '✓' : '×'}</span><div><strong>${escapeHtml(check.name.replaceAll('_', ' '))}</strong><p>${escapeHtml(check.details)}</p></div></div>`).join('')}</div></div><button class="button button-secondary" data-action="verify" style="margin-top:10px" ${state.busy || decision !== 'approved' ? 'disabled' : ''}>Run checks again</button>`;
  }
  if (decision !== 'approved') return `<div class="empty-inline">${decision === 'rejected' ? 'The proposal was rejected. Verification is locked.' : 'Approve the proposal above to unlock sandbox verification.'}</div>`;
  return `<form id="verify-form" class="verify-form"><p class="approval-note" style="margin-top:0">Choose the setting used by the demo service and the setting present in its proposed configuration. A mismatch produces a recorded failure.</p><div class="field"><label for="application-setting">Application reads</label><select id="application-setting" name="application_setting_name"><option>PAYMENT_TIMEOUT_MS</option><option>PAYMENT_TIMEOUT</option></select></div><div class="field"><label for="configured-setting">Proposed config contains</label><select id="configured-setting" name="configured_setting_name"><option>PAYMENT_TIMEOUT_MS</option><option>PAYMENT_TIMEOUT</option></select></div><div class="field"><label for="timeout-value">Timeout value (milliseconds)</label><input id="timeout-value" name="timeout_value" type="number" value="30000" step="1" required /></div><button type="button" class="button button-primary" data-action="verify" ${state.busy ? 'disabled' : ''}>Run deterministic checks</button><p class="approval-note">Checks: supported setting, setting present in config, positive timeout.</p></form>`;
}

function timelineMarkup() {
  const events = state.report?.timeline || [];
  if (!events.length) return '<div class="empty-inline">Load the incident report to see its event timeline.</div>';
  return `<ol class="timeline">${events.map((event) => `<li><span class="timeline-dot"></span><div><strong>${escapeHtml(event.kind.replaceAll('_', ' '))}</strong><p>${escapeHtml(event.summary)}</p><time>${formatTime(event.occurred_at)}</time></div></li>`).join('')}</ol>`;
}

function reportMarkup() {
  if (!state.report) return `<div class="report-preview">The report combines the original alert, evidence, diagnosis, human decision, and verification result into one timeline.</div><button class="button button-secondary" data-action="report" ${state.busy ? 'disabled' : ''}>Generate incident report</button>`;
  return `<div class="report-preview"><strong>${escapeHtml(state.report.timeline?.length || 0)} events</strong> · Generated ${formatTime(state.report.generated_at)}</div><button class="button button-secondary" data-action="report" ${state.busy ? 'disabled' : ''}>Refresh report</button>`;
}

function renderIncident() {
  if (!state.incident) return;
  const [label, tone] = statusLabel();
  incidentArea.classList.remove('hidden');
  document.querySelector('#welcome-banner').classList.add('hidden');
  const incident = state.incident;
  incidentArea.innerHTML = `
    <div class="incident-toolbar"><div class="incident-title-block"><h2>${escapeHtml(incident.title)}</h2><p>${escapeHtml(incident.service)} <span>·</span> Incident ${escapeHtml(String(incident.id).slice(0, 8))} <span>·</span> Created ${formatTime(incident.created_at)}</p></div><div class="incident-actions"><span class="status-pill is-bad">${escapeHtml(incident.severity || 'unknown')} severity</span><span class="status-pill ${tone}">${escapeHtml(label)}</span>${incident.source === 'seeded-demo' ? `<button class="button button-secondary" data-action="collect" ${state.busy ? 'disabled' : ''}>↻ Refresh demo evidence</button>` : ''}</div></div>
    ${stepperMarkup()}
    ${state.error ? `<div class="error-inline"><strong>Could not complete that step.</strong> ${escapeHtml(state.error)} <span>Check that the FastAPI server is running at ${escapeHtml(API_BASE)}.</span></div>` : ''}
    <div class="dashboard-grid"><div class="column-stack">
      <section id="evidence" class="surface evidence-card"><div class="surface-heading"><div><h3>Collected evidence</h3><p>Signals collected for this incident</p></div><span class="subtle-count">${state.evidence.length} sources</span></div>${evidenceMarkup()}</section>
      <section class="surface analysis-card"><div class="surface-heading"><div><h3>Root-cause analysis</h3><p>What the available evidence points to</p></div></div>${analysisMarkup()}</section>
    </div><div class="column-stack">
      <section class="surface approval-card"><div class="surface-heading"><div><h3>Human approval</h3><p>A reviewer decides before verification</p></div><span class="subtle-count">Required</span></div>${approvalMarkup()}</section>
      <section class="surface verification-card"><div class="surface-heading"><div><h3>${state.incident.source === 'seeded-demo' ? 'Sandbox verification' : 'Service check'}</h3><p>${state.incident.source === 'seeded-demo' ? 'Checks the proposed demo configuration; does not execute code' : 'Record a result from your project-specific check'}</p></div>${state.verifications.length ? `<span class="status-pill ${state.verifications.at(-1).status === 'passed' ? 'is-good' : 'is-bad'}">${state.verifications.at(-1).status === 'passed' ? 'Passed' : 'Failed'}</span>` : ''}</div>${verificationMarkup()}</section>
      <section id="report" class="surface report-card"><div class="surface-heading"><div><h3>Incident report</h3><p>Decision and checks in chronological order</p></div></div>${reportMarkup()}<div class="section-divider"></div>${timelineMarkup()}</section>
    </div></div>`;
  if (revealedIncidentId !== incident.id) {
    attachScrollEffects(incidentArea);
    revealedIncidentId = incident.id;
  }
}

function formatTime(value) {
  if (!value) return 'Just now';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Just now';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
}

async function initialize() {
  // The API keeps data in memory, so the newest incident can be restored after a page refresh.
  try {
    const incidents = await api('/api/incidents');
    if (!incidents.length) return;
    state.incident = incidents[0];
    state.report = await api(`/api/incidents/${state.incident.id}/report`);
    state.evidence = state.report.evidence || [];
    state.analysis = state.report.analysis;
    state.approvals = state.report.approvals || [];
    state.verifications = state.report.verifications || [];
    renderIncident();
  } catch {
    // Keep the welcome screen visible until the user starts an incident.
  }
}

attachScrollEffects();
initialize();
