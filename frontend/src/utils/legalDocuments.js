export const LEGAL_DOCUMENTS = [
  { kind: 'terms', label: 'CGV', path: 'conditions-generales', title: 'Conditions générales de vente et de transport' },
  { kind: 'legal-notice', label: 'Mentions légales', path: 'mentions-legales', title: 'Mentions légales' },
  { kind: 'privacy', label: 'Confidentialité', path: 'politique-confidentialite', title: 'Politique de confidentialité' },
];

export const isLegalText = (value) => typeof value?.title === 'string' && Array.isArray(value.sections)
  && value.sections.length > 0 && value.sections.every((section) => typeof section?.heading === 'string'
    && Array.isArray(section.paragraphs) && section.paragraphs.length > 0
    && section.paragraphs.every((paragraph) => typeof paragraph === 'string'));

export const isLegalRecord = (value) => LEGAL_DOCUMENTS.some(({ kind }) => value?.kind === kind)
  && isLegalText(value.draft) && typeof value.draft.review_confirmed === 'boolean'
  && Number.isInteger(value.revision) && value.revision >= 0
  && (value.published_version === null || typeof value.published_version === 'string')
  && Array.isArray(value.history) && value.history.every((item) => typeof item?.version === 'string'
    && typeof item.title === 'string' && typeof item.published_at === 'string');

export const copyLegalDraft = (value) => ({
  title: value.title,
  sections: [{
    heading: 'Texte intégral',
    paragraphs: [value.sections.length === 1 && value.sections[0].heading === 'Texte intégral'
      ? value.sections[0].paragraphs.join('\n\n')
      : value.sections.flatMap((section) => [section.heading, ...section.paragraphs]).join('\n\n')],
  }],
  review_confirmed: value.review_confirmed,
});
