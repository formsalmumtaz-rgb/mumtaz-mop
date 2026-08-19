# Import validation report — customer master

**Batch** `242efcab-03d2-4b03-9603-e43c365d3ce7`  ·  **status** validated  ·  **staged** 2026-08-19 01:44:39.719993+00
**Source** master workbook: ../../merge/customer-master-import.csv

Nothing below has been written to a live table. This is the dry-run report of
Art. VII §5; the commit is a separate, explicit step that needs the owner's approval.

## 1. Rows

| Disposition | Reason | Rows |
|---|---|---:|
| clean | (none) | 13 |
| matched_live | matched a live customer (account number) | 570 |
| **total** | | **583** |

## 2. Account numbers (DECISIONS §12)

| | |
|---|---:|
| Rows that will receive an account number | 13 |
| …kept from the file's ACCOUNT_NO | 13 |
| …minted because the file gave no valid 5-digit number | 0 |
| Lowest / highest assigned | 11137 / 11665 |

## 2b. Group → customers → branches, as it will stand after the commit

Each outlet is its OWN customer with its OWN account number; the group holds
them together for consolidated statements. Nothing is merged and no contract
or job moves between customers.


**AL ATLAL ROASTRY GROUP** → reuses live group `AL ATLAL ROASTRY GROUP`

| Account no. | Customer | Sites | Contracts | Status |
|---|---|---:|---:|---|
| `11327` | AL ATLAL ROASTRY | 1 | 0 | already live |
| 11327 | AL ATLAL ROASTRY | 1 | 3 (from file) | already exists — links to it |

**AL MAWRID PRINTING GROUP** → reuses live group `AL MAWRID PRINTING GROUP`

| Account no. | Customer | Sites | Contracts | Status |
|---|---|---:|---:|---|
| `11122` | AL MAWRID PRINTING & ADVERTISING IND LLC | 0 | 0 | already live |
| `11758` | AL MAWRID PRINTING & ADV. IND. LLC. | 0 | 0 | already live |
| `11765` | AL MAWRID PRINTING & ADVT. IND. LLC.UAQ.BR. | 0 | 0 | already live |
| 11122 | AL MAWRID PRINTING & ADVERTISING IND LLC | 0 | 1 (from file) | already exists — links to it |
| 11758 | AL MAWRID PRINTING & ADV. IND. LLC. | 0 | 2 (from file) | already exists — links to it |
| 11765 | AL MAWRID PRINTING & ADVT. IND. LLC.UAQ.BR. | 0 | 2 (from file) | already exists — links to it |

**AL SAMADI SWEETS GROUP** → reuses live group `AL SAMADI SWEETS GROUP`

| Account no. | Customer | Sites | Contracts | Status |
|---|---|---:|---:|---|
| `11379` | Al Samadi Sweets | 1 | 0 | already live |
| 11379 | Al Samadi Sweets | 1 | 0 (from file) | already exists — links to it |

**AL TANEEN KARATE GROUP** → reuses live group `AL TANEEN KARATE GROUP`

| Account no. | Customer | Sites | Contracts | Status |
|---|---|---:|---:|---|
| `11342` | Al Taneen Al Aswad Karate | 1 | 0 | already live |
| 11342 | Al Taneen Al Aswad Karate | 1 | 1 (from file) | already exists — links to it |

**ARYAAS GROUP** → reuses live group `ARYAAS GROUP`

| Account no. | Customer | Sites | Contracts | Status |
|---|---|---:|---:|---|
| `11295` | Aryaas Gourmet Veg Restaurant L.L.C | 1 | 0 | already live |
| `11322` | Aryaas Gourmet Veg Restaurant LLC- Shj.Br-Br | 1 | 0 | already live |
| `11323` | Aryaas Gourmet Veg Restaurant LLC- Shj.Br-Br 1 | 1 | 0 | already live |
| `11324` | Aryaas Gourmet Veg Restaurant LLC | 1 | 0 | already live |
| `11325` | Aryaas Gourmet Alqusais Veg Rest LLC | 1 | 0 | already live |
| 11295 | Aryaas Gourmet Veg Restaurant L.L.C | 1 | 0 (from file) | already exists — links to it |
| 11322 | Aryaas Gourmet Veg Restaurant LLC- Shj.Br-Br | 1 | 0 (from file) | already exists — links to it |
| 11323 | Aryaas Gourmet Veg Restaurant LLC- Shj.Br-Br 1 | 1 | 0 (from file) | already exists — links to it |
| 11324 | Aryaas Gourmet Veg Restaurant LLC | 1 | 2 (from file) | already exists — links to it |
| 11325 | Aryaas Gourmet Alqusais Veg Rest LLC | 1 | 0 (from file) | already exists — links to it |

**AWANEY GROUP** → reuses live group `AWANEY GROUP`

| Account no. | Customer | Sites | Contracts | Status |
|---|---|---:|---:|---|
| `11462` | Awaney Restaurant | 1 | 0 | already live |
| 11462 | Awaney Restaurant | 1 | 2 (from file) | already exists — links to it |

**BUN & BURR GROUP** → reuses live group `BUN & BURR GROUP`

| Account no. | Customer | Sites | Contracts | Status |
|---|---|---:|---:|---|
| `11352` | BUN & BURR CAFE | 1 | 0 | already live |
| 11352 | BUN & BURR CAFE | 1 | 1 (from file) | already exists — links to it |

**CAESAR CONFECTIONARY GROUP** → reuses live group `CAESAR CONFECTIONARY GROUP`

| Account no. | Customer | Sites | Contracts | Status |
|---|---|---:|---:|---|
| `11144` | Caesars Restaurant | 1 | 0 | already live |
| `11145` | Caesars Restaurant & Confectionery | 1 | 0 | already live |
| `11816` | Caesar Confectionary LLC. BR .SHJ. Warehouse1 | 0 | 0 | already live |
| 11144 | Caesars Restaurant | 1 | 0 (from file) | already exists — links to it |
| 11145 | Caesars Restaurant & Confectionery | 1 | 1 (from file) | already exists — links to it |
| 11816 | Caesar Confectionary LLC. BR .SHJ. Warehouse1 | 0 | 2 (from file) | already exists — links to it |

**GCC EXCHANGE GROUP** → reuses live group `GCC EXCHANGE GROUP`

| Account no. | Customer | Sites | Contracts | Status |
|---|---|---:|---:|---|
| `11194` | GCC EXCHANGE | 1 | 0 | already live |
| 11194 | GCC EXCHANGE | 1 | 0 (from file) | already exists — links to it |

**GULF ICE FACTORY GROUP** → reuses live group `GULF ICE FACTORY GROUP`

| Account no. | Customer | Sites | Contracts | Status |
|---|---|---:|---:|---|
| `11267` | GULF ICE FACTORY & COLD STORAGE | 1 | 0 | already live |
| `11726` | GULF ICE FACTORY &COLD STORAGE  PLANT 4- STAFF  ACCOMMODATION | 0 | 0 | already live |
| 11267 | GULF ICE FACTORY & COLD STORAGE | 1 | 3 (from file) | already exists — links to it |
| 11726 | GULF ICE FACTORY &COLD STORAGE  PLANT 4- STAFF  ACCOMMODATION | 0 | 3 (from file) | already exists — links to it |

**GULF PASTRY GROUP** → reuses live group `GULF PASTRY GROUP`

| Account no. | Customer | Sites | Contracts | Status |
|---|---|---:|---:|---|
| `11782` | GULF PASTRY SHJ. BR.-BRANCH 1 | 0 | 0 | already live |
| `11818` | GULF PASTRY SHJ.BR | 0 | 0 | already live |
| 11782 | GULF PASTRY SHJ. BR.-BRANCH 1 | 0 | 2 (from file) | already exists — links to it |
| 11818 | GULF PASTRY SHJ.BR | 0 | 2 (from file) | already exists — links to it |

**MAZRAT AL FAWAKEH GROUP** → reuses live group `MAZRAT AL FAWAKEH GROUP`

| Account no. | Customer | Sites | Contracts | Status |
|---|---|---:|---:|---|
| `11422` | Mazrat Al Fawakeh Supermarket | 1 | 0 | already live |
| 11422 | Mazrat Al Fawakeh Supermarket | 1 | 0 (from file) | already exists — links to it |

**MEERA RESTAURANT GROUP** → reuses live group `MEERA RESTAURANT GROUP`

| Account no. | Customer | Sites | Contracts | Status |
|---|---|---:|---:|---|
| `11125` | MEERA RESTAURANT | 1 | 0 | already live |
| 11125 | MEERA RESTAURANT | 1 | 0 (from file) | already exists — links to it |

**MUWAILAH BUILDINGS GROUP** → reuses live group `MUWAILAH BUILDINGS GROUP`

| Account no. | Customer | Sites | Contracts | Status |
|---|---|---:|---:|---|
| `11597` | Maitha Mohammed Abdulla Saif Al Shamsi(Muwailah 3649) | 0 | 0 | already live |
| `11748` | MUWAILAH 3649 BLDG | 0 | 0 | already live |
| `11749` | MUWAILAH 6654 BLDG | 0 | 0 | already live |
| `11751` | MUWAILAH 2268 BLDG | 0 | 0 | already live |
| `11752` | MUWAILAH 1601 BLDG | 0 | 0 | already live |
| 11597 | Maitha Mohammed Abdulla Saif Al Shamsi(Muwailah 3649) | 0 | 0 (from file) | already exists — links to it |
| 11748 | MUWAILAH 3649 BLDG | 0 | 1 (from file) | already exists — links to it |
| 11749 | MUWAILAH 6654 BLDG | 0 | 1 (from file) | already exists — links to it |
| 11751 | MUWAILAH 2268 BLDG | 0 | 1 (from file) | already exists — links to it |
| 11752 | MUWAILAH 1601 BLDG | 0 | 1 (from file) | already exists — links to it |

**NAEEMA TOWER GROUP** → reuses live group `NAEEMA TOWER GROUP`

| Account no. | Customer | Sites | Contracts | Status |
|---|---|---:|---:|---|
| `11764` | NAEEMA TOWER | 0 | 0 | already live |
| 11764 | NAEEMA TOWER | 0 | 2 (from file) | already exists — links to it |

**NASERIYA BUILDINGS GROUP** → reuses live group `NASERIYA BUILDINGS GROUP`

| Account no. | Customer | Sites | Contracts | Status |
|---|---|---:|---:|---|
| `11738` | NASERIYA BUILDING 1 | 0 | 0 | already live |
| `11739` | NASERIYA BUILDING 2 | 0 | 0 | already live |
| 11738 | NASERIYA BUILDING 1 | 0 | 2 (from file) | already exists — links to it |
| 11739 | NASERIYA BUILDING 2 | 0 | 2 (from file) | already exists — links to it |

**OCEAN OILFIELD GROUP** → reuses live group `OCEAN OILFIELD GROUP`

| Account no. | Customer | Sites | Contracts | Status |
|---|---|---:|---:|---|
| `11152` | Ocean Oilfield Drilling Rigs&marine Engg.Services FZE | 1 | 0 | already live |
| `11197` | Ocean Oilfield Services (FZE) | 1 | 0 | already live |
| `11539` | Ocean Oilfield Driling Rigs & Marine Eng | 1 | 0 | already live |
| 11152 | Ocean Oilfield Drilling Rigs&marine Engg.Services FZE | 1 | 0 (from file) | already exists — links to it |
| 11197 | Ocean Oilfield Services (FZE) | 1 | 0 (from file) | already exists — links to it |
| 11321 | Brilliant International Private School | 1 | 1 (from file) | already exists — links to it |
| 11387 | Al Mumtaz Bldg Clean & Pest Control | 1 | 0 (from file) | already exists — links to it |
| 11539 | Ocean Oilfield Driling Rigs & Marine Eng | 1 | 0 (from file) | already exists — links to it |

**REDTAPE GROUP** → reuses live group `REDTAPE GROUP`

| Account no. | Customer | Sites | Contracts | Status |
|---|---|---:|---:|---|
| `11426` | REDTAPE | 1 | 0 | already live |
| 11426 | REDTAPE | 1 | 0 (from file) | already exists — links to it |

**SHIFA AL JAZEERA GROUP** → reuses live group `SHIFA AL JAZEERA GROUP`

| Account no. | Customer | Sites | Contracts | Status |
|---|---|---:|---:|---|
| `11115` | Shifa Al Jazeera Medical Centre | 1 | 0 | already live |
| `11116` | Shifa Al Jazeera Medical Centre LLC | 1 | 0 | already live |
| `11118` | Shifa Al Jazeera Medical Centre LLC Br 1 | 1 | 0 | already live |
| `11633` | SHIFA AL JAZEERA MEDICAL CENTRE(MUWAILEH BRANCH) | 1 | 0 | already live |
| `11677` | SHIFA AL JAZEERA MEDICAL CENTER -BRANCH1 | 0 | 0 | already live |
| 11115 | Shifa Al Jazeera Medical Centre | 1 | 0 (from file) | already exists — links to it |
| 11116 | Shifa Al Jazeera Medical Centre LLC | 1 | 0 (from file) | already exists — links to it |
| 11118 | Shifa Al Jazeera Medical Centre LLC Br 1 | 1 | 0 (from file) | already exists — links to it |
| 11633 | SHIFA AL JAZEERA MEDICAL CENTRE(MUWAILEH BRANCH) | 1 | 0 (from file) | already exists — links to it |
| 11677 | SHIFA AL JAZEERA MEDICAL CENTER -BRANCH1 | 0 | 0 (from file) | already exists — links to it |

