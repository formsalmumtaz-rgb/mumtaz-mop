# Import validation report — customer master

**Batch** `fc664c82-66a1-40ea-8f89-ecf7f6c3194b`  ·  **status** validated  ·  **staged** 2026-08-19 01:11:18.062072+00
**Source** master workbook: ../../merge/customer-master-import.csv

Nothing below has been written to a live table. This is the dry-run report of
Art. VII §5; the commit is a separate, explicit step that needs the owner's approval.

## 1. Rows

| Disposition | Reason | Rows |
|---|---|---:|
| clean | (none) | 569 |
| held | TRN present but not a valid 15-digit UAE TRN | 8 |
| held | same legal entity (TRN 104774977300003) as a row held for outlet mapping | 4 |
| held | group "Sultan Al Arab" already exists live with 6 customer(s) — confirm whether this is a new outlet or one of them | 1 |
| matched_live | matched a live customer (TRN) | 1 |
| **total** | | **583** |

## 2. Account numbers (DECISIONS §12)

| | |
|---|---:|
| Rows that will receive an account number | 569 |
| …kept from the file's ACCOUNT_NO | 569 |
| …minted because the file gave no valid 5-digit number | 0 |
| Lowest / highest assigned | 11111 / 11827 |

## 2b. Group → customers → branches, as it will stand after the commit

Each outlet is its OWN customer with its OWN account number; the group holds
them together for consolidated statements. Nothing is merged and no contract
or job moves between customers.


**AL ATLAL ROASTRY GROUP** (new group)

| Account no. | Customer | Sites | Contracts | Status |
|---|---|---:|---:|---|
| 11327 | AL ATLAL ROASTRY | 1 | 3 (from file) | will be created as `11327` |

**AL MAWRID PRINTING GROUP** (new group)

| Account no. | Customer | Sites | Contracts | Status |
|---|---|---:|---:|---|
| 11122 | AL MAWRID PRINTING & ADVERTISING IND LLC | 0 | 1 (from file) | will be created as `11122` |
| 11758 | AL MAWRID PRINTING & ADV. IND. LLC. | 0 | 2 (from file) | will be created as `11758` |
| 11765 | AL MAWRID PRINTING & ADVT. IND. LLC.UAQ.BR. | 0 | 2 (from file) | will be created as `11765` |

**AL SAMADI SWEETS GROUP** (new group)

| Account no. | Customer | Sites | Contracts | Status |
|---|---|---:|---:|---|
| 11379 | Al Samadi Sweets | 1 | 0 (from file) | will be created as `11379` |

**AL TANEEN KARATE GROUP** (new group)

| Account no. | Customer | Sites | Contracts | Status |
|---|---|---:|---:|---|
| 11342 | Al Taneen Al Aswad Karate | 1 | 1 (from file) | will be created as `11342` |

**ARYAAS GROUP** (new group)

| Account no. | Customer | Sites | Contracts | Status |
|---|---|---:|---:|---|
| 11295 | Aryaas Gourmet Veg Restaurant L.L.C | 1 | 0 (from file) | will be created as `11295` |
| 11322 | Aryaas Gourmet Veg Restaurant LLC- Shj.Br-Br | 1 | 0 (from file) | will be created as `11322` |
| 11323 | Aryaas Gourmet Veg Restaurant LLC- Shj.Br-Br 1 | 1 | 0 (from file) | will be created as `11323` |
| 11324 | Aryaas Gourmet Veg Restaurant LLC | 1 | 2 (from file) | will be created as `11324` |
| 11325 | Aryaas Gourmet Alqusais Veg Rest LLC | 1 | 0 (from file) | will be created as `11325` |

**AWANEY GROUP** (new group)

| Account no. | Customer | Sites | Contracts | Status |
|---|---|---:|---:|---|
| 11462 | Awaney Restaurant | 1 | 2 (from file) | will be created as `11462` |

**BUN & BURR GROUP** (new group)

| Account no. | Customer | Sites | Contracts | Status |
|---|---|---:|---:|---|
| 11352 | BUN & BURR CAFE | 1 | 1 (from file) | will be created as `11352` |

**CAESAR CONFECTIONARY GROUP** (new group)

