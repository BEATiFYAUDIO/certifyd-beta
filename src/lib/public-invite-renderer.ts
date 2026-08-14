import { type StaticInviteDto, type StaticMissionStartDto, buildMailtoLinks } from './public-invite';

export function renderPublicHome(): string {
  return renderPage('Certifyd Technical Beta', `
    <section class="panel hero home-hero">
      <p class="eyebrow">CERTIFYD TECHNICAL BETA</p>
      <h1>Own the infrastructure behind your work.</h1>
      <div class="hero-copy">
        <p>Certifyd Core gives creators and independent operators their own infrastructure for publishing, provenance, permissions, commerce and direct relationships.</p>
        <p>We're working hands-on with a small group of invited participants to test Certifyd in real-world workflows.</p>
        <p><strong>Participation is currently by invitation.</strong></p>
      </div>
      <p class="invite-note">Already invited? Use the private link you received to open your mission.</p>
    </section>
    <section class="beta-steps" aria-label="How the technical beta works">
      <article>
        <span>01</span>
        <h2>Get ready.</h2>
        <p>Choose an AI coding agent or command-line path for operating Certifyd Core.</p>
      </article>
      <article>
        <span>02</span>
        <h2>Run Core.</h2>
        <p>Install, configure and connect Certifyd Core for real creator workflows.</p>
      </article>
      <article>
        <span>03</span>
        <h2>Use it for real work.</h2>
        <p>Publish, test commerce, collaborate and eventually operate your own network.</p>
      </article>
    </section>
  `);
}

export function renderPublicInvite(invite: StaticInviteDto): string {
  const links = buildMailtoLinks(invite);
  const primaryAction = invite.startPath
    ? `<a class="button primary" href="${escapeAttribute(invite.startPath)}">Accept &amp; Start Mission</a>`
    : `<a class="button primary" href="${escapeAttribute(links.help)}">Contact Darryl</a>`;
  return renderPage(`${invite.displayName} — Certifyd Beta`, `
    <section class="panel hero">
      <p class="eyebrow">Private Invitation</p>
      <h1>${escapeHtml(invite.displayName)}, we'd like you to run Certifyd with us.</h1>
      <p class="muted lead">${escapeHtml(invite.invitationCopy)}</p>
      <div class="mission-card">
        <p class="eyebrow">Your Mission</p>
        <h2>${escapeHtml(invite.missionTitle)}</h2>
        <p class="muted">${escapeHtml(invite.missionDescription)}</p>
      </div>
      <div class="actions">
        ${primaryAction}
        <a class="button secondary" href="${escapeAttribute(links.decline)}">Decline</a>
      </div>
    </section>
  `);
}