**SUBURBAN CUSTOMER** → reuses live group `SUBURBAN CUSTOMER`

| Account no. | Customer | Sites | Contracts | Status |
|---|---|---:|---:|---|
| `11287` | AL HAMAD BUILDING CONTRACTING CO. LLC | 0 | 0 | already live |
| 11287 | AL HAMAD BUILDING CONTRACTING CO. LLC | 0 | 0 (from file) | already exists — links to it |

**SULTAN ALARAB GROUP** → reuses live group `Sultan Al Arab`

| Account no. | Customer | Sites | Contracts | Status |
|---|---|---:|---:|---|
| `CUST-0026` | SULTAN ALARAB REST | 0 | 1 | already live, 2 job(s) |
| `CUST-0088` | SULTAN ALARAB REST | 0 | 1 | already live, 1 job(s) |
| `CUST-0089` | SULTAN ALARAB REST | 0 | 1 | already live |
| `CUST-0090` | SULTAN ALARAB REST | 0 | 2 | already live |
| `CUST-0091` | SULTAN ALARAB REST | 0 | 1 | already live |
| `CUST-0092` | SULTAN ALARAB REST | 0 | 1 | already live |
| 11525 | SULTHAN AL ARAB RESTUARANT | 1 | 0 (from file) | will be created as `11525` |
| 11662 | SULTAN AL ARAB RESTAURANT L.L.C (Al Barsha) | 1 | 0 (from file) | will be created as `11662` |
| 11663 | SULTHAN AL ARAB RESTUARANT(Business Bay) | 1 | 0 (from file) | will be created as `11663` |
| 11664 | SULTHAN AL ARAB RESTUARANT (Manipal) | 1 | 0 (from file) | will be created as `11664` |
| 11665 | SULTHAN AL ARAB RESTUARANT(Al Qusais Branch) | 1 | 0 (from file) | will be created as `11665` |

**THE FOOD DISTRICT** → reuses live group `THE FOOD DISTRICT`

| Account no. | Customer | Sites | Contracts | Status |
|---|---|---:|---:|---|
| `11123` | Origami Restaurant LLC | 1 | 0 | already live |
| `11124` | Moon Slice Restaurant LLC | 1 | 0 | already live |
| 11123 | Origami Restaurant LLC | 1 | 1 (from file) | already exists — links to it |
| 11124 | Moon Slice Restaurant LLC | 1 | 0 (from file) | already exists — links to it |

**VKM KALARI GROUP** → reuses live group `VKM KALARI GROUP`

| Account no. | Customer | Sites | Contracts | Status |
|---|---|---:|---:|---|
| `11647` | VKM KALARI TRADITIONAL MARTIAL ARTS CLUB  LLC.SHJ .BR | 1 | 0 | already live |
| `11648` | VKM KALARI TRADITIONAL MARTIAL ARTS CLUB  LLC.SHJ .BR -BRANCH 1 | 0 | 0 | already live |
| 11647 | VKM KALARI TRADITIONAL MARTIAL ARTS CLUB  LLC.SHJ .BR | 1 | 2 (from file) | already exists — links to it |
| 11648 | VKM KALARI TRADITIONAL MARTIAL ARTS CLUB  LLC.SHJ .BR -BRANCH 1 | 0 | 1 (from file) | already exists — links to it |

**YARMOOK BUILDINGS GROUP** → reuses live group `YARMOOK BUILDINGS GROUP`

| Account no. | Customer | Sites | Contracts | Status |
|---|---|---:|---:|---|
| `11598` | Hamad Ateeq Shames Ahmed Alameri YARMOOK BLDG | 1 | 0 | already live |
| `11746` | YARMOOK BLDG | 0 | 0 | already live |
| `11747` | YARMOOK BUILDING | 0 | 0 | already live |
| 11598 | Hamad Ateeq Shames Ahmed Alameri YARMOOK BLDG | 1 | 0 (from file) | already exists — links to it |
| 11746 | YARMOOK BLDG | 0 | 1 (from file) | already exists — links to it |
| 11747 | YARMOOK BUILDING | 0 | 1 (from file) | already exists — links to it |

## 2c. One legal entity, several outlets (shared TRN)

A UAE TRN is issued per legal entity, so these rows are one company trading
from several places. Each keeps its own account number and becomes its own
customer. Turning any of them into branches of a single customer is your
decision — the system does not infer it.

| TRN | Outlets | Group | Members |
|---|---:|---|---|
| 100247587700003 | 8 | — | 11128 NESTO HYPERMARKET SOLE PROPRIETORSHIP LLC-BR 4 · 11129 NEW NESTO CENTER SOLE PROPRIETOSHIP LLC · 11238 AL WAFA CENTRE GEN . TR. LLC SOLE PROPRIETORSHIP · 11436 EAST WEST HYPERMARKET L.L.C · 11445 NESTO HYPER MARKET L.L.C (Branch) · 11451 Nesto Al Warsan Staff Accommodation · 11455 NESTO HYPER MARKET L.L.C (Branch).   8125 · 11457 Nesto Al Khan Staff Accommodation |
| 104774977300003 | 5 | SULTAN ALARAB GROUP | 11525 SULTHAN AL ARAB RESTUARANT · 11662 SULTAN AL ARAB RESTAURANT L.L.C (Al Barsha) · 11663 SULTHAN AL ARAB RESTUARANT(Business Bay) · 11664 SULTHAN AL ARAB RESTUARANT (Manipal) · 11665 SULTHAN AL ARAB RESTUARANT(Al Qusais Branch) |
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

## 3. Rows matched to an existing live customer — NOT created

