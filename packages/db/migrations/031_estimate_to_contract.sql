-- 031_estimate_to_contract.sql
-- Links an accepted estimate to the contract it produced. Conversion (create
-- contract + contract_services from estimate_lines) is application logic; this
-- migration only adds the link so an estimate is traceable to its contract and a
-- contract is never created twice from the same estimate. Additive; the resulting
-- contract enters the existing lifecycle (draft → activate → K2 fans out
-- schedule + jobs), so no scheduling/exactly-once guarantee is touched.
alter table estimates add column contract_id uuid references contracts(id);
