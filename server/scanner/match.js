/**
 * Strict category matching. Google Text Search is relevance-ranked, so "honey shop" also returns supermarkets,
 * cafés and cake shops. In strict mode a place is kept only when every significant word of the searched category
 * (or one of its synonyms) appears in the business name, its Google category or its place types.
 */

// Words that describe the kind of outlet or corporate form rather than what it sells.
const GENERIC = new Set([
  'shop', 'shops', 'store', 'stores', 'center', 'centre', 'centers', 'service', 'services', 'and', 'the', 'for',
  'company', 'companies', 'trading', 'dealer', 'dealers', 'outlet', 'outlets', 'place', 'places', 'local', 'best',
  'firm', 'firms', 'office', 'offices', 'agency', 'agencies', 'clinic', 'clinics', 'studio', 'studios', 'group',
  'practice', 'practices', 'consultancy', 'consultants', 'provider', 'providers', 'specialist', 'specialists',
  'business', 'solutions', 'care', 'point', 'world', 'hub', 'zone', 'enterprise', 'enterprises', 'co', 'llc', 'ltd',
]);

// Extra spellings and translations that count as the same concept (Arabic & English).
const SYNONYMS = {
  law: ['lawyer', 'legal', 'attorney', 'advocate', 'solicitor', 'barrister', 'محاماة', 'محامي', 'محامون', 'قانون', 'قانوني', 'قانونية', 'استشارات'],
  lawyer: ['law', 'legal', 'attorney', 'advocate', 'solicitor', 'barrister', 'محاماة', 'محامي', 'محامون', 'قانون', 'قانوني', 'قانونية', 'استشارات'],
  legal: ['law', 'lawyer', 'attorney', 'advocate', 'محاماة', 'محامي', 'قانون', 'قانوني', 'قانونية', 'استشارات'],
  dental: ['dentist', 'teeth', 'tooth', 'orthodont', 'اسنان', 'أسنان', 'طبيب أسنان'],
  dentist: ['dental', 'teeth', 'tooth', 'orthodont', 'اسنان', 'أسنان', 'طبيب أسنان'],
  clinic: ['medical', 'doctor', 'hospital', 'health', 'healthcare', 'عيادة', 'طبيب', 'دكتور', 'مستوصف', 'طبي', 'طبية'],
  medical: ['clinic', 'doctor', 'hospital', 'health', 'عيادة', 'طبيب', 'طبي', 'طبية'],
  doctor: ['clinic', 'physician', 'medical', 'طبيب', 'دكتور'],
  hospital: ['clinic', 'medical', 'مستشفى', 'مستوصف'],
  salon: ['beauty', 'hair', 'barber', 'spa', 'صالون', 'تجميل', 'كوافير', 'حلاقة'],
  beauty: ['salon', 'cosmetic', 'aesthetic', 'spa', 'تجميل', 'صالون'],
  aesthetic: ['cosmetic', 'derma', 'skin', 'تجميل', 'جلدية'],
  cosmetic: ['aesthetic', 'derma', 'skin', 'beauty', 'تجميل'],
  restaurant: ['dining', 'eatery', 'food', 'grill', 'مطعم', 'مطاعم', 'مأكولات', 'وجبات'],
  cafe: ['coffee', 'café', 'espresso', 'tea', 'مقهى', 'كافيه', 'كوفي', 'قهوة', 'شاي'],
  coffee: ['cafe', 'café', 'espresso', 'قهوة', 'كوفي', 'كافيه', 'مقهى'],
  honey: ['عسل', 'نحل', 'bees', 'beekeep', 'apiar'],
  date: ['تمور', 'تمر'],
  perfume: ['fragrance', 'oud', 'عطور', 'عطر', 'عود', 'بخور'],
  bakery: ['bake', 'pastry', 'bread', 'cake', 'مخبز', 'مخابز', 'معجنات', 'كعك'],
  sweet: ['confection', 'dessert', 'candy', 'حلويات', 'حلوى', 'حلا'],
  real: ['estate', 'property', 'properties', 'realtor', 'realty', 'عقار', 'عقارات', 'عقاري'],
  estate: ['real', 'property', 'properties', 'realtor', 'realty', 'عقار', 'عقارات', 'عقاري'],
  property: ['real', 'estate', 'properties', 'realtor', 'عقار', 'عقارات', 'عقاري'],
  car: ['auto', 'automotive', 'vehicle', 'motor', 'سيارات', 'سيارة', 'كراج'],
  auto: ['car', 'automotive', 'vehicle', 'motor', 'garage', 'سيارات', 'سيارة', 'كراج', 'ورشة'],
  garage: ['auto', 'car', 'mechanic', 'repair', 'كراج', 'ورشة', 'صيانة'],
  gym: ['fitness', 'workout', 'sport', 'جيم', 'لياقة', 'نادي صحي', 'رياضة'],
  fitness: ['gym', 'workout', 'sport', 'لياقة', 'جيم', 'رياضة'],
  account: ['accounting', 'accountant', 'cpa', 'audit', 'auditing', 'tax', 'محاسبة', 'محاسب', 'تدقيق'],
  accounting: ['account', 'accountant', 'cpa', 'audit', 'tax', 'محاسبة', 'محاسب', 'تدقيق'],
  hotel: ['resort', 'motel', 'suites', 'inn', 'فندق', 'فنادق', 'منتجع', 'أجنحة'],
  travel: ['tourism', 'tour', 'holiday', 'سفر', 'سياحة', 'رحلات'],
  pharmacy: ['chemist', 'drugstore', 'medicine', 'صيدلية', 'صيدليات', 'دواء'],
};