export function renderMissionStart(start: StaticMissionStartDto): string {
  const links = buildMailtoLinks(start);
  const supportAction = `<a class="button secondary" href="${escapeAttribute(links.help)}">Contact Darryl</a>`;
  const completionHeading = start.missionSlug === 'get-ready-to-run-certifyd-core' ? "You're ready when..." : "You're done when...";
  const choices = start.choices.length ? `
      <div class="choice-grid">
        ${start.choices.map((choice) => `<article class="mission-card choice-card"><h2>${escapeHtml(choice.label)}</h2><p class="muted">${escapeHtml(choice.copy)}</p>${choice.href && choice.actionLabel ? `<a class="button secondary" href="${escapeAttribute(choice.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(choice.actionLabel)}</a>` : ''}</article>`).join('')}
      </div>
  ` : '';
  const sections = start.sections.map((section) => {
    const glowClass = section.heading === "You're operating your own infrastructure." ? ' infrastructure-glow' : '';
    return `<div class="mission-card${glowClass}"><p class="eyebrow">${escapeHtml(section.heading)}</p><p class="lead muted">${escapeHtml(section.body)}</p></div>`;
  }).join('');
  const prompt = start.aiPrompt ? `
      <div class="mission-card">
        <p class="eyebrow">AI coding agent path</p>
        <p class="muted">${escapeHtml(start.publicInstructions)}</p>
        <textarea id="ai-prompt" readonly>${escapeHtml(start.aiPrompt)}</textarea>
        <div class="actions">
          <button class="button primary" type="button" id="copy-prompt">Copy Certifyd Setup Prompt</button>
          ${start.repositoryUrl ? `<a class="button secondary" href="${escapeAttribute(start.repositoryUrl)}" target="_blank" rel="noopener noreferrer">Open Core Repository</a>` : ''}
        </div>
        <p class="copy-status" id="copy-status" role="status" aria-live="polite"></p>
      </div>
      <div class="mission-card">
        <p class="eyebrow">Prefer the command line?</p>
        <p class="lead muted">Open the Certifyd Core repository and follow the installation documentation directly.</p>
        <div class="actions">
          ${start.repositoryUrl ? `<a class="button secondary" href="${escapeAttribute(start.repositoryUrl)}" target="_blank" rel="noopener noreferrer">Open Core Repository</a>` : ''}
          ${supportAction}
        </div>
        <p class="muted support-note">Use Contact Darryl if setup is unclear, your agent cannot continue, or you hit a real blocker.</p>
      </div>
  ` : `
      <div class="mission-card">
        <p class="eyebrow">Agent ready?</p>
        <p class="lead">${escapeHtml(start.continuationIntro || start.publicInstructions)}</p>
        <div class="actions">
          ${start.continuationPath && start.continuationLabel ? `<a class="button primary" href="${escapeAttribute(start.continuationPath)}">${escapeHtml(start.continuationLabel)}</a>` : ''}
          ${supportAction}
        </div>
        <p class="muted support-note">Use Contact Darryl only if something is unclear, your AI agent will not work, or you need white-glove help.</p>
      </div>
  `;
  return renderPage(`${start.displayName} — ${start.startHeading}`, `
    <section class="panel hero mission-start">
      <p class="eyebrow">${escapeHtml(start.missionEyebrow)}</p>
      <h1>${escapeHtml(start.startHeading)}</h1>
      <p class="muted lead">${escapeHtml(start.startIntro)}</p>
      ${sections}
      ${choices}
      ${prompt}
      <div class="mission-card">
        <p class="eyebrow">${escapeHtml(completionHeading)}</p>
        <p class="lead">${escapeHtml(start.successCriteria)}</p>
        ${start.missionSlug === 'get-ready-to-run-certifyd-core' ? '' : `<p class="muted support-note">To keep growing your network and move to the next mission, contact Darryl when this step is complete. Your feedback is very valuable: tell us what worked, what broke, what was confusing, and what would make the beta easier.</p><div class="actions">${supportAction}</div>`}
      </div>
      <p><a class="button secondary" href="/invite/${escapeAttribute(start.code)}/">Return to invite</a></p>
    </section>
    ${start.aiPrompt ? `<script>${copyPromptScript()}</script>` : ''}
  `);
}

function renderPage(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="Private Certifyd technical beta invitation." />
  <link rel="icon" href="/favicon.svg" />
  <style>${publicCss()}</style>
</head>
<body>
  <header class="site-header"><a class="brand" href="/"><img src="/certifyd-logo.svg" alt="Certifyd" /><span>Beta</span></a></header>
  <main class="container">${body}</main>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char] || char));
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}

function copyPromptScript(): string {
  return `(function(){var button=document.getElementById('copy-prompt');var prompt=document.getElementById('ai-prompt');var status=document.getElementById('copy-status');if(!button||!prompt)return;button.addEventListener('click',function(){var text=prompt.value;function done(){button.textContent='Copied';if(status)status.textContent='Copied';setTimeout(function(){button.textContent='Copy Certifyd Setup Prompt';if(status)status.textContent='';},1600)}if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(text).then(done).catch(function(){prompt.focus();prompt.select();document.execCommand('copy');done();});return;}prompt.focus();prompt.select();document.execCommand('copy');done();});})();`;
}

