// Branding rules (defect run item 1): the REAL division logo image carries the
// brand — served from the deployed console's /brand assets. No text-drawn
// wordmark, no "<division> · UAE" filler, and NO legal-entity line in emails
// (the legal line lives once, in official PDF footers only).
export interface DivisionSkin { name: string; accent: string; logoFile: string }

const ASSET_BASE = process.env.EMAIL_ASSET_BASE ?? "https://mumtaz-mop-ops-console.vercel.app/brand";

export const SKINS: Record<string, DivisionSkin> = {
  pest_control: { name: "Mumtaz Pest Control", accent: "#A31E22", logoFile: "mumtaz-pest-control.png" },
  cleaning: { name: "Mumtaz Cleaning Crew", accent: "#235B3C", logoFile: "mumtaz-cleaning-crew.png" },
  facilities_management: { name: "Mumtaz Facilities Management", accent: "#12294A", logoFile: "mumtaz-facilities-management.png" },
};
const DEFAULT_SKIN: DivisionSkin = { name: "Mumtaz Integrated Services Group", accent: "#A31E22", logoFile: "mumtaz-isg.png" };

const GOLD = "#BF9F60";
const INK = "#1C1C1C";
const MUTED = "#6B6B6B";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export interface EmailCardRow { label: string; value: string }
export interface EmailContent {
  serviceLineCode?: string | null;
  title: string;
  paragraphs: string[];
  card?: { heading?: string; rows: EmailCardRow[] };
  footnote?: string | null;
}

export function renderEmailHtml(c: EmailContent): string {
  const skin = (c.serviceLineCode && SKINS[c.serviceLineCode]) || DEFAULT_SKIN;
  const rows = (c.card?.rows ?? [])
    .map(
      (r) => `<tr>
        <td style="padding:6px 14px 6px 0;font-size:12px;color:${MUTED};text-transform:uppercase;letter-spacing:.06em;white-space:nowrap;vertical-align:top;">${esc(r.label)}</td>
        <td style="padding:6px 0;font-size:14px;color:${INK};font-weight:600;">${esc(r.value)}</td>
      </tr>`,
    )
    .join("");
  const card = c.card
    ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%"
         style="margin:18px 0;border:1px solid #E7E2DB;border-left:4px solid ${skin.accent};border-radius:8px;background:#FBFAF8;">
        <tr><td style="padding:16px 20px;">
          ${c.card.heading ? `<div style="font-size:11px;font-weight:700;color:${skin.accent};letter-spacing:.12em;text-transform:uppercase;padding-bottom:8px;">${esc(c.card.heading)}</div>` : ""}
          <table role="presentation" cellpadding="0" cellspacing="0">${rows}</table>
        </td></tr>
      </table>`
    : "";
  const paragraphs = c.paragraphs
    .map((p) => `<p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:${INK};">${esc(p)}</p>`)
    .join("");

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#F2F0EC;">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#F2F0EC;padding:24px 0;">
<tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;width:100%;background:#FFFFFF;border-radius:10px;overflow:hidden;">
  <!-- header: the real division logo, nothing else -->
  <tr><td style="padding:24px 32px 16px;">
    <img src="${ASSET_BASE}/${skin.logoFile}" alt="${esc(skin.name)}" height="44" style="height:44px;max-width:260px;display:block;">
  </td></tr>
  <tr><td style="height:3px;background:${GOLD};font-size:0;line-height:0;">&nbsp;</td></tr>
  <!-- body -->
  <tr><td style="padding:28px 32px 8px;font-family:Arial,Helvetica,sans-serif;">
    <div style="font-family:Georgia,'Times New Roman',serif;font-size:21px;color:${skin.accent};padding-bottom:14px;">${esc(c.title)}</div>
    ${paragraphs}
    ${card}
    ${c.footnote ? `<p style="margin:6px 0 0;font-size:11px;color:${MUTED};">${esc(c.footnote)}</p>` : ""}
  </td></tr>
  <!-- footer: contact only — no legal-entity line in emails -->
  <tr><td style="padding:20px 32px 24px;font-family:Arial,Helvetica,sans-serif;border-top:1px solid #EEE9E2;">
    <div style="font-size:11px;color:${MUTED};line-height:1.7;">
      Toll free <b style="color:${INK};">800 688</b> &nbsp;·&nbsp; info@almumtaz.ae &nbsp;·&nbsp; www.almumtaz.ae<br>
      Dubai · Sharjah · Abu Dhabi
    </div>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}
