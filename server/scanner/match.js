/**
 * Strict category matching. Google Text Search is relevance-ranked, so "honey shop" also returns supermarkets,
 * cafés and cake shops. In strict mode a place is kept only when every significant word of the searched category
 * (or one of its synonyms) appears in the business name, its Google category or its place types.
 */

// Words that describe the kind of outlet rather than what it sells.
const GENERIC = new Set(['shop', 'shops', 'store', 'stores', 'center', 'centre', 'centers', 'service', 'services', 'and', 'the', 'for',
  'company', 'companies', 'trading', 'dealer', 'dealers', 'outlet', 'outlets', 'place', 'places', 'local', 'best']);

// Extra spellings that count as the same word (Arabic names are common in the Gulf).
const SYNONYMS = {
  honey: ['عسل', 'نحل', 'bees', 'beekeep', 'apiar'],
  date: ['تمور', 'تمر'],
  coffee: ['قهوة', 'كوفي', 'café', 'cafe'],
  perfume: ['عطور', 'عطر'],
  bakery: ['مخبز', 'مخابز'],
  sweet: ['حلويات', 'حلوى'],
};

const fold = (s) => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isArabic = (s) => /[؀-ۿ]/.test(s);

// Latin terms match at a word start ("honey" matches "Honeybee", "bees" does not match "beef").
// Arabic terms may carry the article/common prefixes (العسل، للعسل، وعسل) but not other letters ("معسل" is shisha tobacco).
const termRegex = (t) => (isArabic(t)
  ? new RegExp(`(^|[^\\u0600-\\u06FF]|ال|لل|و|ب)${escape(t)}`, 'u')
  : new RegExp(`(^|[^\\p{L}\\p{N}])${escape(fold(t))}`, 'u'));

/** Returns groups of regexes: every group must match; any regex in a group satisfies it. Empty = no filtering. */
export function matchTerms(categoryQuery) {
  const words = fold(categoryQuery).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2 && !GENERIC.has(w));
  return words.map((w) => {
    const stem = w.length > 4 ? w.replace(/(ies)$/, 'y').replace(/(?<!s)s$/, '') : w;
    return [stem, ...(SYNONYMS[stem] || [])].map(termRegex);
  });
}

// Look-alike words that start with a category word but mean something else.
const FALSE_FRIENDS = /honeymoon|honeycomb (?:jewel|gold)/gu;

export function matchesPlace(p, groups) {
  if (!groups?.length) return true;
  const hay = fold(`${p.name} | ${p.category || ''} | ${(p.types || []).join(' ').replace(/_/g, ' ')}`).replace(FALSE_FRIENDS, ' ');
  const raw = String(p.name || '');
  return groups.every((alts) => alts.some((re) => re.test(hay) || (isArabic(raw) && re.test(raw))));
}