const fold = (s) => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isArabic = (s) => /[؀-ۿ]/.test(s);

// Latin terms match at a word start ("honey" matches "Honeybee", "bees" does not match "beef").
// Arabic terms may carry the article/common prefixes (العسل، للعسل، وعسل) but not other letters ("معسل" is shisha tobacco).
const termRegex = (t) => (isArabic(t)
  ? new RegExp(`(^|[^\\u0600-\\u06FF]|ال|لل|و|ب)${escape(t)}`, 'u')
  : new RegExp(`(^|[^\\p{L}\\p{N}])${escape(fold(t))}`, 'u'));

/** Returns groups of regexes: any regex in a group satisfies that concept. Empty = no filtering. */
export function matchTerms(categoryQuery, categoryId) {
  let words = fold(categoryQuery).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2 && !GENERIC.has(w));
  if (!words.length) {
    words = fold(categoryQuery).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2);
  }
  const extraSynonyms = categoryId && SYNONYMS[categoryId] ? SYNONYMS[categoryId] : [];
  return words.map((w) => {
    const stem = w.length > 4 ? w.replace(/(ies)$/, 'y').replace(/(?<!s)s$/, '') : w;
    const synList = [...new Set([...(SYNONYMS[stem] || []), ...(SYNONYMS[w] || []), ...extraSynonyms])];
    return [stem, ...synList].map(termRegex);
  });
}

// Look-alike words that start with a category word but mean something else.
const FALSE_FRIENDS = /honeymoon|honeycomb (?:jewel|gold)/gu;

export function matchesPlace(p, groups, { categoryId, strict = true } = {}) {
  if (!strict) return true;
  if (!groups?.length) return true;

  // Direct category matching via Google Places official knowledge graph types
  if (categoryId) {
    const pTypes = p.types || [];
    const cat = categoryId.toLowerCase();
    if (pTypes.includes(cat) || p.category?.toLowerCase() === cat) return true;
    if (cat === 'lawyer' && (pTypes.includes('legal_services') || pTypes.includes('lawyer') || pTypes.includes('attorney'))) return true;
    if (cat === 'dentist' && (pTypes.includes('dental_clinic') || pTypes.includes('dentist'))) return true;
    if (cat === 'clinic' && (pTypes.includes('medical_clinic') || pTypes.includes('hospital') || pTypes.includes('doctor'))) return true;
    if (cat === 'cafe' && (pTypes.includes('coffee_shop') || pTypes.includes('cafe'))) return true;
    if (cat === 'restaurant' && (pTypes.includes('restaurant') || pTypes.includes('food'))) return true;
  }

  const hay = fold(`${p.name} | ${p.category || ''} | ${(p.types || []).join(' ').replace(/_/g, ' ')}`).replace(FALSE_FRIENDS, ' ');
  const raw = String(p.name || '');

  // A place matches if ANY concept group is satisfied (e.g. "law" in "law firm")
  return groups.some((alts) => alts.some((re) => re.test(hay) || (isArabic(raw) && re.test(raw))));
}
