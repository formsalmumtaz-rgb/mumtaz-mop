// Vision P2 — the ONE branded HTML email layout, division-skinned.
// Table-based markup (email clients), no remote assets (the wordmark is text —
// deliverability over decoration), colors inline. Every customer notification
// renders through this shell; the summary card is optional structured content.

export interface DivisionSkin { name: string; accent: string; sub: string }

export const SKINS: Record<string, DivisionSkin> = {
  pest_control: { name: "MUMTAZ PEST CONTROL", accent: "#A31E22", sub: "Pest Control · UAE" },
  cleaning: { name: "MUMTAZ CLEANING CREW", accent: "#235B3C", sub: "Cleaning Crew · UAE" },
  facilities_management: { name: "MUMTAZ FACILITIES MANAGEMENT", accent: "#12294A", sub: "Facilities Management · UAE" },
};
const DEFAULT_SKIN: DivisionSkin = { name: "MUMTAZ INTEGRATED SERVICES GROUP", accent: "#A31E22", sub: "Integrated Services Group · UAE" };

const GOLD = "#BF9F60";
const INK = "#1C1C1C";
const MUTED = "#6B6B6B";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export interface EmailCardRow { label: string; value: string }
export interface EmailContent {
  serviceLineCode?: string | null;
  title: string;                    // e.g. "Your service is complete"
  paragraphs: string[];             // body copy, plain text (escaped)
  card?: { heading?: string; rows: EmailCardRow[] };  // CTA-style summary card
  footnote?: string | null;         // small print above the footer
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
  <!-- header band -->
  <tr><td style="background:${skin.accent};padding:26px 32px 22px;">
    <div style="font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:700;color:#FFFFFF;letter-spacing:.08em;">MUMTAZ</div>
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:700;color:${GOLD};letter-spacing:.28em;padding-top:4px;">${esc(skin.name.replace(/^MUMTAZ\\s*/, "") || "INTEGRATED SERVICES GROUP")}</div>
  </td></tr>
  <tr><td style="height:3px;background:${GOLD};font-size:0;line-height:0;">&nbsp;</td></tr>
  <!-- body -->
  <tr><td style="padding:30px 32px 8px;font-family:Arial,Helvetica,sans-serif;">
    <div style="font-family:Georgia,'Times New Roman',serif;font-size:21px;color:${skin.accent};padding-bottom:14px;">${esc(c.title)}</div>
    ${paragraphs}
    ${card}
    ${c.footnote ? `<p style="margin:6px 0 0;font-size:11px;color:${MUTED};">${esc(c.footnote)}</p>` : ""}
  </td></tr>
  <!-- footer -->
  <tr><td style="padding:22px 32px 26px;font-family:Arial,Helvetica,sans-serif;border-top:1px solid #EEE9E2;">
    <div style="font-family:Georgia,serif;font-size:12px;color:${skin.accent};padding-bottom:4px;">Al Mumtaz Bldg Clean &amp; Pest Control</div>
    <div style="font-size:11px;color:${MUTED};line-height:1.7;">
      Toll free <b style="color:${INK};">800 688</b> &nbsp;·&nbsp; info@almumtaz.ae &nbsp;·&nbsp; www.almumtaz.ae<br>
      Dubai: Office F313, Al Hashmi Tower, Deira &nbsp;·&nbsp; Sharjah: Office 4, Al Estiqlal Street, Al Manakh &nbsp;·&nbsp; Abu Dhabi: Office 504, Cont Building, Musaffah
    </div>
  </td></tr>
</table>
<div style="font-family:Arial,sans-serif;font-size:10px;color:#A8A29A;padding-top:14px;">${esc(skin.sub)}</div>
</td></tr>
</table>
</body></html>`;
}