| File account | File name | Live code | Live name | Matched on |
|---|---|---|---|---|
| 11111 | Rafid for Automotive Solutions LLC | `11111` | Rafid for Automotive Solutions LLC | matched a live customer (account number) |
| 11112 | Sedar Decor Factory LLC | `11112` | Sedar Decor Factory LLC | matched a live customer (account number) |
| 11113 | Medpharma Pharma & Chemical Industries LLC | `11113` | Medpharma Pharma & Chemical Industries LLC | matched a live customer (account number) |
| 11114 | LATTAFA PERFUMES IND. LLC | `11114` | LATTAFA PERFUMES IND. LLC | matched a live customer (account number) |
| 11115 | Shifa Al Jazeera Medical Centre | `11115` | Shifa Al Jazeera Medical Centre | matched a live customer (account number) |
| 11116 | Shifa Al Jazeera Medical Centre LLC | `11116` | Shifa Al Jazeera Medical Centre LLC | matched a live customer (account number) |
| 11117 | Shifa Al Rabee Medical Centre | `11117` | Shifa Al Rabee Medical Centre | matched a live customer (account number) |
| 11118 | Shifa Al Jazeera Medical Centre LLC Br 1 | `11118` | Shifa Al Jazeera Medical Centre LLC Br 1 | matched a live customer (account number) |
| 11119 | Vivat International Trading LLC | `11119` | Vivat International Trading LLC | matched a live customer (account number) |
| 11121 | HOME PLUS HOMES FACILITIES MANAGEMENT | `11121` | HOME PLUS HOMES FACILITIES MANAGEMENT | matched a live customer (account number) |
| 11122 | AL MAWRID PRINTING & ADVERTISING IND LLC | `11122` | AL MAWRID PRINTING & ADVERTISING IND LLC | matched a live customer (account number) |
| 11123 | Origami Restaurant LLC | `11123` | Origami Restaurant LLC | matched a live customer (account number) |
| 11124 | Moon Slice Restaurant LLC | `11124` | Moon Slice Restaurant LLC | matched a live customer (account number) |
| 11125 | MEERA RESTAURANT | `11125` | MEERA RESTAURANT | matched a live customer (account number) |
| 11126 | NAVITAS CHEMICALS FZE | `11126` | NAVITAS CHEMICALS FZE | matched a live customer (account number) |
| 11127 | Heirs of Abdullah Mohammed Al Roken | `11127` | Heirs of Abdullah Mohammed Al Roken | matched a live customer (account number) |
| 11128 | NESTO HYPERMARKET SOLE PROPRIETORSHIP LLC-BR 4 | `11128` | NESTO HYPERMARKET SOLE PROPRIETORSHIP LLC-BR 4 | matched a live customer (account number) |
| 11129 | NEW NESTO CENTER SOLE PROPRIETOSHIP LLC | `11129` | NEW NESTO CENTER SOLE PROPRIETOSHIP LLC | matched a live customer (account number) |
| 11131 | Marhaba Auctions | `11131` | Marhaba Auctions | matched a live customer (account number) |
| 11132 | NASEEM AL BARARI TRADING LLC | `11132` | NASEEM AL BARARI TRADING LLC | matched a live customer (account number) |
| 11133 | AURORA GLAMOUR TRADING CO. L.L.C | `11133` | AURORA GLAMOUR TRADING CO. L.L.C | matched a live customer (account number) |
| 11134 | Customer | `11134` | Customer | matched a live customer (account number) |
| 11135 | Liberty Printing Press L.L.C | `11135` | Liberty Printing Press L.L.C | matched a live customer (account number) |
| 11136 | Al Sadaf Al Ahmar Rest LLC Sole Proprietorship | `11136` | Al Sadaf Al Ahmar Rest LLC Sole Proprietorship | matched a live customer (account number) |
| 11138 | Clove Tree Restaurant | `11138` | Clove Tree Restaurant | matched a live customer (account number) |
| 11139 | Vision Investment | `11139` | Vision Investment | matched a live customer (account number) |
| 11142 | La Marquise Diamond & Watches LLC Br | `11142` | La Marquise Diamond & Watches LLC Br | matched a live customer (account number) |
| 11143 | Al Fardan Exchange LLC | `11143` | Al Fardan Exchange LLC | matched a live customer (account number) |
| 11144 | Caesars Restaurant | `11144` | Caesars Restaurant | matched a live customer (account number) |
| 11145 | Caesars Restaurant & Confectionery | `11145` | Caesars Restaurant & Confectionery | matched a live customer (account number) |
| 11146 | AL BAMBOO CHINESE RESTAURANT | `11146` | AL BAMBOO CHINESE RESTAURANT | matched a live customer (account number) |
| 11147 | NOOR AL QAMAR RESTAURANT | `11147` | NOOR AL QAMAR RESTAURANT | matched a live customer (account number) |
| 11148 | BM TOWERS | `11148` | BM TOWERS | matched a live customer (account number) |
| 11149 | Juraina Villa | `11149` | Juraina Villa | matched a live customer (account number) |
| 11151 | Luqman Pharmacy LLC | `11151` | Luqman Pharmacy LLC | matched a live customer (account number) |
| 11152 | Ocean Oilfield Drilling Rigs&marine Engg.Services FZE | `11152` | Ocean Oilfield Drilling Rigs&marine Engg.Services FZE | matched a live customer (account number) |
| 11153 | Haji Pharmacy LLC | `11153` | Haji Pharmacy LLC | matched a live customer (account number) |
| 11154 | AL IMAN ENGLISH NURSERY | `11154` | AL IMAN ENGLISH NURSERY | matched a live customer (account number) |
| 11155 | Mohamed Ghafour Shakri | `11155` | Mohamed Ghafour Shakri | matched a live customer (account number) |
| 11156 | Hadeqat Udupi Rest. LLC | `11156` | Hadeqat Udupi Rest. LLC | matched a live customer (account number) |
| 11157 | CORE CAFETERIA L.L.C | `11157` | CORE CAFETERIA L.L.C | matched a live customer (account number) |
| 11158 | Saga Spa for Men Per Person Company LLC, Br. 1 | `11158` | Saga Spa for Men Per Person Company LLC, Br. 1 | matched a live customer (account number) |
| 11159 | Saga Spa for Men Per Person Company LLC | `11159` | Saga Spa for Men Per Person Company LLC | matched a live customer (account number) |
| 11161 | HEIRS OF FARAJ AMRALLA ABDULLA ABDULRAHIM | `11161` | HEIRS OF FARAJ AMRALLA ABDULLA ABDULRAHIM | matched a live customer (account number) |
| 11162 | MATRIX PACKING MATERIALS MANUFACTURING LLC | `11162` | MATRIX PACKING MATERIALS MANUFACTURING LLC | matched a live customer (account number) |
| 11163 | ALSERKAL GROUP | `11163` | ALSERKAL GROUP | matched a live customer (account number) |
| 11164 | INTERNATIONAL MODERN HOSPITAL | `11164` | INTERNATIONAL MODERN HOSPITAL | matched a live customer (account number) |
| 11165 | Design Mode Interiors LLC | `11165` | Design Mode Interiors LLC | matched a live customer (account number) |
| 11166 | AL SHAMS MEDICAL CENTRE LLC | `11166` | AL SHAMS MEDICAL CENTRE LLC | matched a live customer (account number) |
| 11167 | Villa No. 4A | `11167` | Villa No. 4A | matched a live customer (account number) |
| 11168 | FOURWINDS COMPANY | `11168` | FOURWINDS COMPANY | matched a live customer (account number) |
| 11169 | AL KHIBRAH DOMESTIC WORKERS SERVICES CENTER  LLC | `11169` | AL KHIBRAH DOMESTIC WORKERS SERVICES CENTER  LLC | matched a live customer (account number) |
| 11171 | POWER MAX TRADING LLC | `11171` | POWER MAX TRADING LLC | matched a live customer (account number) |
| 11172 | WINNOW SOLUTIONS MEA FZ-LLC | `11172` | WINNOW SOLUTIONS MEA FZ-LLC | matched a live customer (account number) |
| 11173 | Al Suma Electric and Switch Gear | `11173` | Al Suma Electric and Switch Gear | matched a live customer (account number) |
| 11174 | BERG AND SCHMIDT MIDDLE EAST TRADING L.L.C | `11174` | BERG AND SCHMIDT MIDDLE EAST TRADING L.L.C | matched a live customer (account number) |
| 11175 | INAYA FACILITIES MANAGEMENT SERVICES L.L.C | `11175` | INAYA FACILITIES MANAGEMENT SERVICES L.L.C | matched a live customer (account number) |
| 11176 | Zenith Concepts Interior Decorating Co. LLC | `11176` | Zenith Concepts Interior Decorating Co. LLC | matched a live customer (account number) |
| 11177 | AMOUN PHARMACEUTICAL CO.S.A.E | `11177` | AMOUN PHARMACEUTICAL CO.S.A.E | matched a live customer (account number) |
| 11178 | Landmark Retail Investment Co LLC | `11178` | Landmark Retail Investment Co LLC | matched a live customer (account number) |
| 11179 | SEVEN OAKS NURSERY | `11179` | SEVEN OAKS NURSERY | matched a live customer (account number) |
| 11181 | Al Barq real estate | `11181` | Al Barq real estate | matched a live customer (account number) |
| 11182 | Leaders real estate | `11182` | Leaders real estate | matched a live customer (account number) |
| 11183 | Home Book Property Managment | `11183` | Home Book Property Managment | matched a live customer (account number) |
| 11184 | AL WARDA AL SAFRA SUPERMARKET LLC - SOLE PROPRIETORSHIP | `11184` | AL WARDA AL SAFRA SUPERMARKET LLC - SOLE PROPRIETORSHIP | matched a live customer (account number) |
| 11185 | MAMZAR AL NAHDA GROCERY LLC | `11185` | MAMZAR AL NAHDA GROCERY LLC | matched a live customer (account number) |
| 11186 | AL FANNAN PRINTING PRESS L.L.C | `11186` | AL FANNAN PRINTING PRESS L.L.C | matched a live customer (account number) |
| 11187 | SEVEN OAKS OWNER VILLA | `11187` | SEVEN OAKS OWNER VILLA | matched a live customer (account number) |
| 11188 | GOLDEN LINE PRINTING PRESS L.L.C | `11188` | GOLDEN LINE PRINTING PRESS L.L.C | matched a live customer (account number) |
| 11189 | Seven emirates cafeteria | `11189` | Seven emirates cafeteria | matched a live customer (account number) |
| 11191 | Wesgreen International School (GEMS EDUCATION) | `11191` | Wesgreen International School (GEMS EDUCATION) | matched a live customer (account number) |
| 11192 | AL FALAK RESTAURANT | `11192` | AL FALAK RESTAURANT | matched a live customer (account number) |
| 11193 | CALICUT NOTEBOOK RESTAURANT | `11193` | CALICUT NOTEBOOK RESTAURANT | matched a live customer (account number) |
| 11194 | GCC EXCHANGE | `11194` | GCC EXCHANGE | matched a live customer (account number) |
| 11195 | LULU HYPERMARKET AL DHAID MALL | `11195` | LULU HYPERMARKET AL DHAID MALL | matched a live customer (account number) |
| 11196 | AL TANOOR AL AFGHANI RESTAURANT - SOLE PROPRIETORSHIP L.L.C | `11196` | AL TANOOR AL AFGHANI RESTAURANT - SOLE PROPRIETORSHIP L.L.C | matched a live customer (account number) |
| 11197 | Ocean Oilfield Services (FZE) | `11197` | Ocean Oilfield Services (FZE) | matched a live customer (account number) |
| 11198 | Jereesh Restaurant | `11198` | Jereesh Restaurant | matched a live customer (account number) |
| 11199 | AL FEHAIDI PHARMACY LLC | `11199` | AL FEHAIDI PHARMACY LLC | matched a live customer (account number) |
| 11211 | Taza Restaurant | `11211` | Taza Restaurant | matched a live customer (account number) |
| 11212 | VILLA-1 AL NEKHAILAT | `11212` | VILLA-1 AL NEKHAILAT | matched a live customer (account number) |
| 11213 | QATR AL NADA LADIES SALOON | `11213` | QATR AL NADA LADIES SALOON | matched a live customer (account number) |
| 11214 | FRIDAY CORNER  CAFETERIA | `11214` | FRIDAY CORNER  CAFETERIA | matched a live customer (account number) |
| 11215 | THE WHITE SPOT BEAUTY CENTER | `11215` | THE WHITE SPOT BEAUTY CENTER | matched a live customer (account number) |
| 11216 | LEADERS FITNESS | `11216` | LEADERS FITNESS | matched a live customer (account number) |
| 11217 | ALO BARBAR RESTAURANT - BRANCH - 1 | `11217` | ALO BARBAR RESTAURANT - BRANCH - 1 | matched a live customer (account number) |
| 11218 | AL ALAMIAH MEDICAL EQUIP. & DRUGS STORE LLC. | `11218` | AL ALAMIAH MEDICAL EQUIP. & DRUGS STORE LLC. | matched a live customer (account number) |
| 11219 | VISION ADHENSIVE LABELS FACTORY L.L.C | `11219` | VISION ADHENSIVE LABELS FACTORY L.L.C | matched a live customer (account number) |
| 11221 | LIWA PHARMACY | `11221` | LIWA PHARMACY | matched a live customer (account number) |
| 11222 | TRUDOC PHARMACY L.L.C | `11222` | TRUDOC PHARMACY L.L.C | matched a live customer (account number) |
| 11223 | AL FANAR CAFE | `11223` | AL FANAR CAFE | matched a live customer (account number) |
| 11224 | CHOICE RESTAURANT FREE ZONE | `11224` | CHOICE RESTAURANT FREE ZONE | matched a live customer (account number) |
| 11225 | SEVEN GRAM CAFE L.L.C | `11225` | SEVEN GRAM CAFE L.L.C | matched a live customer (account number) |
| 11226 | MAC ISLAND CAFETERIA | `11226` | MAC ISLAND CAFETERIA | matched a live customer (account number) |
| 11227 | Sharjah Trading | `11227` | Sharjah Trading | matched a live customer (account number) |
| 11228 | Sharjah Trade Center | `11228` | Sharjah Trade Center | matched a live customer (account number) |
| 11229 | Al Ajwah Al Thahabiah Supermarket | `11229` | Al Ajwah Al Thahabiah Supermarket | matched a live customer (account number) |
| 11231 | Bin Shenna Hair Dressing Salon | `11231` | Bin Shenna Hair Dressing Salon | matched a live customer (account number) |
| 11232 | AL IKHTAYAR AL RAFEE                                     ROASTERY L .L .C | `11232` | AL IKHTAYAR AL RAFEE                                     ROASTERY L .L .C | matched a live customer (account number) |
| 11233 | Najmat Al Ramla Hair Dressing Salon | `11233` | Najmat Al Ramla Hair Dressing Salon | matched a live customer (account number) |
| 11234 | RASHEDA HAIR DRESSER SALON | `11234` | RASHEDA HAIR DRESSER SALON | matched a live customer (account number) |
| 11235 | DAR BARAKAH HAIRDRESSING SALOON | `11235` | DAR BARAKAH HAIRDRESSING SALOON | matched a live customer (account number) |
| 11236 | WAHAT AL NEJOUM HAIR DRESSING SALON | `11236` | WAHAT AL NEJOUM HAIR DRESSING SALON | matched a live customer (account number) |
| 11237 | MIRDHIF VILLA | `11237` | MIRDHIF VILLA | matched a live customer (account number) |
| 11238 | AL WAFA CENTRE GEN . TR. LLC SOLE PROPRIETORSHIP | `11238` | AL WAFA CENTRE GEN . TR. LLC SOLE PROPRIETORSHIP | matched a live customer (account number) |
| 11239 | QUDRAH FITNESS | `11239` | QUDRAH FITNESS | matched a live customer (account number) |
| 11241 | MANARA Al SAJAA SALOON | `11241` | MANARA Al SAJAA SALOON | matched a live customer (account number) |
| 11242 | Herangi Foods and Beverages Trading L.L.C | `11242` | Herangi Foods and Beverages Trading L.L.C | matched a live customer (account number) |
| 11243 | WARDAT MUWAILEIH LADIES SALON | `11243` | WARDAT MUWAILEIH LADIES SALON | matched a live customer (account number) |
| 11244 | ZAWYA AL EBTEKAR HAIRDRESSER SALON | `11244` | ZAWYA AL EBTEKAR HAIRDRESSER SALON | matched a live customer (account number) |
| 11245 | AVR GENERAL TRADING LLC | `11245` | AVR GENERAL TRADING LLC | matched a live customer (account number) |
| 11246 | VIRGINIA ANGUS RESTAURANT | `11246` | VIRGINIA ANGUS RESTAURANT | matched a live customer (account number) |
| 11247 | NEW GENERATION FOOD SUPPLEMENTS TRADING LLC. | `11247` | NEW GENERATION FOOD SUPPLEMENTS TRADING LLC. | matched a live customer (account number) |
| 11248 | DYNAMIC INDUSTRIES LLC | `11248` | DYNAMIC INDUSTRIES LLC | matched a live customer (account number) |
| 11249 | AL NOOR AL THAHABI AUTOMATIC BAKERY LLC | `11249` | AL NOOR AL THAHABI AUTOMATIC BAKERY LLC | matched a live customer (account number) |
| 11251 | Zayid Bin Saqer Al Nehayan Al Khairya | `11251` | Zayid Bin Saqer Al Nehayan Al Khairya | matched a live customer (account number) |
| 11252 | Accuro Specialist Support Services | `11252` | Accuro Specialist Support Services | matched a live customer (account number) |
| 11253 | SHAIKHA SHAIKHA MOHAMED SAQER ALQASSIMI | `11253` | SHAIKHA SHAIKHA MOHAMED SAQER ALQASSIMI | matched a live customer (account number) |
| 11254 | Grand Mall Sharjah | `11254` | Grand Mall Sharjah | matched a live customer (account number) |
| 11255 | GINCO CONT. CO. LLC LABOR CAMP PLOT NO : 382-0 | `11255` | GINCO CONT. CO. LLC LABOR CAMP PLOT NO : 382-0 | matched a live customer (account number) |
| 11256 | AL WAKEEL BAKERY | `11256` | AL WAKEEL BAKERY | matched a live customer (account number) |
| 11257 | AL MARJAN SALOON | `11257` | AL MARJAN SALOON | matched a live customer (account number) |
| 11258 | KOSOVO GROCERY | `11258` | KOSOVO GROCERY | matched a live customer (account number) |
| 11259 | BON AL SAMRA COFFEE | `11259` | BON AL SAMRA COFFEE | matched a live customer (account number) |
| 11261 | BLOSSOM EDUCATION INVESTMENT LLC - SHJ. BR | `11261` | BLOSSOM EDUCATION INVESTMENT LLC - SHJ. BR | matched a live customer (account number) |
| 11262 | AL BUSTAN AL AKHDHAR HAIRDRESSING SALOON | `11262` | AL BUSTAN AL AKHDHAR HAIRDRESSING SALOON | matched a live customer (account number) |
| 11263 | ALED & RAMLAH REST - BR 1 | `11263` | ALED & RAMLAH REST - BR 1 | matched a live customer (account number) |
| 11264 | Trueman Technical Services Contracting LLC | `11264` | Trueman Technical Services Contracting LLC | matched a live customer (account number) |
| 11265 | Mohd.Jaber Abdullah Al Harbi | `11265` | Mohd.Jaber Abdullah Al Harbi | matched a live customer (account number) |
| 11266 | MONT CARLO  HAIRDRESSING SALON | `11266` | MONT CARLO  HAIRDRESSING SALON | matched a live customer (account number) |
| 11267 | GULF ICE FACTORY & COLD STORAGE | `11267` | GULF ICE FACTORY & COLD STORAGE | matched a live customer (account number) |
| 11268 | AL KABAB AL BUKHARI REST | `11268` | AL KABAB AL BUKHARI REST | matched a live customer (account number) |
| 11269 | MR. FAISAL VILLA NO : 20 & 22 | `11269` | MR. FAISAL VILLA NO : 20 & 22 | matched a live customer (account number) |
| 11271 | MUTLAQ AL MUTLAQ REAL STATE | `11271` | MUTLAQ AL MUTLAQ REAL STATE | matched a live customer (account number) |
| 11272 | THE YELLOW FORT CAFETERIA L.L.C S.P | `11272` | THE YELLOW FORT CAFETERIA L.L.C S.P | matched a live customer (account number) |
| 11273 | Ardh Al Mustaqbal Real Estate | `11273` | Ardh Al Mustaqbal Real Estate | matched a live customer (account number) |
| 11274 | LONDON BRITISH NURSERY | `11274` | LONDON BRITISH NURSERY | matched a live customer (account number) |
| 11275 | Rukn Al Shwaihean Supermarket LLC | `11275` | Rukn Al Shwaihean Supermarket LLC | matched a live customer (account number) |
| 11276 | DAISO Japan | `11276` | DAISO Japan | matched a live customer (account number) |
| 11277 | BAUSCH HEALTH TRADING DWC LLC | `11277` | BAUSCH HEALTH TRADING DWC LLC | matched a live customer (account number) |
| 11279 | AL NAJM ALRAIE CAFETERIA | `11279` | AL NAJM ALRAIE CAFETERIA | matched a live customer (account number) |
| 11281 | AL MANARA AL JAMELA GROCERY | `11281` | AL MANARA AL JAMELA GROCERY | matched a live customer (account number) |
| 11282 | BRIDGE WAY FIRM FZ - LLC | `11282` | BRIDGE WAY FIRM FZ - LLC | matched a live customer (account number) |
| 11283 | LINOX CREATIVE ADVERTISTING LLC | `11283` | LINOX CREATIVE ADVERTISTING LLC | matched a live customer (account number) |
| 11284 | SIZAR JEWELLERS FACTORY LLC | `11284` | SIZAR JEWELLERS FACTORY LLC | matched a live customer (account number) |
| 11285 | Aries Marine and Engineering Services | `11285` | Aries Marine and Engineering Services | matched a live customer (account number) |
| 11286 | WAHAT MALIHA PHARMACY BRANCH 1 | `11286` | WAHAT MALIHA PHARMACY BRANCH 1 | matched a live customer (account number) |
| 11287 | AL HAMAD BUILDING CONTRACTING CO. LLC | `11287` | AL HAMAD BUILDING CONTRACTING CO. LLC | matched a live customer (account number) |
| 11288 | HAPPY FUN LLC LABOUR CAMP | `11288` | HAPPY FUN LLC LABOUR CAMP | matched a live customer (account number) |
| 11289 | RUKN ALRAMLAH GENTS SALON | `11289` | RUKN ALRAMLAH GENTS SALON | matched a live customer (account number) |
| 11291 | AL AMIN ALUMINIUM | `11291` | AL AMIN ALUMINIUM | matched a live customer (account number) |
| 11292 | SEYOH MOSQUE KHADEEJA TAYYEB ABDAL GAFOOR | `11292` | SEYOH MOSQUE KHADEEJA TAYYEB ABDAL GAFOOR | matched a live customer (account number) |
| 11293 | EASY LIFE SUPERMARKET LLC SP | `11293` | EASY LIFE SUPERMARKET LLC SP | matched a live customer (account number) |
| 11294 | Villa No 42 | `11294` | Villa No 42 | matched a live customer (account number) |
| 11295 | Aryaas Gourmet Veg Restaurant L.L.C | `11295` | Aryaas Gourmet Veg Restaurant L.L.C | matched a live customer (account number) |
| 11296 | SAMAR TOWER & JAHRATH AL NAHDA BUILDING | `11296` | SAMAR TOWER & JAHRATH AL NAHDA BUILDING | matched a live customer (account number) |
| 11297 | MOHD.SHAH ALAM SWEETS.NUTS TR LLC | `11297` | MOHD.SHAH ALAM SWEETS.NUTS TR LLC | matched a live customer (account number) |
| 11298 | AL HELAL REALESTATE | `11298` | AL HELAL REALESTATE | matched a live customer (account number) |
| 11311 | Al AMAAL ENGLISH HIGH SCHOOL | `11311` | Al AMAAL ENGLISH HIGH SCHOOL | matched a live customer (account number) |
| 11312 | Gulf Rock Engineering LLC | `11312` | Gulf Rock Engineering LLC | matched a live customer (account number) |
| 11313 | AL KHAFAYEF AL HARAH RESTURANT | `11313` | AL KHAFAYEF AL HARAH RESTURANT | matched a live customer (account number) |
| 11314 | MADINAT LIWA SUPER MARKET | `11314` | MADINAT LIWA SUPER MARKET | matched a live customer (account number) |
| 11315 | AUSTIN FITNESS | `11315` | AUSTIN FITNESS | matched a live customer (account number) |
| 11316 | AL MARKAZ PHARMACY LLC | `11316` | AL MARKAZ PHARMACY LLC | matched a live customer (account number) |
| 11317 | SALSA RESTURANT LLC-SHJ BR | `11317` | SALSA RESTURANT LLC-SHJ BR | matched a live customer (account number) |
| 11318 | MOHAMMAD RUBEL GROCERY | `11318` | MOHAMMAD RUBEL GROCERY | matched a live customer (account number) |
| 11319 | AL SHAMS AL SATHAA LAUNDRY | `11319` | AL SHAMS AL SATHAA LAUNDRY | matched a live customer (account number) |
| 11321 | Brilliant International Private School | `11321` | Brilliant International Private School | matched a live customer (account number) |
| 11322 | Aryaas Gourmet Veg Restaurant LLC- Shj.Br-Br | `11322` | Aryaas Gourmet Veg Restaurant LLC- Shj.Br-Br | matched a live customer (account number) |
| 11323 | Aryaas Gourmet Veg Restaurant LLC- Shj.Br-Br 1 | `11323` | Aryaas Gourmet Veg Restaurant LLC- Shj.Br-Br 1 | matched a live customer (account number) |
| 11324 | Aryaas Gourmet Veg Restaurant LLC | `11324` | Aryaas Gourmet Veg Restaurant LLC | matched a live customer (account number) |
| 11325 | Aryaas Gourmet Alqusais Veg Rest LLC | `11325` | Aryaas Gourmet Alqusais Veg Rest LLC | matched a live customer (account number) |
| 11326 | AL AFIA RESTAURANT | `11326` | AL AFIA RESTAURANT | matched a live customer (account number) |
| 11327 | AL ATLAL ROASTRY | `11327` | AL ATLAL ROASTRY | matched a live customer (account number) |
| 11328 | Wall Street Exchange Centre LLC | `11328` | Wall Street Exchange Centre LLC | matched a live customer (account number) |
| 11329 | AL MAKHMAL FOOD STUFF TR | `11329` | AL MAKHMAL FOOD STUFF TR | matched a live customer (account number) |
| 11331 | TAJ AL NEJOUM GENTS SALON-BRANCH 2 | `11331` | TAJ AL NEJOUM GENTS SALON-BRANCH 2 | matched a live customer (account number) |
| 11332 | OLD CAFÉ SHJ BR | `11332` | OLD CAFÉ SHJ BR | matched a live customer (account number) |
| 11333 | NEW GENERATION  FOOD SUPPLEMENTS TRADING LLC (SHJ BR 1) | `11333` | NEW GENERATION  FOOD SUPPLEMENTS TRADING LLC (SHJ BR 1) | matched a live customer (account number) |
| 11335 | A D N H CATERING - L.L.C - O.P.C | `11335` | A D N H CATERING - L.L.C - O.P.C | matched a live customer (account number) |
| 11336 | Shaikha Hamdan Rashid Binkhadim | `11336` | Shaikha Hamdan Rashid Binkhadim | matched a live customer (account number) |
| 11337 | SHARJAH FALCON CAFETERIA | `11337` | SHARJAH FALCON CAFETERIA | matched a live customer (account number) |
| 11339 | SMOKED MEAT HOUSE REST.LLC | `11339` | SMOKED MEAT HOUSE REST.LLC | matched a live customer (account number) |
| 11341 | MASTER CHEF REST.LLC SOLE PROPRIETORSHIP | `11341` | MASTER CHEF REST.LLC SOLE PROPRIETORSHIP | matched a live customer (account number) |
| 11342 | Al Taneen Al Aswad Karate | `11342` | Al Taneen Al Aswad Karate | matched a live customer (account number) |
| 11343 | SAHARA FITNESS | `11343` | SAHARA FITNESS | matched a live customer (account number) |
| 11344 | M - 1 SHIPPING | `11344` | M - 1 SHIPPING | matched a live customer (account number) |
| 11345 | FRESH COOKIES CORNER | `11345` | FRESH COOKIES CORNER | matched a live customer (account number) |
| 11346 | KHAMIS HASSAN KHAMIS HASSAN ALSHAMSI | `11346` | KHAMIS HASSAN KHAMIS HASSAN ALSHAMSI | matched a live customer (account number) |
| 11347 | AL NOUF REAL ESTATE LLC SP | `11347` | AL NOUF REAL ESTATE LLC SP | matched a live customer (account number) |
| 11348 | IRSHAD SUPERMARKET | `11348` | IRSHAD SUPERMARKET | matched a live customer (account number) |
| 11349 | SILEVR WING CORNER LADIES SALOON | `11349` | SILEVR WING CORNER LADIES SALOON | matched a live customer (account number) |
| 11351 | AL FARAJ BUILDING , DUBAI- UAE | `11351` | AL FARAJ BUILDING , DUBAI- UAE | matched a live customer (account number) |
| 11352 | BUN & BURR CAFE | `11352` | BUN & BURR CAFE | matched a live customer (account number) |
| 11353 | HAMARIYA FREE ZONE MUNCIPALITY ACCOMMODATION | `11353` | HAMARIYA FREE ZONE MUNCIPALITY ACCOMMODATION | matched a live customer (account number) |
| 11354 | AL QAED INTERNATIONAL GENERAL TRADING LLC ACCOMMODATION | `11354` | AL QAED INTERNATIONAL GENERAL TRADING LLC ACCOMMODATION | matched a live customer (account number) |
| 11355 | MAZAYA REAL ESTATE | `11355` | MAZAYA REAL ESTATE | matched a live customer (account number) |
| 11356 | CASEARS RESTTAURANT CONFECTIONERY | `11356` | CASEARS RESTTAURANT CONFECTIONERY | matched a live customer (account number) |
| 11357 | PAN GULF FURNITURE | `11357` | PAN GULF FURNITURE | matched a live customer (account number) |
| 11358 | BURJ BABIL FOOD STOFF TR LLC | `11358` | BURJ BABIL FOOD STOFF TR LLC | matched a live customer (account number) |
| 11359 | BIRYANI BHAVAN REST | `11359` | BIRYANI BHAVAN REST | matched a live customer (account number) |
| 11361 | SHIFA RASHID MUHAMMAD RASHID KHALIQ | `11361` | SHIFA RASHID MUHAMMAD RASHID KHALIQ | matched a live customer (account number) |
| 11362 | LORIS RESTAURANT LLC - SOLE PROPRIETORSHIP | `11362` | LORIS RESTAURANT LLC - SOLE PROPRIETORSHIP | matched a live customer (account number) |
| 11363 | GOLDEN SILK RESTAURANT | `11363` | GOLDEN SILK RESTAURANT | matched a live customer (account number) |
| 11364 | CHINA JIANGUS INTERNATIONAL CONSTRUCTION CO (LLC) | `11364` | CHINA JIANGUS INTERNATIONAL CONSTRUCTION CO (LLC) | matched a live customer (account number) |
| 11365 | GLOBAL STAR ENGINEERING | `11365` | GLOBAL STAR ENGINEERING | matched a live customer (account number) |
| 11366 | MOHAMMED SHAH ALAM TR L.L.C | `11366` | MOHAMMED SHAH ALAM TR L.L.C | matched a live customer (account number) |
| 11367 | A S G Management Services LLC | `11367` | A S G Management Services LLC | matched a live customer (account number) |
| 11368 | AJ Industries LLC | `11368` | AJ Industries LLC | matched a live customer (account number) |
| 11369 | BAB AL QASIMIA GROCERY | `11369` | BAB AL QASIMIA GROCERY | matched a live customer (account number) |
| 11371 | CITY MEDICAL CENTER/ (S.P.S - L.L.C) | `11371` | CITY MEDICAL CENTER/ (S.P.S - L.L.C) | matched a live customer (account number) |
| 11372 | FAYSAL HASSAN GROCERY | `11372` | FAYSAL HASSAN GROCERY | matched a live customer (account number) |
| 11373 | SABIN ENGINEERING FZC | `11373` | SABIN ENGINEERING FZC | matched a live customer (account number) |
| 11374 | CASEARS RESTAURANT & CONFECTIONERY | `11374` | CASEARS RESTAURANT & CONFECTIONERY | matched a live customer (account number) |
| 11375 | DAR AL MARJAN SWEETS | `11375` | DAR AL MARJAN SWEETS | matched a live customer (account number) |
| 11376 | CHILIS CAFE | `11376` | CHILIS CAFE | matched a live customer (account number) |
| 11377 | AL SAHIL AL ARABI AUTO MAINT W.SHOP | `11377` | AL SAHIL AL ARABI AUTO MAINT W.SHOP | matched a live customer (account number) |
| 11378 | AL AYMEM HAIRDRESSING SALOON | `11378` | AL AYMEM HAIRDRESSING SALOON | matched a live customer (account number) |
| 11379 | Al Samadi Sweets | `11379` | Al Samadi Sweets | matched a live customer (account number) |
| 11381 | Al Kubaisi Ice Factory | `11381` | Al Kubaisi Ice Factory | matched a live customer (account number) |
| 11382 | SAFARTAS SUPERMARKET LLC SOLE PROORIETORSHIP | `11382` | SAFARTAS SUPERMARKET LLC SOLE PROORIETORSHIP | matched a live customer (account number) |
| 11383 | AL MASHAEIR AL JAMILAH LADIES SALOON | `11383` | AL MASHAEIR AL JAMILAH LADIES SALOON | matched a live customer (account number) |
| 11384 | YUMMY TASTE TIME CAFETERIA LLC | `11384` | YUMMY TASTE TIME CAFETERIA LLC | matched a live customer (account number) |
| 11385 | FULL MOON RESTURANT LLC SOLE PROPRIETORSHIP | `11385` | FULL MOON RESTURANT LLC SOLE PROPRIETORSHIP | matched a live customer (account number) |
| 11386 | VILLA NO: 21- AL HAMRA - RAK | `11386` | VILLA NO: 21- AL HAMRA - RAK | matched a live customer (account number) |
| 11387 | Al Mumtaz Bldg Clean & Pest Control | `11387` | Al Mumtaz Bldg Clean & Pest Control | matched a live customer (account number) |
| 11388 | Luxe Marca Trading LLC | `11388` | Luxe Marca Trading LLC | matched a live customer (account number) |
| 11389 | YOUSOF AL ZUBAIR VILLA | `11389` | YOUSOF AL ZUBAIR VILLA | matched a live customer (account number) |
| 11391 | AL ISTANAH GAR. IRONING | `11391` | AL ISTANAH GAR. IRONING | matched a live customer (account number) |
| 11392 | STAR VOLGA RESTAURANT | `11392` | STAR VOLGA RESTAURANT | matched a live customer (account number) |
| 11393 | PIPPEN PARK NURSERY | `11393` | PIPPEN PARK NURSERY | matched a live customer (account number) |
| 11394 | DALLAS MEDICAL CENTER | `11394` | DALLAS MEDICAL CENTER | matched a live customer (account number) |
| 11395 | Xchem International LLC | `11395` | Xchem International LLC | matched a live customer (account number) |
| 11396 | AL AKAL AL MUMTAZ RESTURANT | `11396` | AL AKAL AL MUMTAZ RESTURANT | matched a live customer (account number) |
| 11397 | Sand  Hills Building Contg L.L.C | `11397` | Sand  Hills Building Contg L.L.C | matched a live customer (account number) |
| 11398 | AL RAMZ REAL ESTATE L L C . DUBAI | `11398` | AL RAMZ REAL ESTATE L L C . DUBAI | matched a live customer (account number) |
| 11399 | MAQAR AL AMAN REAL ESTATE - MUJARRA BLDG | `11399` | MAQAR AL AMAN REAL ESTATE - MUJARRA BLDG | matched a live customer (account number) |
| 11411 | LAHDAHT JAMAL BEAUTY CENTRE | `11411` | LAHDAHT JAMAL BEAUTY CENTRE | matched a live customer (account number) |
| 11412 | Replika Restuarant | `11412` | Replika Restuarant | matched a live customer (account number) |
| 11413 | Al Itqan American School | `11413` | Al Itqan American School | matched a live customer (account number) |
| 11414 | Fly Me Spa | `11414` | Fly Me Spa | matched a live customer (account number) |
| 11415 | Emax Al Wahda Sharjah | `11415` | Emax Al Wahda Sharjah | matched a live customer (account number) |
| 11416 | ROOTS MEDICAL CENTRE L L C | `11416` | ROOTS MEDICAL CENTRE L L C | matched a live customer (account number) |
| 11417 | Pankoul Furniture | `11417` | Pankoul Furniture | matched a live customer (account number) |
| 11418 | Sahab - 1 Building Ajman | `11418` | Sahab - 1 Building Ajman | matched a live customer (account number) |
| 11419 | Amoudo Bakery & Sweets | `11419` | Amoudo Bakery & Sweets | matched a live customer (account number) |
| 11421 | Shamla Mandi Restuarant | `11421` | Shamla Mandi Restuarant | matched a live customer (account number) |
| 11422 | Mazrat Al Fawakeh Supermarket | `11422` | Mazrat Al Fawakeh Supermarket | matched a live customer (account number) |
| 11423 | LUZON DENTAL CLINIC | `11423` | LUZON DENTAL CLINIC | matched a live customer (account number) |
| 11424 | Emirates Taste Catering Services Food LLC | `11424` | Emirates Taste Catering Services Food LLC | matched a live customer (account number) |
| 11425 | Aiwa Plastic Products Industry LLC | `11425` | Aiwa Plastic Products Industry LLC | matched a live customer (account number) |
| 11426 | REDTAPE | `11426` | REDTAPE | matched a live customer (account number) |
| 11427 | NASAR NELLOY GEN RT LLC | `11427` | NASAR NELLOY GEN RT LLC | matched a live customer (account number) |
| 11428 | Al mamoura real estate | `11428` | Al mamoura real estate | matched a live customer (account number) |
| 11429 | Ocean basket | `11429` | Ocean basket | matched a live customer (account number) |
| 11431 | ORYX LUBES & GREASES LTD FZ | `11431` | ORYX LUBES & GREASES LTD FZ | matched a live customer (account number) |
| 11432 | Unimoni Exchange LLC | `11432` | Unimoni Exchange LLC | matched a live customer (account number) |
| 11433 | Unimoni Exchange LLC (Abu Hail) | `11433` | Unimoni Exchange LLC (Abu Hail) | matched a live customer (account number) |
| 11434 | BURJ AL RAYAN EQUIPMENT TRADING LLC | `11434` | BURJ AL RAYAN EQUIPMENT TRADING LLC | matched a live customer (account number) |
| 11435 | AL WAZZAN FOODSTUFFS FACTORY LLC | `11435` | AL WAZZAN FOODSTUFFS FACTORY LLC | matched a live customer (account number) |
| 11436 | EAST WEST HYPERMARKET L.L.C | `11436` | EAST WEST HYPERMARKET L.L.C | matched a live customer (account number) |
| 11437 | AL WANEES LADIES SALON - BR 1 | `11437` | AL WANEES LADIES SALON - BR 1 | matched a live customer (account number) |
| 11438 | AL WANEES LADIES SALON | `11438` | AL WANEES LADIES SALON | matched a live customer (account number) |
| 11439 | Shades Interiors LLC | `11439` | Shades Interiors LLC | matched a live customer (account number) |
| 11441 | Al Fayha Jewellers & Gold Factory LLC | `11441` | Al Fayha Jewellers & Gold Factory LLC | matched a live customer (account number) |
| 11442 | LABI SIMON | `11442` | LABI SIMON | matched a live customer (account number) |
| 11443 | AL NAHA LADIES SALON | `11443` | AL NAHA LADIES SALON | matched a live customer (account number) |
| 11444 | GREEN BUILDINGS FACILITY MANAGEMENT L.L.C | `11444` | GREEN BUILDINGS FACILITY MANAGEMENT L.L.C | matched a live customer (account number) |
| 11445 | NESTO HYPER MARKET L.L.C (Branch) | `11445` | NESTO HYPER MARKET L.L.C (Branch) | matched a live customer (account number) |
| 11446 | MATHAQ ALBASBOOSA SWEETS PREPARING L L C - SHJ. BR 1 | `11446` | MATHAQ ALBASBOOSA SWEETS PREPARING L L C - SHJ. BR 1 | matched a live customer (account number) |
| 11447 | AFGHAN TURK PALACE RESTURANT | `11447` | AFGHAN TURK PALACE RESTURANT | matched a live customer (account number) |
| 11448 | Siana Technologies LLC Fz | `11448` | Siana Technologies LLC Fz | matched a live customer (account number) |
| 11449 | Nesto MMD Accommodation | `11449` | Nesto MMD Accommodation | matched a live customer (account number) |
| 11451 | Nesto Al Warsan Staff Accommodation | `11451` | Nesto Al Warsan Staff Accommodation | matched a live customer (account number) |
| 11452 | YEAST & BUTTER BAKERY L.L.C. SP - BRANCH 1 | `11452` | YEAST & BUTTER BAKERY L.L.C. SP - BRANCH 1 | matched a live customer (account number) |
| 11453 | Zed Pharma Drug LLC | `11453` | Zed Pharma Drug LLC | matched a live customer (account number) |
| 11454 | BARBAR REST RESRTAURANT LLC | `11454` | BARBAR REST RESRTAURANT LLC | matched a live customer (account number) |
| 11455 | NESTO HYPER MARKET L.L.C (Branch).   8125 | `11455` | NESTO HYPER MARKET L.L.C (Branch).   8125 | matched a live customer (account number) |
| 11456 | ROSE KING FLOWERS TRADING (L.L.C) - SHJ. BR 1 | `11456` | ROSE KING FLOWERS TRADING (L.L.C) - SHJ. BR 1 | matched a live customer (account number) |
| 11457 | Nesto Al Khan Staff Accommodation | `11457` | Nesto Al Khan Staff Accommodation | matched a live customer (account number) |
| 11458 | Abc lld | `11458` | Abc lld | matched a live customer (account number) |
| 11459 | Yas Elevators | `11459` | Yas Elevators | matched a live customer (account number) |
| 11461 | CUTFISH RESTURANT MANAGEMENT | `11461` | CUTFISH RESTURANT MANAGEMENT | matched a live customer (account number) |
| 11462 | Awaney Restaurant | `11462` | Awaney Restaurant | matched a live customer (account number) |
| 11463 | Riviera Management & Tr. Consultanncy | `11463` | Riviera Management & Tr. Consultanncy | matched a live customer (account number) |
| 11464 | K S J V Technical Services | `11464` | K S J V Technical Services | matched a live customer (account number) |
| 11465 | AL WAJEHA BUILDING CONTRACTING  L.L.C | `11465` | AL WAJEHA BUILDING CONTRACTING  L.L.C | matched a live customer (account number) |
| 11466 | EWAN HOTEL APARTMENT | `11466` | EWAN HOTEL APARTMENT | matched a live customer (account number) |
| 11467 | EWAN TOWER AJMAN | `11467` | EWAN TOWER AJMAN | matched a live customer (account number) |
| 11468 | ASG MANAGEMENT SERVICES LLC | `11468` | ASG MANAGEMENT SERVICES LLC | matched a live customer (account number) |
| 11469 | AL ARUZZ AL TAZEJ KITCHEN AND RESTAURANT L.L.C | `11469` | AL ARUZZ AL TAZEJ KITCHEN AND RESTAURANT L.L.C | matched a live customer (account number) |
| 11471 | Best Food Dip2 Camp | `11471` | Best Food Dip2 Camp | matched a live customer (account number) |
| 11472 | SRI BALAJI BHAVANN VEGETARIAN RESTAURANT L.L.C | `11472` | SRI BALAJI BHAVANN VEGETARIAN RESTAURANT L.L.C | matched a live customer (account number) |
| 11473 | Leaders Fitness & Leisure Club | `11473` | Leaders Fitness & Leisure Club | matched a live customer (account number) |
| 11474 | NASHAT FARHAN AWAD SAHAWNEH | `11474` | NASHAT FARHAN AWAD SAHAWNEH | matched a live customer (account number) |
| 11475 | NEBRASKA PAPER TRADING LLC | `11475` | NEBRASKA PAPER TRADING LLC | matched a live customer (account number) |
| 11476 | Medco Contracting LLC | `11476` | Medco Contracting LLC | matched a live customer (account number) |
| 11477 | Al Ahalia Exchange - Burdubai | `11477` | Al Ahalia Exchange - Burdubai | matched a live customer (account number) |
| 11478 | ABC LLC | `11478` | ABC LLC | matched a live customer (account number) |
| 11479 | SAAD ARBEED JLUWI AL ARBEED | `11479` | SAAD ARBEED JLUWI AL ARBEED | matched a live customer (account number) |
| 11481 | Liva insurance | `11481` | Liva insurance | matched a live customer (account number) |
| 11482 | MOUHAJER INTERNATIONAL DESIGN | `11482` | MOUHAJER INTERNATIONAL DESIGN | matched a live customer (account number) |
| 11483 | H B S .L L C,SAFAD BUILDING | `11483` | H B S .L L C,SAFAD BUILDING | matched a live customer (account number) |
| 11484 | Iran Insurance | `11484` | Iran Insurance | matched a live customer (account number) |
| 11485 | Replika Restaurant | `11485` | Replika Restaurant | matched a live customer (account number) |
| 11486 | MR ZIYAD | `11486` | MR ZIYAD | matched a live customer (account number) |
| 11488 | Late Mohammad Abdulla Shamsudeen Al Kandari | `11488` | Late Mohammad Abdulla Shamsudeen Al Kandari | matched a live customer (account number) |
| 11489 | Muhayer Abdulla Saeed Alketbi | `11489` | Muhayer Abdulla Saeed Alketbi | matched a live customer (account number) |
| 11491 | Oh My Desk | `11491` | Oh My Desk | matched a live customer (account number) |
| 11492 | SIGNA FOOD PRODUCTS LLC | `11492` | SIGNA FOOD PRODUCTS LLC | matched a live customer (account number) |
| 11493 | Evo Green | `11493` | Evo Green | matched a live customer (account number) |
| 11494 | Caramel Beauty center & Spa | `11494` | Caramel Beauty center & Spa | matched a live customer (account number) |
| 11495 | Al Tawar Villa | `11495` | Al Tawar Villa | matched a live customer (account number) |
| 11496 | D Realtors Real Estate | `11496` | D Realtors Real Estate | matched a live customer (account number) |
| 11497 | Petroserve Interntional | `11497` | Petroserve Interntional | matched a live customer (account number) |
| 11498 | George | `11498` | George | matched a live customer (account number) |
| 11499 | HELEN AND SONS BUSINESS CONSULTANCY | `11499` | HELEN AND SONS BUSINESS CONSULTANCY | matched a live customer (account number) |
| 11511 | Integra Technologies FZE | `11511` | Integra Technologies FZE | matched a live customer (account number) |
| 11512 | PrimeFM Building maintenance | `11512` | PrimeFM Building maintenance | matched a live customer (account number) |
| 11513 | Al zarouni International Equipments L.L.C | `11513` | Al zarouni International Equipments L.L.C | matched a live customer (account number) |
| 11514 | Swiss International FZ LCC | `11514` | Swiss International FZ LCC | matched a live customer (account number) |
| 11515 | SABIS INTERNATIONAL SCHOOL | `11515` | SABIS INTERNATIONAL SCHOOL | matched a live customer (account number) |
| 11516 | AL Ramz Real Estate Accommodation | `11516` | AL Ramz Real Estate Accommodation | matched a live customer (account number) |
| 11517 | AL BUSTAN BUILDING | `11517` | AL BUSTAN BUILDING | matched a live customer (account number) |
| 11518 | TRANSDELTA INTERNATIONAL INDUSTRIES LLC | `11518` | TRANSDELTA INTERNATIONAL INDUSTRIES LLC | matched a live customer (account number) |
| 11519 | OPULAXE CAFE-SOLE PROPRITORSHIP L.L.C | `11519` | OPULAXE CAFE-SOLE PROPRITORSHIP L.L.C | matched a live customer (account number) |
| 11521 | Bobby Thomas | `11521` | Bobby Thomas | matched a live customer (account number) |
| 11522 | Raju | `11522` | Raju | matched a live customer (account number) |
| 11523 | NESIR AL MADINA SUPERMARKET | `11523` | NESIR AL MADINA SUPERMARKET | matched a live customer (account number) |
| 11524 | AMIRI BUILDING | `11524` | AMIRI BUILDING | matched a live customer (account number) |
| 11526 | Prominent Star Machines Spare Parts TR LLC | `11526` | Prominent Star Machines Spare Parts TR LLC | matched a live customer (account number) |
| 11527 | FANDOM RESTAURANT LLC | `11527` | FANDOM RESTAURANT LLC | matched a live customer (account number) |
| 11528 | AL NADA SPECIALIST MEDICAL CENTRE LLC S.P | `11528` | AL NADA SPECIALIST MEDICAL CENTRE LLC S.P | matched a live customer (account number) |
| 11529 | AL TAMAM FURNITURE MOVERS L.L.C | `11529` | AL TAMAM FURNITURE MOVERS L.L.C | matched a live customer (account number) |
| 11531 | Bassam Tower | `11531` | Bassam Tower | matched a live customer (account number) |
| 11532 | Sheela | `11532` | Sheela | matched a live customer (account number) |
| 11533 | Ocean Rubber Factory LLC | `11533` | Ocean Rubber Factory LLC | matched a live customer (account number) |
| 11534 | Vision printing Accommodation | `11534` | Vision printing Accommodation | matched a live customer (account number) |
| 11536 | AL MASHHOOR OFFICE EQUIPMENT TR | `11536` | AL MASHHOOR OFFICE EQUIPMENT TR | matched a live customer (account number) |
| 11537 | ACUBE INDUSTRIES LLC | `11537` | ACUBE INDUSTRIES LLC | matched a live customer (account number) |
| 11538 | Rahma Mohammed Abdulla Saif Al Shamsi (Muweilah 2157 Bldg) | `11538` | Rahma Mohammed Abdulla Saif Al Shamsi (Muweilah 2157 Bldg) | matched a live customer (account number) |
| 11539 | Ocean Oilfield Driling Rigs & Marine Eng | `11539` | Ocean Oilfield Driling Rigs & Marine Eng | matched a live customer (account number) |
| 11541 | Obaid Essa Ahmed Alsalman | `11541` | Obaid Essa Ahmed Alsalman | matched a live customer (account number) |
| 11542 | Jon Allsopp | `11542` | Jon Allsopp | matched a live customer (account number) |
| 11543 | Federal Exchange | `11543` | Federal Exchange | matched a live customer (account number) |
| 11544 | Hot Bowl Restaurant LLC | `11544` | Hot Bowl Restaurant LLC | matched a live customer (account number) |
| 11545 | ABO OSAMO | `11545` | ABO OSAMO | matched a live customer (account number) |
| 11546 | VENCO  IMITIAZ CONTRACTING CO LLC | `11546` | VENCO  IMITIAZ CONTRACTING CO LLC | matched a live customer (account number) |
| 11547 | Four Links Insulation | `11547` | Four Links Insulation | matched a live customer (account number) |
| 11548 | OXYGEN GENERAL MAINT CONT L.L.C | `11548` | OXYGEN GENERAL MAINT CONT L.L.C | matched a live customer (account number) |
| 11549 | MANARAT MUWAILEH REST | `11549` | MANARAT MUWAILEH REST | matched a live customer (account number) |
| 11551 | SHIFA MUWAILEH MEDICAL CENTER L.L.C | `11551` | SHIFA MUWAILEH MEDICAL CENTER L.L.C | matched a live customer (account number) |
| 11552 | Maryam Mohammed Ali Fajar | `11552` | Maryam Mohammed Ali Fajar | matched a live customer (account number) |
| 11553 | SAIF MUSABBEH ABDULLA MAJED AL MESAFRI | `11553` | SAIF MUSABBEH ABDULLA MAJED AL MESAFRI | matched a live customer (account number) |
| 11554 | Mohammed Abdullah Shamsudheen Al Kandary | `11554` | Mohammed Abdullah Shamsudheen Al Kandary | matched a live customer (account number) |
| 11555 | Abdel Rahman Saleh Ahmed Al Ali | `11555` | Abdel Rahman Saleh Ahmed Al Ali | matched a live customer (account number) |
| 11556 | THARIK ABDUL AZEEZ (SHIFA AL JASEERA) | `11556` | THARIK ABDUL AZEEZ (SHIFA AL JASEERA) | matched a live customer (account number) |
| 11557 | AL NASSER PROPERTIES | `11557` | AL NASSER PROPERTIES | matched a live customer (account number) |
| 11558 | LAND MARK RETAIL INVEST COMPANY LLC | `11558` | LAND MARK RETAIL INVEST COMPANY LLC | matched a live customer (account number) |
| 11559 | P2 | `11559` | P2 | matched a live customer (account number) |
| 11561 | XESS ADVERTISING LLC | `11561` | XESS ADVERTISING LLC | matched a live customer (account number) |
| 11562 | Lulu Exchange | `11562` | Lulu Exchange | matched a live customer (account number) |
| 11563 | FATIMA ALMARZOOQI BEAUTY&SPA CENTER L.L.C | `11563` | FATIMA ALMARZOOQI BEAUTY&SPA CENTER L.L.C | matched a live customer (account number) |
| 11564 | HOUSE OF GRIL RESTAURANT | `11564` | HOUSE OF GRIL RESTAURANT | matched a live customer (account number) |
| 11565 | Giridhar Alwar | `11565` | Giridhar Alwar | matched a live customer (account number) |
| 11566 | AL MANIYA REALESTATE | `11566` | AL MANIYA REALESTATE | matched a live customer (account number) |
| 11567 | PERFECT OASIS CATERING SERVICES LLC-SP | `11567` | PERFECT OASIS CATERING SERVICES LLC-SP | matched a live customer (account number) |
| 11568 | Mohammed Al Hasoun Medical Centre | `11568` | Mohammed Al Hasoun Medical Centre | matched a live customer (account number) |
| 11569 | AL FAWZAN HAIRDRESSERS SALON .BR. 1 | `11569` | AL FAWZAN HAIRDRESSERS SALON .BR. 1 | matched a live customer (account number) |
| 11571 | AL YAM BEAUTY CENTER | `11571` | AL YAM BEAUTY CENTER | matched a live customer (account number) |
| 11572 | GOPAL&SUMAN ROASTRY LLC | `11572` | GOPAL&SUMAN ROASTRY LLC | matched a live customer (account number) |
| 11573 | Huraiz Rashed villa | `11573` | Huraiz Rashed villa | matched a live customer (account number) |
| 11574 | HOME DEALS REAL ESTATE | `11574` | HOME DEALS REAL ESTATE | matched a live customer (account number) |
| 11575 | THEATRICAL ASSOCIATION | `11575` | THEATRICAL ASSOCIATION | matched a live customer (account number) |
| 11576 | TABASCO TECH CONT LLC | `11576` | TABASCO TECH CONT LLC | matched a live customer (account number) |
| 11577 | Cihan Coskun | `11577` | Cihan Coskun | matched a live customer (account number) |
| 11578 | Trends Research Centre | `11578` | Trends Research Centre | matched a live customer (account number) |
| 11579 | MR OBAID ESSA | `11579` | MR OBAID ESSA | matched a live customer (account number) |
| 11581 | AL KATAR SUPERMARKET | `11581` | AL KATAR SUPERMARKET | matched a live customer (account number) |
| 11582 | Noor Al Huda Skill Training Centre | `11582` | Noor Al Huda Skill Training Centre | matched a live customer (account number) |
| 11583 | FIC RESTAURANT L.L.C | `11583` | FIC RESTAURANT L.L.C | matched a live customer (account number) |
| 11584 | FISH ISLAND SEA RESTAURANT L.L.C | `11584` | FISH ISLAND SEA RESTAURANT L.L.C | matched a live customer (account number) |
| 11585 | AL MANARAH AL MUDHIA CAFTERIA | `11585` | AL MANARAH AL MUDHIA CAFTERIA | matched a live customer (account number) |
| 11586 | SUSH CORNER | `11586` | SUSH CORNER | matched a live customer (account number) |
| 11587 | BOSPORUS | `11587` | BOSPORUS | matched a live customer (account number) |
| 11588 | Euroimmun Medical Diagnostics | `11588` | Euroimmun Medical Diagnostics | matched a live customer (account number) |
| 11589 | Capital Engineering Consultancy | `11589` | Capital Engineering Consultancy | matched a live customer (account number) |
| 11591 | Peritos Flame | `11591` | Peritos Flame | matched a live customer (account number) |
| 11592 | Tea Junction | `11592` | Tea Junction | matched a live customer (account number) |
| 11593 | Sports Restaurant Cafe | `11593` | Sports Restaurant Cafe | matched a live customer (account number) |
| 11594 | Shaikha Amal Khalid Sultan Saqer Alqasimi | `11594` | Shaikha Amal Khalid Sultan Saqer Alqasimi | matched a live customer (account number) |
| 11595 | AL FARAJ BUILDING -MUTHEENA | `11595` | AL FARAJ BUILDING -MUTHEENA | matched a live customer (account number) |
| 11596 | Sarah Ali Pharmacy LLC | `11596` | Sarah Ali Pharmacy LLC | matched a live customer (account number) |
| 11597 | Maitha Mohammed Abdulla Saif Al Shamsi(Muwailah 3649) | `11597` | Maitha Mohammed Abdulla Saif Al Shamsi(Muwailah 3649) | matched a live customer (account number) |
| 11598 | Hamad Ateeq Shames Ahmed Alameri YARMOOK BLDG | `11598` | Hamad Ateeq Shames Ahmed Alameri YARMOOK BLDG | matched a live customer (account number) |
| 11599 | AZCB REAL ESTATE | `11599` | AZCB REAL ESTATE | matched a live customer (account number) |
| 11611 | Ahmed Mishal | `11611` | Ahmed Mishal | matched a live customer (account number) |
| 11612 | Holiday Factory Package Tours LLC | `11612` | Holiday Factory Package Tours LLC | matched a live customer (account number) |
| 11613 | AL YASSAT REAL ESTATE MANAGEMENT | `11613` | AL YASSAT REAL ESTATE MANAGEMENT | matched a live customer (account number) |
| 11614 | Royal Treat Catering Services | `11614` | Royal Treat Catering Services | matched a live customer (account number) |
| 11615 | RUKN AL RAHA LADIES SALON | `11615` | RUKN AL RAHA LADIES SALON | matched a live customer (account number) |
| 11616 | Artisan Bakers | `11616` | Artisan Bakers | matched a live customer (account number) |
| 11617 | Mohammad Saheb | `11617` | Mohammad Saheb | matched a live customer (account number) |
| 11618 | TAREEQ AL HANA GROCERY | `11618` | TAREEQ AL HANA GROCERY | matched a live customer (account number) |
| 11619 | Solomia Home Furniture Trading Co LLC | `11619` | Solomia Home Furniture Trading Co LLC | matched a live customer (account number) |
| 11621 | Al-Hazzaa Building Contracting Company – L.L.C. | `11621` | Al-Hazzaa Building Contracting Company – L.L.C. | matched a live customer (account number) |
| 11622 | Tea Oasis Cafe | `11622` | Tea Oasis Cafe | matched a live customer (account number) |
| 11623 | GERMAN PRINTING PRESS LLC | `11623` | GERMAN PRINTING PRESS LLC | matched a live customer (account number) |
| 11624 | Petroserve International | `11624` | Petroserve International | matched a live customer (account number) |
| 11625 | HONORE BAKEHOUSE | `11625` | HONORE BAKEHOUSE | matched a live customer (account number) |
| 11626 | MERINT LLC | `11626` | MERINT LLC | matched a live customer (account number) |
| 11627 | Bait AlMualimGrill Restaurant | `11627` | Bait AlMualimGrill Restaurant | matched a live customer (account number) |
| 11628 | Arun | `11628` | Arun | matched a live customer (account number) |
| 11629 | MUMTAZ HYPER MARKET L.L.C | `11629` | MUMTAZ HYPER MARKET L.L.C | matched a live customer (account number) |
| 11631 | AL BUSTAN BACKERY & SWEETS LLC | `11631` | AL BUSTAN BACKERY & SWEETS LLC | matched a live customer (account number) |
| 11632 | COOK & CO | `11632` | COOK & CO | matched a live customer (account number) |
| 11633 | SHIFA AL JAZEERA MEDICAL CENTRE(MUWAILEH BRANCH) | `11633` | SHIFA AL JAZEERA MEDICAL CENTRE(MUWAILEH BRANCH) | matched a live customer (account number) |
| 11634 | APEX RESTAURANT | `11634` | APEX RESTAURANT | matched a live customer (account number) |
| 11635 | APEX RESTAURANT -(Pancake House) | `11635` | APEX RESTAURANT -(Pancake House) | matched a live customer (account number) |
| 11636 | DURAT AL KHALEEK FOOD STUFF CATERING & HOSPITALITY SERVICES | `11636` | DURAT AL KHALEEK FOOD STUFF CATERING & HOSPITALITY SERVICES | matched a live customer (account number) |
| 11637 | NEW GENERATION FOOD SUPPLEMENT TRADING | `11637` | NEW GENERATION FOOD SUPPLEMENT TRADING | matched a live customer (account number) |
| 11638 | GOLD CENTER BUILDING | `11638` | GOLD CENTER BUILDING | matched a live customer (account number) |
| 11639 | DABABIS GROCERY | `11639` | DABABIS GROCERY | matched a live customer (account number) |
| 11641 | MASAR BODY BUILDING | `11641` | MASAR BODY BUILDING | matched a live customer (account number) |
| 11642 | GREEN ROOM DECOR CONT LLC | `11642` | GREEN ROOM DECOR CONT LLC | matched a live customer (account number) |
| 11643 | Rahal General Enterprises FZE | `11643` | Rahal General Enterprises FZE | matched a live customer (account number) |
| 11644 | RUKN ALQAHWA CAFETERIA | `11644` | RUKN ALQAHWA CAFETERIA | matched a live customer (account number) |
| 11645 | AYES ABDULRAHMAN | `11645` | AYES ABDULRAHMAN | matched a live customer (account number) |
| 11646 | JUNE 11 BUILDING | `11646` | JUNE 11 BUILDING | matched a live customer (account number) |
| 11647 | VKM KALARI TRADITIONAL MARTIAL ARTS CLUB  LLC.SHJ .BR | `11647` | VKM KALARI TRADITIONAL MARTIAL ARTS CLUB  LLC.SHJ .BR | matched a live customer (account number) |
| 11648 | VKM KALARI TRADITIONAL MARTIAL ARTS CLUB  LLC.SHJ .BR -BRANCH 1 | `11648` | VKM KALARI TRADITIONAL MARTIAL ARTS CLUB  LLC.SHJ .BR -BRANCH 1 | matched a live customer (account number) |
| 11649 | BASMA ABDALLA MURAD ALI AL MAAZMI & PARTNERS (Muwailah Bldg 1601) | `11649` | BASMA ABDALLA MURAD ALI AL MAAZMI & PARTNERS (Muwailah Bldg 1601) | matched a live customer (account number) |
| 11651 | COMFORT REAL ESTATE | `11651` | COMFORT REAL ESTATE | matched a live customer (account number) |
| 11652 | JUN 11 BUILDING | `11652` | JUN 11 BUILDING | matched a live customer (account number) |
| 11653 | LA VOGUE EXPERTS POLY CLINIC L.L.C | `11653` | LA VOGUE EXPERTS POLY CLINIC L.L.C | matched a live customer (account number) |
| 11654 | First Class Holiday Homes | `11654` | First Class Holiday Homes | matched a live customer (account number) |
| 11655 | TAWLAT AL JERAN RESTAURANT L.L.C | `11655` | TAWLAT AL JERAN RESTAURANT L.L.C | matched a live customer (account number) |
| 11656 | CORNICHE HOTEL SHARJAH | `11656` | CORNICHE HOTEL SHARJAH | matched a live customer (account number) |
| 11657 | SHARJAH SPECIALIST MEDICAL CENTER LLC | `11657` | SHARJAH SPECIALIST MEDICAL CENTER LLC | matched a live customer (account number) |
| 11658 | BUHAIRAT ADEN CAFETRIA | `11658` | BUHAIRAT ADEN CAFETRIA | matched a live customer (account number) |
| 11659 | MONTYS FOODS KITCHEN CO L.L.C | `11659` | MONTYS FOODS KITCHEN CO L.L.C | matched a live customer (account number) |
| 11661 | SHAMA GROCERY | `11661` | SHAMA GROCERY | matched a live customer (account number) |
| 11666 | SAJA SPA FOR MEN PER PERSON COMPANY.LLC | `11666` | SAJA SPA FOR MEN PER PERSON COMPANY.LLC | matched a live customer (account number) |
| 11667 | ML STAR DECORATION WORKS | `11667` | ML STAR DECORATION WORKS | matched a live customer (account number) |
| 11668 | H B S L, SAFAD BUILDING | `11668` | H B S L, SAFAD BUILDING | matched a live customer (account number) |
| 11669 | QREW BILLIARD & POOL ROOM L.L.C | `11669` | QREW BILLIARD & POOL ROOM L.L.C | matched a live customer (account number) |
| 11671 | AWAEL PRINTING PRESS L.L.C | `11671` | AWAEL PRINTING PRESS L.L.C | matched a live customer (account number) |
| 11672 | Ghazal Muwaileh Hairdressing Salon | `11672` | Ghazal Muwaileh Hairdressing Salon | matched a live customer (account number) |
| 11673 | RAWDHAT AL JAMAL BEAUTY CENTER-BRANCH1 | `11673` | RAWDHAT AL JAMAL BEAUTY CENTER-BRANCH1 | matched a live customer (account number) |
| 11674 | AL HIKMA REAL ESTATE | `11674` | AL HIKMA REAL ESTATE | matched a live customer (account number) |
| 11675 | MOHAMED ALHASOUN MEDICAL CENTER LLC | `11675` | MOHAMED ALHASOUN MEDICAL CENTER LLC | matched a live customer (account number) |
| 11676 | URBAN SANDWICH SHOP DMCC | `11676` | URBAN SANDWICH SHOP DMCC | matched a live customer (account number) |
| 11677 | SHIFA AL JAZEERA MEDICAL CENTER -BRANCH1 | `11677` | SHIFA AL JAZEERA MEDICAL CENTER -BRANCH1 | matched a live customer (account number) |
| 11678 | GOLDEN WORLD GENT SALON | `11678` | GOLDEN WORLD GENT SALON | matched a live customer (account number) |
| 11679 | ALI ALSHAMSI BUILDING | `11679` | ALI ALSHAMSI BUILDING | matched a live customer (account number) |
| 11681 | ALSADAF AL AHMAR RES LLC SOLE PROPRIETORSHIP | `11681` | ALSADAF AL AHMAR RES LLC SOLE PROPRIETORSHIP | matched a live customer (account number) |
| 11682 | MALLAH AL FREEJ CAFETERIA | `11682` | MALLAH AL FREEJ CAFETERIA | matched a live customer (account number) |
| 11683 | ALZAN BUILDING MATERIALS TRADING LLC | `11683` | ALZAN BUILDING MATERIALS TRADING LLC | matched a live customer (account number) |
| 11684 | ALI OBAID ALI AL GHAZAL AL SHAMSI | `11684` | ALI OBAID ALI AL GHAZAL AL SHAMSI | matched a live customer (account number) |
| 11685 | AL MUKHADRAM BODY BUILDING GYM | `11685` | AL MUKHADRAM BODY BUILDING GYM | matched a live customer (account number) |
| 11686 | TAREEQ AL SAHRA CAFETERIA | `11686` | TAREEQ AL SAHRA CAFETERIA | matched a live customer (account number) |
| 11687 | YANABEE ALWAHA REST.LLC | `11687` | YANABEE ALWAHA REST.LLC | matched a live customer (account number) |
| 11688 | MEAL PREPARATION AND  HOSPITALITY SERVICES | `11688` | MEAL PREPARATION AND  HOSPITALITY SERVICES | matched a live customer (account number) |
| 11689 | OLD CAF - SHJ. BR | `11689` | OLD CAF - SHJ. BR | matched a live customer (account number) |
| 11691 | ALMAKHMAL FOOD STUFF TR. | `11691` | ALMAKHMAL FOOD STUFF TR. | matched a live customer (account number) |
| 11692 | Ali Mohammed Mehdi Mohammed (TOPAZ Building) | `11692` | Ali Mohammed Mehdi Mohammed (TOPAZ Building) | matched a live customer (account number) |
| 11693 | Wall to wall general contracting | `11693` | Wall to wall general contracting | matched a live customer (account number) |
| 11694 | Ali Abdualrazagh | `11694` | Ali Abdualrazagh | matched a live customer (account number) |
| 11695 | JABAL AL KHOOR GROCERY | `11695` | JABAL AL KHOOR GROCERY | matched a live customer (account number) |
| 11696 | DUNES TOWER | `11696` | DUNES TOWER | matched a live customer (account number) |
| 11697 | ALQASIMIA HOUSE | `11697` | ALQASIMIA HOUSE | matched a live customer (account number) |
| 11698 | Humaid Bin Butty | `11698` | Humaid Bin Butty | matched a live customer (account number) |
| 11699 | Al Jazzat Real Estate | `11699` | Al Jazzat Real Estate | matched a live customer (account number) |
| 11711 | AAM Properties L.L.C | `11711` | AAM Properties L.L.C | matched a live customer (account number) |
| 11712 | Hamad Muhair Abdulla Saeed Alketbi (Muweilah 2268) | `11712` | Hamad Muhair Abdulla Saeed Alketbi (Muweilah 2268) | matched a live customer (account number) |
| 11713 | SAEED ABDULLA MUFTAH ALKHATERI | `11713` | SAEED ABDULLA MUFTAH ALKHATERI | matched a live customer (account number) |
| 11714 | FATIMA SULTAN SAIF ALMIDFA & PARTNERS (BUTINA BLDG) | `11714` | FATIMA SULTAN SAIF ALMIDFA & PARTNERS (BUTINA BLDG) | matched a live customer (account number) |
| 11715 | Majd Alowis (Muweilah Bldg 2590) | `11715` | Majd Alowis (Muweilah Bldg 2590) | matched a live customer (account number) |
| 11716 | FAISAL TOWER | `11716` | FAISAL TOWER | matched a live customer (account number) |
| 11717 | ALWARDH ALSAFRA SUPERMARKET LLC.S.P | `11717` | ALWARDH ALSAFRA SUPERMARKET LLC.S.P | matched a live customer (account number) |
| 11718 | AL MANARA ALJAMELA GROCERY | `11718` | AL MANARA ALJAMELA GROCERY | matched a live customer (account number) |
| 11719 | Raef Mahmoud Ahmad Al Kilani | `11719` | Raef Mahmoud Ahmad Al Kilani | matched a live customer (account number) |
| 11721 | Youssef Ahmed Al-Zarouni[Office Building] | `11721` | Youssef Ahmed Al-Zarouni[Office Building] | matched a live customer (account number) |
| 11722 | Hussein Issa Al-Shiri [labor camp building | `11722` | Hussein Issa Al-Shiri [labor camp building | matched a live customer (account number) |
| 11723 | Ali Al-Abdouli [Naba'a & Qali'ah building owners] | `11723` | Ali Al-Abdouli [Naba'a & Qali'ah building owners] | matched a live customer (account number) |
| 11724 | Abdulaziz Saud Al-Babtain.[Umm al tarafa] | `11724` | Abdulaziz Saud Al-Babtain.[Umm al tarafa] | matched a live customer (account number) |
| 11725 | HAROON ENG MAT MARKETING | `11725` | HAROON ENG MAT MARKETING | matched a live customer (account number) |
| 11726 | GULF ICE FACTORY &COLD STORAGE  PLANT 4- STAFF  ACCOMMODATION | `11726` | GULF ICE FACTORY &COLD STORAGE  PLANT 4- STAFF  ACCOMMODATION | matched a live customer (account number) |
| 11727 | AL DHAID MALL | `11727` | AL DHAID MALL | matched a live customer (account number) |
| 11728 | MANARAT ALQARAIEN GROCERY | `11728` | MANARAT ALQARAIEN GROCERY | matched a live customer (account number) |
| 11729 | Shaikha Hamdan Rashid Bin Khadim | `11729` | Shaikha Hamdan Rashid Bin Khadim | matched a live customer (account number) |
| 11731 | BARAF DESSERTS&COFFEE LLC-SHJ.BR | `11731` | BARAF DESSERTS&COFFEE LLC-SHJ.BR | matched a live customer (account number) |
| 11732 | AL YASMINAH REAL ESTATE INVESTMENT | `11732` | AL YASMINAH REAL ESTATE INVESTMENT | matched a live customer (account number) |
| 11733 | Iran Insurance Company L.L.C | `11733` | Iran Insurance Company L.L.C | matched a live customer (account number) |
| 11734 | Khalidha Jasem Serhan | `11734` | Khalidha Jasem Serhan | matched a live customer (account number) |
| 11735 | ALMUSALLA BUILDING | `11735` | ALMUSALLA BUILDING | matched a live customer (account number) |
| 11736 | AL ROLLA BUILDING | `11736` | AL ROLLA BUILDING | matched a live customer (account number) |
| 11737 | AL NABBA BUILDING | `11737` | AL NABBA BUILDING | matched a live customer (account number) |
| 11738 | NASERIYA BUILDING 1 | `11738` | NASERIYA BUILDING 1 | matched a live customer (account number) |
| 11739 | NASERIYA BUILDING 2 | `11739` | NASERIYA BUILDING 2 | matched a live customer (account number) |
| 11741 | NABBA BUILDING 2 (Saed Arbeed Jalawi Alarbeed) | `11741` | NABBA BUILDING 2 (Saed Arbeed Jalawi Alarbeed) | matched a live customer (account number) |
| 11742 | Industrial 13 Building | `11742` | Industrial 13 Building | matched a live customer (account number) |
| 11743 | BU TINA BLDG | `11743` | BU TINA BLDG | matched a live customer (account number) |
| 11744 | ALSOOR BUILDING | `11744` | ALSOOR BUILDING | matched a live customer (account number) |
| 11745 | DAR AL HOSHY LADIES SALON L.L.C | `11745` | DAR AL HOSHY LADIES SALON L.L.C | matched a live customer (account number) |
| 11746 | YARMOOK BLDG | `11746` | YARMOOK BLDG | matched a live customer (account number) |
| 11747 | YARMOOK BUILDING | `11747` | YARMOOK BUILDING | matched a live customer (account number) |
| 11748 | MUWAILAH 3649 BLDG | `11748` | MUWAILAH 3649 BLDG | matched a live customer (account number) |
| 11749 | MUWAILAH 6654 BLDG | `11749` | MUWAILAH 6654 BLDG | matched a live customer (account number) |
| 11751 | MUWAILAH 2268 BLDG | `11751` | MUWAILAH 2268 BLDG | matched a live customer (account number) |
| 11752 | MUWAILAH 1601 BLDG | `11752` | MUWAILAH 1601 BLDG | matched a live customer (account number) |
| 11753 | SALIM ALI MOHAMMED BUTTU MHEIRI &PARTNERS | `11753` | SALIM ALI MOHAMMED BUTTU MHEIRI &PARTNERS | matched a live customer (account number) |
| 11754 | LATE OBAID YAQOUB ABDALLA AL MUHERI | `11754` | LATE OBAID YAQOUB ABDALLA AL MUHERI | matched a live customer (account number) |
| 11755 | DAR ALMARJAN SWEETS | `11755` | DAR ALMARJAN SWEETS | matched a live customer (account number) |
| 11756 | EASY LIFE SUPERMARKET L.L.C SP | `11756` | EASY LIFE SUPERMARKET L.L.C SP | matched a live customer (account number) |
| 11757 | SHAMS ALNAHDA GENTS SALON | `11757` | SHAMS ALNAHDA GENTS SALON | matched a live customer (account number) |
| 11758 | AL MAWRID PRINTING & ADV. IND. LLC. | `11758` | AL MAWRID PRINTING & ADV. IND. LLC. | matched a live customer (account number) |
| 11759 | Dar Al Diyafah Real Estate | `11759` | Dar Al Diyafah Real Estate | matched a live customer (account number) |
| 11761 | ALYASMINAH REALESTATE INVE | `11761` | ALYASMINAH REALESTATE INVE | matched a live customer (account number) |
| 11762 | NOOR AL QAMAR RES. | `11762` | NOOR AL QAMAR RES. | matched a live customer (account number) |
| 11763 | SINA AUTOMATIC BAKERY - BR1 | `11763` | SINA AUTOMATIC BAKERY - BR1 | matched a live customer (account number) |
| 11764 | NAEEMA TOWER | `11764` | NAEEMA TOWER | matched a live customer (account number) |
| 11765 | AL MAWRID PRINTING & ADVT. IND. LLC.UAQ.BR. | `11765` | AL MAWRID PRINTING & ADVT. IND. LLC.UAQ.BR. | matched a live customer (account number) |
| 11766 | RUKN AL SHWAIHEAN SUPERMARKET LLC. | `11766` | RUKN AL SHWAIHEAN SUPERMARKET LLC. | matched a live customer (account number) |
| 11767 | SHAMAAT AL MADEENA RESTAURANT   L.L.C.SP | `11767` | SHAMAAT AL MADEENA RESTAURANT   L.L.C.SP | matched a live customer (account number) |
| 11768 | MASTER CAKE SWEETS PREPARING | `11768` | MASTER CAKE SWEETS PREPARING | matched a live customer (account number) |
| 11769 | MASTER CAKE SWEETS PREPARING (Dubai) | `11769` | MASTER CAKE SWEETS PREPARING (Dubai) | matched a live customer (account number) |
| 11771 | WALEED KHALID ALIYAQOUT | `11771` | WALEED KHALID ALIYAQOUT | matched a live customer (account number) |
| 11772 | AL Ramz Real Estate | `11772` | AL Ramz Real Estate | matched a live customer (account number) |
| 11773 | SUCCESS POINT SUPPORTIVE EDUCATION SERVICES | `11773` | SUCCESS POINT SUPPORTIVE EDUCATION SERVICES | matched a live customer (account number) |
| 11774 | Saud Alawghani | `11774` | Saud Alawghani | matched a live customer (account number) |
| 11775 | FAYSAL HOSSAIN GROCERY L.L.CSP | `11775` | FAYSAL HOSSAIN GROCERY L.L.CSP | matched a live customer (account number) |
| 11776 | LOYAL ELECTRICAL CONTRACTING LLC | `11776` | LOYAL ELECTRICAL CONTRACTING LLC | matched a live customer (account number) |
| 11777 | LIVA INSURANCE B.S.C CLOSED | `11777` | LIVA INSURANCE B.S.C CLOSED | matched a live customer (account number) |
| 11778 | Valtrans | `11778` | Valtrans | matched a live customer (account number) |
| 11779 | JOYALLUKAS EXCHANGE Br | `11779` | JOYALLUKAS EXCHANGE Br | matched a live customer (account number) |
| 11781 | BURJ BABIL FOODSTUFF TR L.L.C | `11781` | BURJ BABIL FOODSTUFF TR L.L.C | matched a live customer (account number) |
| 11782 | GULF PASTRY SHJ. BR.-BRANCH 1 | `11782` | GULF PASTRY SHJ. BR.-BRANCH 1 | matched a live customer (account number) |
| 11783 | BUNASER ALSHERIF | `11783` | BUNASER ALSHERIF | matched a live customer (account number) |
| 11784 | Abdalla Alzari | `11784` | Abdalla Alzari | matched a live customer (account number) |
| 11785 | ALKHOUD BEAUTY CENTER | `11785` | ALKHOUD BEAUTY CENTER | matched a live customer (account number) |
| 11786 | VAKSON REAL ESTATE | `11786` | VAKSON REAL ESTATE | matched a live customer (account number) |
| 11787 | DERMA ZONE LASER & COSMMETIC CENTER | `11787` | DERMA ZONE LASER & COSMMETIC CENTER | matched a live customer (account number) |
| 11788 | ASAS REAL ESTATE L.L.C SP | `11788` | ASAS REAL ESTATE L.L.C SP | matched a live customer (account number) |
| 11789 | Liwa Games | `11789` | Liwa Games | matched a live customer (account number) |
| 11791 | GP LUBRICANT GROWTH & PROSPERITY | `11791` | GP LUBRICANT GROWTH & PROSPERITY | matched a live customer (account number) |
| 11792 | SLS EDUCATION SUPPORT SERVICES CENTER LLC SHJ BR | `11792` | SLS EDUCATION SUPPORT SERVICES CENTER LLC SHJ BR | matched a live customer (account number) |
| 11793 | Al Shamz Medical Centre | `11793` | Al Shamz Medical Centre | matched a live customer (account number) |
| 11794 | AL MURAD REALESTATE LLC | `11794` | AL MURAD REALESTATE LLC | matched a live customer (account number) |
| 11795 | THE CRUMB CAFE | `11795` | THE CRUMB CAFE | matched a live customer (account number) |
| 11796 | AL SAHM PHARMACY | `11796` | AL SAHM PHARMACY | matched a live customer (account number) |
| 11797 | QATR ALNADA LADIES SALON | `11797` | QATR ALNADA LADIES SALON | matched a live customer (account number) |
| 11798 | CENTRAL REGION -ALDHAID- SHJ, U.A.E | `11798` | CENTRAL REGION -ALDHAID- SHJ, U.A.E | matched a live customer (account number) |
| 11799 | OTRO BEAUTY SALOON AND SPA SHJ.BR | `11799` | OTRO BEAUTY SALOON AND SPA SHJ.BR | matched a live customer (account number) |
| 11811 | NIAJARA CAFETERIA | `11811` | NIAJARA CAFETERIA | matched a live customer (account number) |
| 11812 | RETAN BEAUTY CENTER | `11812` | RETAN BEAUTY CENTER | matched a live customer (account number) |
| 11813 | ALMARJAN BODY BUILDING | `11813` | ALMARJAN BODY BUILDING | matched a live customer (account number) |
| 11814 | Salim Ali Mohamed Buttu Al Mheiri& Partners | `11814` | Salim Ali Mohamed Buttu Al Mheiri& Partners | matched a live customer (account number) |
| 11815 | NIHAL | `11815` | NIHAL | matched a live customer (account number) |
| 11816 | Caesar Confectionary LLC. BR .SHJ. Warehouse1 | `11816` | Caesar Confectionary LLC. BR .SHJ. Warehouse1 | matched a live customer (account number) |
| 11817 | ALSAMA ALSAFI LADIES SALON | `11817` | ALSAMA ALSAFI LADIES SALON | matched a live customer (account number) |
| 11818 | GULF PASTRY SHJ.BR | `11818` | GULF PASTRY SHJ.BR | matched a live customer (account number) |
| 11819 | BAREEQ AL SHAI CAFETERIA L.L.C | `11819` | BAREEQ AL SHAI CAFETERIA L.L.C | matched a live customer (account number) |
| 11821 | LUZERN BEAUTY CENTER | `11821` | LUZERN BEAUTY CENTER | matched a live customer (account number) |
| 11822 | Osamm Abid’s Restaurant LLC | `11822` | Osamm Abid’s Restaurant LLC | matched a live customer (account number) |
| 11823 | SATGURU TRAVEL & TOURISM LLC | `11823` | SATGURU TRAVEL & TOURISM LLC | matched a live customer (account number) |
| 11824 | MUMBAI AND CHINESE RESTAURANT LLC - SHJ. BR1 | `11824` | MUMBAI AND CHINESE RESTAURANT LLC - SHJ. BR1 | matched a live customer (account number) |
| 11825 | MY GOVINDAS RESTAURANT | `11825` | MY GOVINDAS RESTAURANT | matched a live customer (account number) |
| 11826 | NASEEM AL BARARY SUPERMARKET LLC | `11826` | NASEEM AL BARARY SUPERMARKET LLC | matched a live customer (account number) |
| 11827 | RUKN ALKHARIF FOODSTUFF TR L.L.C | `11827` | RUKN ALKHARIF FOODSTUFF TR L.L.C | matched a live customer (account number) |

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
| AL ATLAL ROASTRY GROUP | 1 | **reuses live group `AL ATLAL ROASTRY GROUP`** | 1 |
| AL MAWRID PRINTING GROUP | 3 | **reuses live group `AL MAWRID PRINTING GROUP`** | 3 |
| AL SAMADI SWEETS GROUP | 1 | **reuses live group `AL SAMADI SWEETS GROUP`** | 1 |
| AL TANEEN KARATE GROUP | 1 | **reuses live group `AL TANEEN KARATE GROUP`** | 1 |
| ARYAAS GROUP | 5 | **reuses live group `ARYAAS GROUP`** | 5 |
| AWANEY GROUP | 1 | **reuses live group `AWANEY GROUP`** | 1 |
| BUN & BURR GROUP | 1 | **reuses live group `BUN & BURR GROUP`** | 1 |
| CAESAR CONFECTIONARY GROUP | 3 | **reuses live group `CAESAR CONFECTIONARY GROUP`** | 3 |
| GCC EXCHANGE GROUP | 1 | **reuses live group `GCC EXCHANGE GROUP`** | 1 |
| GULF ICE FACTORY GROUP | 2 | **reuses live group `GULF ICE FACTORY GROUP`** | 2 |
| GULF PASTRY GROUP | 2 | **reuses live group `GULF PASTRY GROUP`** | 2 |
| MAZRAT AL FAWAKEH GROUP | 1 | **reuses live group `MAZRAT AL FAWAKEH GROUP`** | 1 |
| MEERA RESTAURANT GROUP | 1 | **reuses live group `MEERA RESTAURANT GROUP`** | 1 |
| MUWAILAH BUILDINGS GROUP | 5 | **reuses live group `MUWAILAH BUILDINGS GROUP`** | 5 |
| NAEEMA TOWER GROUP | 1 | **reuses live group `NAEEMA TOWER GROUP`** | 1 |
| NASERIYA BUILDINGS GROUP | 2 | **reuses live group `NASERIYA BUILDINGS GROUP`** | 2 |
| OCEAN OILFIELD GROUP | 3 | **reuses live group `OCEAN OILFIELD GROUP`** | 3 |
| REDTAPE GROUP | 1 | **reuses live group `REDTAPE GROUP`** | 1 |
| SHIFA AL JAZEERA GROUP | 5 | **reuses live group `SHIFA AL JAZEERA GROUP`** | 5 |
| SUBURBAN CUSTOMER | 1 | **reuses live group `SUBURBAN CUSTOMER`** | 1 |
| SULTAN ALARAB GROUP | 1 | **reuses live group `Sultan Al Arab`** | 6 |
| THE FOOD DISTRICT | 2 | **reuses live group `THE FOOD DISTRICT`** | 2 |
| VKM KALARI GROUP | 2 | **reuses live group `VKM KALARI GROUP`** | 2 |
| YARMOOK BUILDINGS GROUP | 3 | **reuses live group `YARMOOK BUILDINGS GROUP`** | 3 |

## 7. Contacts and sites staged

| Table | Disposition | Rows |
|---|---|---:|
| contacts | clean | 397 |
| sites | clean | 456 |

## 8. Blank-field count per column (Art. VII §5)

Blank means unknown. Nothing here is filled with a default.

| Column | Blank | of 583 |
|---|---:|---:|
| trn | 444 | 76.2% |
| email | 521 | 89.4% |
| notes | 182 | 31.2% |
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
| required_info | 14 | 2.4% |
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

