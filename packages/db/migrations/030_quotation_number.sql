-- 030_quotation_number.sql
-- Quotation layer over the Estimation Engine (029). A quoted estimate's frozen
-- snapshot IS the quotation source; this adds a stable customer-facing quotation
-- number assigned when the estimate is quoted. The customer-facing quotation
-- document renders REVENUE ONLY (retail mode) — internal cost/margin is never
-- shown there. Additive; no invariant touched.
alter table estimates add column quotation_number text;