| Account no. | Customer | Sites | Contracts | Status |
|---|---|---:|---:|---|
| 11144 | Caesars Restaurant | 1 | 0 (from file) | will be created as `11144` |
| 11145 | Caesars Restaurant & Confectionery | 1 | 1 (from file) | will be created as `11145` |
| 11816 | Caesar Confectionary LLC. BR .SHJ. Warehouse1 | 0 | 2 (from file) | will be created as `11816` |

**GCC EXCHANGE GROUP** (new group)

| Account no. | Customer | Sites | Contracts | Status |
|---|---|---:|---:|---|
| 11194 | GCC EXCHANGE | 1 | 0 (from file) | will be created as `11194` |

**GULF ICE FACTORY GROUP** (new group)

| Account no. | Customer | Sites | Contracts | Status |
|---|---|---:|---:|---|
| 11267 | GULF ICE FACTORY & COLD STORAGE | 1 | 3 (from file) | will be created as `11267` |
| 11726 | GULF ICE FACTORY &COLD STORAGE  PLANT 4- STAFF  ACCOMMODATION | 0 | 3 (from file) | will be created as `11726` |

**GULF PASTRY GROUP** (new group)

| Account no. | Customer | Sites | Contracts | Status |
|---|---|---:|---:|---|
| 11782 | GULF PASTRY SHJ. BR.-BRANCH 1 | 0 | 2 (from file) | will be created as `11782` |
| 11818 | GULF PASTRY SHJ.BR | 0 | 2 (from file) | will be created as `11818` |

**MAZRAT AL FAWAKEH GROUP** (new group)

| Account no. | Customer | Sites | Contracts | Status |
|---|---|---:|---:|---|
| 11422 | Mazrat Al Fawakeh Supermarket | 1 | 0 (from file) | will be created as `11422` |

**MEERA RESTAURANT GROUP** (new group)

| Account no. | Customer | Sites | Contracts | Status |
|---|---|---:|---:|---|
| 11125 | MEERA RESTAURANT | 1 | 0 (from file) | will be created as `11125` |

**MUWAILAH BUILDINGS GROUP** (new group)

| Account no. | Customer | Sites | Contracts | Status |
|---|---|---:|---:|---|
| 11597 | Maitha Mohammed Abdulla Saif Al Shamsi(Muwailah 3649) | 0 | 0 (from file) | will be created as `11597` |
| 11748 | MUWAILAH 3649 BLDG | 0 | 1 (from file) | will be created as `11748` |
| 11749 | MUWAILAH 6654 BLDG | 0 | 1 (from file) | will be created as `11749` |
| 11751 | MUWAILAH 2268 BLDG | 0 | 1 (from file) | will be created as `11751` |
| 11752 | MUWAILAH 1601 BLDG | 0 | 1 (from file) | will be created as `11752` |

**NAEEMA TOWER GROUP** (new group)

| Account no. | Customer | Sites | Contracts | Status |
|---|---|---:|---:|---|
| 11764 | NAEEMA TOWER | 0 | 2 (from file) | will be created as `11764` |

**NASERIYA BUILDINGS GROUP** (new group)

| Account no. | Customer | Sites | Contracts | Status |
|---|---|---:|---:|---|
| 11738 | NASERIYA BUILDING 1 | 0 | 2 (from file) | will be created as `11738` |
| 11739 | NASERIYA BUILDING 2 | 0 | 2 (from file) | will be created as `11739` |

**OCEAN OILFIELD GROUP** (new group)

| Account no. | Customer | Sites | Contracts | Status |
|---|---|---:|---:|---|
| 11152 | Ocean Oilfield Drilling Rigs&marine Engg.Services FZE | 1 | 0 (from file) | will be created as `11152` |
| 11197 | Ocean Oilfield Services (FZE) | 1 | 0 (from file) | will be created as `11197` |
| 11321 | Brilliant International Private School | 1 | 1 (from file) | will be created as `11321` |
| 11387 | Al Mumtaz Bldg Clean & Pest Control | 1 | 0 (from file) | will be created as `11387` |
| 11539 | Ocean Oilfield Driling Rigs & Marine Eng | 1 | 0 (from file) | will be created as `11539` |

**REDTAPE GROUP** (new group)

