-- 092_agreement_terms.sql
-- Run 7 item 7: the service agreement's real content, sourced from the signed
-- reference contracts in docs/reference — NOT invented here.
--
-- Two facts the platform did not hold before:
--
-- 1. CONTRACTING ENTITY VARIES BY EMIRATE. A Sharjah pest-control agreement is
--    signed by AL MUMTAZ BLDG CLEAN & PEST CONTROL (TL 546486); a Dubai one by
--    WADI AL NSOOR BUILDING CLEANING, a branch of Al Mumtaz (TL 996625).
--    Printing the wrong entity on a municipality-registered contract is a legal
--    defect, so the entity is data, keyed by emirate.
--
-- 2. THE SPECIAL CONDITIONS ARE BILINGUAL AND FIXED TEXT. Both are stored
--    verbatim (English + Arabic) from the signed references so the generated
--    agreement carries the same wording the municipality has already accepted.
--
-- Everything here is editable from Settings without a deploy. Rows are seeded
-- is_assumed = false because they are transcribed from signed documents, not
-- guessed — but the Sharjah-only municipality-registration clause is flagged in
-- its description so nobody applies it to Dubai by accident.

insert into settings (tenant_id, service_line_id, key, value, description, is_assumed)
select t.id, null, 'agreement.contracting_entities',
  jsonb_build_object(
    'Sharjah', jsonb_build_object(
      'legal_name_en', 'AL MUMTAZ BLDG CLEAN & PEST CONTROL',
      'legal_name_ar', 'الممتاز لتنظيف المباني ومكافحة الحشرات',
      'trade_licence', '546486',
      'phone', '06 565 4466'),
    'Dubai', jsonb_build_object(
      'legal_name_en', 'WADI AL NSOOR BUILDING CLEANING Br of AL MUMTAZ BLDG CLEAN & PEST CONTROL (Dubai Branch)',
      'legal_name_ar', 'وادي النسور لتنظيف المباني (فرع من الممتاز لتنظيف المباني ومكافحة الحشرات (فرع دبي))',
      'trade_licence', '996625',
      'phone', '06 565 4466')
  ),
  'Which legal entity signs the agreement, by emirate. Transcribed from the signed reference contracts (Sharjah 546486 / Dubai 996625). Add an emirate here rather than editing the generator.',
  false
from tenants t
on conflict (tenant_id, service_line_id, key) do nothing;

-- Special conditions, verbatim from the signed references. Sharjah carries the
-- municipality-registration clause; Dubai's reference does not.
insert into settings (tenant_id, service_line_id, key, value, description, is_assumed)
select t.id, null, 'agreement.special_conditions',
  jsonb_build_object(
    'Sharjah', jsonb_build_array(
      jsonb_build_object(
        'en', 'This Agreement shall be registered with the Municipality; all attestation/registration fees are payable by the Client.',
        'ar', 'يتم توثيق هذه الاتفاقية لدى البلدية، وجميع رسوم التصديق/التسجيل تكون على عاتق العميل.'),
      jsonb_build_object(
        'en', 'Payment is due upon invoice; services will be suspended after 15 days in case of non-payment until dues are cleared if payment is delayed.',
        'ar', 'تستحق الدفعات عند استلام الفاتورة؛ ويتم تعليق الخدمات بعد (15) يومًا في حال عدم السداد، مع ابلاغ الجهات الرقابية ولا تُستأنف إلا بعد سداد جميع المستحقات.'),
      jsonb_build_object(
        'en', 'This Agreement cannot be cancelled except with mutual written consent of both parties and, if required, Municipality approval.',
        'ar', 'لا يجوز إلغاء هذه الاتفاقية إلا بموافقة خطية متبادلة من الطرفين، والحصول على موافقة البلدية عند الاقتضاء.'),
      jsonb_build_object(
        'en', 'The Company may suspend/terminate services for non-payment, breach of obligations, or health/safety risks. The Municipality shall be notified at least 15 days in advance of any contract termination.',
        'ar', 'يحق للشركة تعليق أو إنهاء الخدمات في حال عدم السداد، أو الإخلال بالالتزامات، أو وجود مخاطر صحية متعلقة بالسلامة. ويتم اخطار البلدية قبل 15 يوم من الغاء العقد.')
    ),
    'Dubai', jsonb_build_array(
      jsonb_build_object(
        'en', 'Payment is due upon invoice; services will be suspended after 15 days in case of non-payment until dues are cleared if payment is delayed.',
        'ar', 'تستحق الدفعات عند استلام الفاتورة؛ ويتم تعليق الخدمات بعد (15) يومًا في حال عدم السداد، مع ابلاغ الجهات الرقابية ولا تُستأنف إلا بعد سداد جميع المستحقات.'),
      jsonb_build_object(
        'en', 'This Agreement cannot be cancelled except with mutual written consent of both parties and, if required, Municipality approval.',
        'ar', 'لا يجوز إلغاء هذه الاتفاقية إلا بموافقة خطية متبادلة من الطرفين، والحصول على موافقة البلدية عند الاقتضاء.'),
      jsonb_build_object(
        'en', 'The Company may suspend/terminate services for non-payment, breach of obligations, or health/safety risks. The Municipality shall be notified at least 15 days in advance of any contract termination.',
        'ar', 'يحق للشركة تعليق أو إنهاء الخدمات في حال عدم السداد، أو الإخلال بالالتزامات، أو وجود مخاطر صحية متعلقة بالسلامة. ويتم اخطار البلدية قبل 15 يوم من الغاء العقد.')
    )
  ),
  'The Special Conditions printed on the agreement, per emirate, English + Arabic. Transcribed verbatim from the signed reference contracts. NOTE: the municipality-registration clause appears in the Sharjah reference only.',
  false
from tenants t
on conflict (tenant_id, service_line_id, key) do nothing;

-- Targeted-pest groups printed on a pest-control agreement, bilingual, verbatim.
insert into settings (tenant_id, service_line_id, key, value, description, is_assumed)
select t.id, null, 'agreement.targeted_pests',
  jsonb_build_array(
    jsonb_build_object(
      'en', 'Crawling pests (cockroaches, ants, spiders, silverfish, bedbugs, fleas, lizards, etc.)',
      'ar', 'الافات الزاحفة (جميع انواع الصراصير، النمل، العناكب، السمك الفضي، بق الفراش، البراغيث، السحالي ...الخ)'),
    jsonb_build_object(
      'en', 'Flying insects (all types of flies and mosquitoes)',
      'ar', 'الحشرات الطائرة (جميع انواع الذباب والبعوض ...الخ)'),
    jsonb_build_object(
      'en', 'Rodents (all types of rodents), other pests',
      'ar', 'القوارض (جميع انواع القوارض)، افات اخري')
  ),
  'The public-health pest groups listed on a pest-control agreement, English + Arabic, transcribed from the signed references.',
  false
from tenants t
on conflict (tenant_id, service_line_id, key) do nothing;
