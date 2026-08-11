-- 053_document_branding_show_label.sql
-- Per-division control over whether the short label prints on documents. All the
-- Mumtaz logos are wordmarks that already contain the division name, so the label
-- under the mark is redundant for some divisions and useful for others — that is a
-- per-division CHOICE, so it is data (Art. XVIII), not a hardcoded rule.
--
-- Owner decision: suppress on Pest Control (and the group mark) where it merely
-- repeats the wordmark; keep on Cleaning Crew and Facilities Management.

alter table document_branding
  add column if not exists show_label_on_document boolean not null default true;

update document_branding set show_label_on_document = false where brand_key in ('pest_control', 'group');
update document_branding set show_label_on_document = true  where brand_key in ('cleaning', 'fm');