function publicCss(): string {
  return `:root{color-scheme:dark;--bg:#06131d;--panel:#0d2232;--line:#315064;--text:#f3f8ff;--muted:#bed0df;--orange:#ff9900;--blue:#4aa7d1}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at 18% 0,#1b5269 0,#0d2b3b 34%,var(--bg) 76%);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif}.site-header{border-bottom:1px solid var(--line);background:rgba(5,16,25,.92)}.brand{display:inline-flex;align-items:center;gap:12px;padding:18px clamp(20px,4vw,56px);font-weight:900;font-size:18px;letter-spacing:.02em;color:var(--text);text-decoration:none}.brand img{height:38px;width:auto;display:block}.brand span{color:var(--orange);text-transform:uppercase;font-size:12px;letter-spacing:.18em}.container{width:min(1120px,calc(100vw - 40px));margin:0 auto;padding:clamp(28px,5vw,72px) 0}.panel{background:linear-gradient(145deg,rgba(13,34,50,.92),rgba(8,24,36,.86));border:1px solid var(--line);border-radius:28px;padding:clamp(24px,5vw,58px);box-shadow:0 30px 90px rgba(0,0,0,.28)}.eyebrow{color:var(--orange);font-size:12px;letter-spacing:.24em;text-transform:uppercase;font-weight:900}.hero h1{font-size:clamp(46px,7vw,88px);line-height:.95;letter-spacing:-.06em;margin:12px 0 26px;max-width:920px}.home-hero{position:relative;overflow:hidden}.home-hero:after{content:"";position:absolute;inset:auto -12% -42% 48%;height:280px;background:radial-gradient(circle,rgba(74,167,209,.2),transparent 68%);pointer-events:none}.hero-copy{display:grid;gap:14px;max-width:820px;color:var(--muted);font-size:clamp(18px,2vw,24px);line-height:1.45}.hero-copy p{margin:0}.hero-copy strong{color:var(--text)}.invite-note{margin:26px 0 0;color:#d8e7f3;font-size:15px}.lead{font-size:clamp(18px,2vw,24px);line-height:1.45;max-width:920px}.muted{color:var(--muted)}.support-note{margin:16px 0 0;font-size:15px}.beta-steps,.choice-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin-top:18px}.choice-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.beta-steps article{padding:22px;border:1px solid rgba(74,167,209,.35);border-radius:22px;background:rgba(7,22,33,.66)}.beta-steps span{display:block;color:var(--orange);font-size:12px;font-weight:900;letter-spacing:.2em;margin-bottom:18px}.beta-steps h2{font-size:clamp(24px,2.6vw,34px);line-height:1;margin:0 0 12px}.beta-steps p{margin:0;color:var(--muted);font-size:17px;line-height:1.45}.mission-card{margin:22px 0;padding:24px;border:1px solid var(--line);border-radius:20px;background:rgba(4,17,27,.54)}.infrastructure-glow{position:relative;border-color:rgba(255,153,0,.56);background:radial-gradient(circle at 10% 0,rgba(255,153,0,.16),transparent 32%),linear-gradient(145deg,rgba(13,40,54,.78),rgba(4,17,27,.68));box-shadow:0 0 0 1px rgba(255,153,0,.08),0 0 34px rgba(255,153,0,.16),0 22px 70px rgba(74,167,209,.12)}.infrastructure-glow .eyebrow{color:#ffd56a;text-shadow:0 0 16px rgba(255,153,0,.55)}.choice-card{display:flex;flex-direction:column;gap:12px;margin:0}.choice-card .button{align-self:flex-start}.mission-card h2{font-size:clamp(24px,3vw,36px);line-height:1;margin:8px 0 12px}.actions{display:flex;gap:14px;flex-wrap:wrap}textarea{width:100%;min-height:360px;margin:18px 0;padding:18px;border-radius:18px;border:1px solid var(--line);background:#06131d;color:var(--text);font:15px/1.55 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;resize:vertical}.copy-status{min-height:22px;color:#9cf3b8;font-weight:900}.button{display:inline-flex;align-items:center;justify-content:center;min-height:54px;padding:15px 22px;border-radius:999px;font-weight:900;text-decoration:none}.button.primary{background:linear-gradient(135deg,#ffd56a,var(--orange));color:#050505}.button.secondary{border:1px solid var(--line);color:var(--text);background:#132737}@media(max-width:760px){.container{width:min(100vw - 24px,680px);padding:24px 0 36px}.panel{border-radius:22px}.hero h1{font-size:clamp(42px,14vw,64px);letter-spacing:-.055em}.hero-copy,.lead{font-size:18px}.beta-steps,.choice-grid{grid-template-columns:1fr}.actions{display:grid}.button{width:100%}.choice-card .button{align-self:stretch}}`;
}