| Account no. | Customer | Sites | Contracts | Status |
|---|---|---:|---:|---|
| 11426 | REDTAPE | 1 | 0 (from file) | will be created as `11426` |

**SHIFA AL JAZEERA GROUP** (new group)

| Account no. | Customer | Sites | Contracts | Status |
|---|---|---:|---:|---|
| 11115 | Shifa Al Jazeera Medical Centre | 1 | 0 (from file) | will be created as `11115` |
| 11116 | Shifa Al Jazeera Medical Centre LLC | 1 | 0 (from file) | will be created as `11116` |
| 11118 | Shifa Al Jazeera Medical Centre LLC Br 1 | 1 | 0 (from file) | will be created as `11118` |
| 11633 | SHIFA AL JAZEERA MEDICAL CENTRE(MUWAILEH BRANCH) | 1 | 0 (from file) | will be created as `11633` |
| 11677 | SHIFA AL JAZEERA MEDICAL CENTER -BRANCH1 | 0 | 0 (from file) | will be created as `11677` |

**SUBURBAN CUSTOMER** (new group)

| Account no. | Customer | Sites | Contracts | Status |
|---|---|---:|---:|---|
| 11287 | AL HAMAD BUILDING CONTRACTING CO. LLC | 0 | 0 (from file) | will be created as `11287` |

**SULTAN ALARAB GROUP** → reuses live group `Sultan Al Arab`

| Account no. | Customer | Sites | Contracts | Status |
|---|---|---:|---:|---|
| `CUST-0026` | SULTAN ALARAB REST | 0 | 1 | already live, 2 job(s) |
| `CUST-0088` | SULTAN ALARAB REST | 0 | 1 | already live, 1 job(s) |
| `CUST-0089` | SULTAN ALARAB REST | 0 | 1 | already live |
| `CUST-0090` | SULTAN ALARAB REST | 0 | 2 | already live |
| `CUST-0091` | SULTAN ALARAB REST | 0 | 1 | already live |
| `CUST-0092` | SULTAN ALARAB REST | 0 | 1 | already live |
| 11525 | SULTHAN AL ARAB RESTUARANT | 1 | 0 (from file) | **HELD** — same legal entity (TRN 104774977300003) as a row held for outlet mapping |
| 11662 | SULTAN AL ARAB RESTAURANT L.L.C (Al Barsha) | 1 | 0 (from file) | **HELD** — group 'Sultan Al Arab' already exists live with 6 customer(s) |
| 11663 | SULTHAN AL ARAB RESTUARANT(Business Bay) | 1 | 0 (from file) | **HELD** — same legal entity (TRN 104774977300003) as a row held for outlet mapping |
| 11664 | SULTHAN AL ARAB RESTUARANT (Manipal) | 1 | 0 (from file) | **HELD** — same legal entity (TRN 104774977300003) as a row held for outlet mapping |
| 11665 | SULTHAN AL ARAB RESTUARANT(Al Qusais Branch) | 1 | 0 (from file) | **HELD** — same legal entity (TRN 104774977300003) as a row held for outlet mapping |

**THE FOOD DISTRICT** (new group)

| Account no. | Customer | Sites | Contracts | Status |
|---|---|---:|---:|---|
| 11123 | Origami Restaurant LLC | 1 | 1 (from file) | will be created as `11123` |
| 11124 | Moon Slice Restaurant LLC | 1 | 0 (from file) | will be created as `11124` |

**VKM KALARI GROUP** (new group)

| Account no. | Customer | Sites | Contracts | Status |
|---|---|---:|---:|---|
| 11647 | VKM KALARI TRADITIONAL MARTIAL ARTS CLUB  LLC.SHJ .BR | 1 | 2 (from file) | will be created as `11647` |
| 11648 | VKM KALARI TRADITIONAL MARTIAL ARTS CLUB  LLC.SHJ .BR -BRANCH 1 | 0 | 1 (from file) | will be created as `11648` |

**YARMOOK BUILDINGS GROUP** (new group)

| Account no. | Customer | Sites | Contracts | Status |
|---|---|---:|---:|---|
| 11598 | Hamad Ateeq Shames Ahmed Alameri YARMOOK BLDG | 1 | 0 (from file) | will be created as `11598` |
| 11746 | YARMOOK BLDG | 0 | 1 (from file) | will be created as `11746` |
| 11747 | YARMOOK BUILDING | 0 | 1 (from file) | will be created as `11747` |

