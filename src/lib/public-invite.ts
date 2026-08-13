import { InviteStatus, type Invite, type Mission, type Participant } from '@prisma/client';

export type StaticInviteDto = {
  code: string;
  displayName: string;
  missionTitle: string;
  missionDescription: string;
  invitationCopy: string;
  contactEmail: string;
};

export type MailtoLinks = { accept: string; decline: string };

export function buildStaticInviteDto(invite: Invite & { participant: Participant & { mission: Mission | null } }, contactEmail: string): StaticInviteDto | null {
  if (!invite.published) return null;
  if (invite.status === InviteStatus.REVOKED || invite.status === InviteStatus.EXPIRED) return null;
  return {
    code: invite.code,
    displayName: invite.participant.name,
    missionTitle: invite.participant.mission?.name || 'Certifyd technical beta',
    missionDescription: invite.participant.mission?.shortDescription || 'Run Certifyd Core in a real creator workflow.',
    invitationCopy: invite.participant.mission?.inviteCopy || "We're opening Certifyd Core to a small number of people during our technical beta.",
    contactEmail,
  };
}

export function buildMailtoLinks(invite: StaticInviteDto): MailtoLinks {
  return {
    accept: mailto(invite.contactEmail, `Certifyd Beta — Accept — ${invite.displayName} — ${invite.code}`, `I'd like to accept my invitation to participate in the Certifyd technical beta.\n\nInvite: ${invite.code}\nMission: ${invite.missionTitle}`),
    decline: mailto(invite.contactEmail, `Certifyd Beta — Decline — ${invite.displayName} — ${invite.code}`, `Thanks for the invitation. I'm going to pass on the Certifyd technical beta for now.\n\nInvite: ${invite.code}`),
  };
}

export function renderPublicHome(): string {
  return renderPage('Certifyd Technical Beta', `
    <section class="panel hero">
      <p class="eyebrow">Certifyd Technical Beta</p>
      <h1>Private beta invitations.</h1>
      <p class="muted">Certifyd Core is opening to a small group of invited creators, partners, and builders. Use the private invitation link you received to view your mission.</p>
    </section>
  `);
}

export function renderPublicInvite(invite: StaticInviteDto): string {
  const links = buildMailtoLinks(invite);
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
        <a class="button primary" href="${escapeAttribute(links.accept)}">Accept Invitation</a>
        <a class="button secondary" href="${escapeAttribute(links.decline)}">Decline</a>
      </div>
    </section>
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
  <style>${publicCss()}</style>
</head>
<body>
  <header class="site-header"><a class="brand" href="/">certifyd</a></header>
  <main class="container">${body}</main>
</body>
</html>`;
}

function mailto(to: string, subject: string, body: string): string {
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char] || char));
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}

function publicCss(): string {
  return `:root{color-scheme:dark;--bg:#06131d;--panel:#0d2232;--line:#315064;--text:#f3f8ff;--muted:#bed0df;--orange:#ff9900}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 20% 0,#17475e,var(--bg) 48%);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif}.site-header{border-bottom:1px solid var(--line);background:rgba(5,16,25,.92)}.brand{display:inline-flex;padding:22px clamp(20px,4vw,56px);font-weight:900;font-size:24px;letter-spacing:.02em;color:var(--text);text-decoration:none}.container{width:min(1040px,calc(100vw - 40px));margin:0 auto;padding:clamp(32px,7vw,96px) 0}.panel{background:rgba(10,29,43,.84);border:1px solid var(--line);border-radius:28px;padding:clamp(24px,5vw,58px);box-shadow:0 30px 90px rgba(0,0,0,.28)}.eyebrow{color:var(--orange);font-size:12px;letter-spacing:.24em;text-transform:uppercase;font-weight:900}.hero h1{font-size:clamp(44px,8vw,92px);line-height:.93;letter-spacing:-.065em;margin:10px 0 24px}.lead{font-size:clamp(19px,2.3vw,27px);line-height:1.45;max-width:800px}.muted{color:var(--muted)}.mission-card{margin:32px 0;padding:24px;border:1px solid var(--line);border-radius:20px;background:rgba(4,17,27,.54)}.mission-card h2{font-size:clamp(28px,4vw,44px);line-height:1;margin:8px 0 12px}.actions{display:flex;gap:14px;flex-wrap:wrap}.button{display:inline-flex;align-items:center;justify-content:center;min-height:54px;padding:15px 22px;border-radius:999px;font-weight:900;text-decoration:none}.button.primary{background:linear-gradient(135deg,#ffd56a,var(--orange));color:#050505}.button.secondary{border:1px solid var(--line);color:var(--text);background:#132737}@media(max-width:640px){.container{width:min(100vw - 24px,600px);padding:24px 0}.panel{border-radius:22px}.actions{display:grid}.button{width:100%}}`;
}
