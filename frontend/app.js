const button = document.querySelector('#load-incident');
const card = document.querySelector('#incident-card');

button.addEventListener('click', loadIncident);

async function loadIncident() {
  button.disabled = true;
  button.textContent = 'Loading…';
  try {
    const response = await fetch('http://127.0.0.1:8000/api/demo-incident');
    if (!response.ok) throw new Error('API returned an error');
    const incident = await response.json();
    renderIncident(incident);
  } catch (error) {
    card.innerHTML = '<div class="empty"><h3>Could not reach the API</h3><p>Start the backend using the steps in README.md, then try again.</p></div>';
  } finally {
    button.disabled = false;
    button.textContent = 'Load demo incident';
  }
}

function renderIncident(incident) {
  const evidence = incident.evidence.map(item => `<li><strong>${escapeHtml(item.source)}:</strong> ${escapeHtml(item.observation)}</li>`).join('');
  card.innerHTML = `<div class="incident-head"><div><h3>${escapeHtml(incident.title)}</h3><p>Service: ${escapeHtml(incident.service)}</p></div><span class="badge">${escapeHtml(incident.severity.toUpperCase())} SEVERITY</span></div>
    <div class="grid"><section class="panel"><h4>Collected evidence</h4><ul>${evidence}</ul></section>
    <section class="panel"><h4>Likely root cause</h4><p>${escapeHtml(incident.root_cause)}</p></section>
    <section class="panel"><h4>Suggested fix</h4><p>${escapeHtml(incident.suggested_fix)}</p></section>
    <section class="panel"><h4>Verification</h4><p>${escapeHtml(incident.verification)}</p></section>
    <section class="panel wide"><h4>Approval gate</h4><p class="approval">${escapeHtml(incident.approval)}</p></section></div>`;
}

function escapeHtml(value) {
  const element = document.createElement('span');
  element.textContent = value;
  return element.innerHTML;
}