## 2c. One legal entity, several outlets (shared TRN)

A UAE TRN is issued per legal entity, so these rows are one company trading
from several places. Each keeps its own account number and becomes its own
customer. Turning any of them into branches of a single customer is your
decision — the system does not infer it.

| TRN | Outlets | Group | Members |
|---|---:|---|---|
| 100247587700003 | 8 | — | 11128 NESTO HYPERMARKET SOLE PROPRIETORSHIP LLC-BR 4 · 11129 NEW NESTO CENTER SOLE PROPRIETOSHIP LLC · 11238 AL WAFA CENTRE GEN . TR. LLC SOLE PROPRIETORSHIP · 11436 EAST WEST HYPERMARKET L.L.C · 11445 NESTO HYPER MARKET L.L.C (Branch) · 11451 Nesto Al Warsan Staff Accommodation · 11455 NESTO HYPER MARKET L.L.C (Branch).   8125 · 11457 Nesto Al Khan Staff Accommodation |
| 104774977300003 | 5 | SULTAN ALARAB GROUP | 11525 SULTHAN AL ARAB RESTUARANT · 11662 SULTAN AL ARAB RESTAURANT L.L.C (Al Barsha) · 11663 SULTHAN AL ARAB RESTUARANT(Business Bay) · 11664 SULTHAN AL ARAB RESTUARANT (Manipal) · 11665 SULTHAN AL ARAB RESTUARANT(Al Qusais Branch) **(held)** |
| 100225789500003 | 4 | ARYAAS GROUP | 11295 Aryaas Gourmet Veg Restaurant L.L.C · 11323 Aryaas Gourmet Veg Restaurant LLC- Shj.Br-Br 1 · 11324 Aryaas Gourmet Veg Restaurant LLC · 11325 Aryaas Gourmet Alqusais Veg Rest LLC |
| 100045237300003 | 3 | — | 11169 AL KHIBRAH DOMESTIC WORKERS SERVICES CENTER  LLC · 11367 A S G Management Services LLC · 11468 ASG MANAGEMENT SERVICES LLC |
| 100072077900003 | 3 | OCEAN OILFIELD GROUP | 11197 Ocean Oilfield Services (FZE) · 11321 Brilliant International Private School · 11387 Al Mumtaz Bldg Clean & Pest Control |
| 100226601100003 | 2 | — | 11151 Luqman Pharmacy LLC · 11153 Haji Pharmacy LLC |
| 100229964000003 | 2 | — | 11432 Unimoni Exchange LLC · 11433 Unimoni Exchange LLC (Abu Hail) |
| 100248811000003 | 2 | — | 11158 Saga Spa for Men Per Person Company LLC, Br. 1 · 11159 Saga Spa for Men Per Person Company LLC |
| 100306456300003 | 2 | — | 11253 SHAIKHA SHAIKHA MOHAMED SAQER ALQASSIMI · 11336 Shaikha Hamdan Rashid Binkhadim |
| 100336629900003 | 2 | — | 11179 SEVEN OAKS NURSERY · 11187 SEVEN OAKS OWNER VILLA |
| 100365986700003 | 2 | — | 11466 EWAN HOTEL APARTMENT · 11467 EWAN TOWER AJMAN |
| 100530816600003 | 2 | SHIFA AL JAZEERA GROUP | 11116 Shifa Al Jazeera Medical Centre LLC · 11118 Shifa Al Jazeera Medical Centre LLC Br 1 |
| 104758693600003 | 2 | — | 11132 NASEEM AL BARARI TRADING LLC · 11781 BURJ BABIL FOODSTUFF TR L.L.C |
| 104990510000003 | 2 | SHIFA AL JAZEERA GROUP | 11115 Shifa Al Jazeera Medical Centre · 11633 SHIFA AL JAZEERA MEDICAL CENTRE(MUWAILEH BRANCH) |

## 2d. Outlets awaiting mapping — the one thing the system cannot work out

These rows are outlets of a company that ALREADY has records in the system.
They are held rather than created, because creating them would list the same
restaurant twice while its contracts stayed on the old record.

| Account no. | Outlet, as the file names it | Emirate | Address |
|---|---|---|---|
| 11525 | SULTHAN AL ARAB RESTUARANT | — | Al Majas |
| 11662 | SULTAN AL ARAB RESTAURANT L.L.C (Al Barsha) | Dubai | Al Barsha-Shop No 2 |
| 11663 | SULTHAN AL ARAB RESTUARANT(Business Bay) | Dubai | Business Bay |
| 11664 | SULTHAN AL ARAB RESTUARANT (Manipal) | Dubai | Manipal,Dubai |
| 11665 | SULTHAN AL ARAB RESTUARANT(Al Qusais Branch) | Dubai | Al Qusais |

The live records they correspond to carry **no address, no emirate, no TRN and
the identical name** — the only thing telling them apart is which contract each
holds. So the mapping has to come from you, by contract number:

| Live record | Contract | Value | Which outlet is this? |
|---|---|---:|---|
| `CUST-0026` | 10032/25 | 3000 | _____________ |
| `CUST-0088` | 1094/25 | 5040 | _____________ |
| `CUST-0089` | 1095/25 | 5040 | _____________ |
| `CUST-0090` | 1096/25 | 6300 | _____________ |
| `CUST-0090` | (no number) | 200.00 | _____________ |
| `CUST-0091` | 1097/25 | 3780 | _____________ |
| `CUST-0092` | 1098/25 | 3780 | _____________ |

Once you fill that in, nothing is merged and nothing is repointed: each live
record simply takes its outlet's 5-digit number, exactly the way Calicut does.

## 3. Rows matched to an existing live customer — NOT created

| File account | File name | Live code | Live name | Matched on |
|---|---|---|---|---|
| 11114 | LATTAFA PERFUMES IND. LLC | `CUST-0096` | LATTAFA PERFUMES IND. LLC | matched a live customer (TRN) |

## 4. Held or rejected — a human decides (13)

| Account | Name | TRN | Reason |
|---|---|---|---|
| 11137 | Dubai Dates Factory LLC | 10478693600003 | TRN present but not a valid 15-digit UAE TRN |
| 11141 | Sinaa Automatic Bakery | 10006321310003 | TRN present but not a valid 15-digit UAE TRN |
| 11278 | Global Parts Fzc | 10035039000003 | TRN present but not a valid 15-digit UAE TRN |
| 11299 | Jamal Al Mas Ladies Beauty Center | 0169 | TRN present but not a valid 15-digit UAE TRN |
| 11334 | AL WEDHYAN GROCERY | 0191 | TRN present but not a valid 15-digit UAE TRN |
| 11338 | SMOKED MEAT WORLD.LLC SOLE PROPRIETORSHIP | 10411510750003 | TRN present but not a valid 15-digit UAE TRN |
| 11487 | Nev Real Estate L.L.C | 1040118075500003 | TRN present but not a valid 15-digit UAE TRN |
| 11525 | SULTHAN AL ARAB RESTUARANT | 104774977300003 | same legal entity (TRN 104774977300003) as a row held for outlet mapping |
| 11535 | Mother & Fetuses Medical Center L.L.C | 1004315955600003 | TRN present but not a valid 15-digit UAE TRN |
| 11662 | SULTAN AL ARAB RESTAURANT L.L.C (Al Barsha) | 104774977300003 | group "Sultan Al Arab" already exists live with 6 customer(s) — confirm whether this is a new outlet or one of them |
| 11663 | SULTHAN AL ARAB RESTUARANT(Business Bay) | 104774977300003 | same legal entity (TRN 104774977300003) as a row held for outlet mapping |
| 11664 | SULTHAN AL ARAB RESTUARANT (Manipal) | 104774977300003 | same legal entity (TRN 104774977300003) as a row held for outlet mapping |
| 11665 | SULTHAN AL ARAB RESTUARANT(Al Qusais Branch) | 104774977300003 | same legal entity (TRN 104774977300003) as a row held for outlet mapping |

## 5. Location quality — what the technician app must flag as approximate

| LOCATION_STATUS | Rows |
|---|---:|
| AREA_APPROX | 304 |
| NO_LOCATION | 184 |
| VERIFIED | 80 |
| UNVERIFIED | 15 |

## 6. Customer groups

Reconciliation ignores case, spacing, punctuation and a trailing "GROUP" and
nothing else (migration 098). Every reuse is named here before you approve it.

| Group in the file | Members in file | Resolves to | Existing live members |
|---|---:|---|---:|
| AL ATLAL ROASTRY GROUP | 1 | new group — will be created |  |
| AL MAWRID PRINTING GROUP | 3 | new group — will be created |  |
| AL SAMADI SWEETS GROUP | 1 | new group — will be created |  |
| AL TANEEN KARATE GROUP | 1 | new group — will be created |  |
| ARYAAS GROUP | 5 | new group — will be created |  |
| AWANEY GROUP | 1 | new group — will be created |  |
| BUN & BURR GROUP | 1 | new group — will be created |  |
| CAESAR CONFECTIONARY GROUP | 3 | new group — will be created |  |
| GCC EXCHANGE GROUP | 1 | new group — will be created |  |
| GULF ICE FACTORY GROUP | 2 | new group — will be created |  |
| GULF PASTRY GROUP | 2 | new group — will be created |  |
| MAZRAT AL FAWAKEH GROUP | 1 | new group — will be created |  |
| MEERA RESTAURANT GROUP | 1 | new group — will be created |  |
| MUWAILAH BUILDINGS GROUP | 5 | new group — will be created |  |
| NAEEMA TOWER GROUP | 1 | new group — will be created |  |
| NASERIYA BUILDINGS GROUP | 2 | new group — will be created |  |
| OCEAN OILFIELD GROUP | 3 | new group — will be created |  |
| REDTAPE GROUP | 1 | new group — will be created |  |
| SHIFA AL JAZEERA GROUP | 5 | new group — will be created |  |
| SUBURBAN CUSTOMER | 1 | new group — will be created |  |
| SULTAN ALARAB GROUP | 1 | **reuses live group `Sultan Al Arab`** | 6 |
| THE FOOD DISTRICT | 2 | new group — will be created |  |
| VKM KALARI GROUP | 2 | new group — will be created |  |
| YARMOOK BUILDINGS GROUP | 3 | new group — will be created |  |

## 7. Contacts and sites staged

| Table | Disposition | Rows |
|---|---|---:|
| contacts | clean | 386 |
| contacts | held | 11 |
| sites | clean | 443 |
| sites | held | 13 |

## 8. Blank-field count per column (Art. VII §5)

Blank means unknown. Nothing here is filled with a default.

| Column | Blank | of 583 |
|---|---:|---:|
| trn | 436 | 74.8% |
| email | 521 | 89.4% |
| notes | 184 | 31.6% |
| phone | 372 | 63.8% |
| mobile | 430 | 73.8% |
| po_box | 452 | 77.5% |
| address | 127 | 21.8% |
| emirate | 184 | 31.6% |
| district | 271 | 46.5% |
| latitude | 184 | 31.6% |
| priority | 570 | 97.8% |
| whatsapp | 583 | 100.0% |
| longitude | 184 | 31.6% |
| tl_expiry | 583 | 100.0% |
| alias_name | 508 | 87.1% |
| legal_name | 583 | 100.0% |
| trade_name | 0 | 0.0% |
| designation | 583 | 100.0% |
| referred_by | 583 | 100.0% |
| access_notes | 583 | 100.0% |
| customer_type | 583 | 100.0% |
| payment_terms | 583 | 100.0% |
| required_info | 15 | 2.6% |
| contact_person | 583 | 100.0% |
| customer_group | 534 | 91.6% |
| contract_sl_nos | 455 | 78.0% |
| location_source | 0 | 0.0% |
| location_status | 0 | 0.0% |
| place_of_supply | 184 | 31.6% |
| preferred_shift | 583 | 100.0% |
| contract_numbers | 455 | 78.0% |
| billing_frequency | 583 | 100.0% |
| industry_category | 583 | 100.0% |
| preferred_language | 583 | 100.0% |
| legacy_customer_code | 376 | 64.5% |
| trade_licence_number | 583 | 100.0% |
| municipality_category | 583 | 100.0% |

## 9. Columns the importer did not recognise

- `maps_link` — reported, not stored, nothing else dropped.

