import { copyLegalDraft, isLegalRecord, isLegalText } from './legalDocuments';

const draft = { title: 'Document', sections: [{ heading: 'Bloc', paragraphs: ['Texte'] }], review_confirmed: false };

it('copies editable blocks without letting local changes mutate the saved draft', () => {
  const copy = copyLegalDraft(draft);
  copy.sections[0].paragraphs[0] = 'Modifié';
  expect(copy.sections).toEqual([{ heading: 'Texte intégral', paragraphs: ['Modifié'] }]);
  expect(draft.sections).toEqual([{ heading: 'Bloc', paragraphs: ['Texte'] }]);
});

it('does not duplicate the technical heading when normalizing a full-text draft', () => {
  expect(copyLegalDraft({
    title: 'Document',
    sections: [{ heading: 'Texte intégral', paragraphs: ['Article 1', 'Article 2'] }],
    review_confirmed: false,
  }).sections).toEqual([{ heading: 'Texte intégral', paragraphs: ['Article 1\n\nArticle 2'] }]);
});

it.each([null, {}, { title: 'Sans bloc', sections: [] }, { title: 'Invalide', sections: [{ heading: 'Bloc', paragraphs: [null] }] }])(
  'does not treat malformed server text %p as an editable legal document', (value) => {
    expect(isLegalText(value)).toBe(false);
  }
);

it('requires a revision, a known kind, review state and history to edit safely', () => {
  const record = { kind: 'terms', draft, revision: 1, published_version: null, history: [] };
  expect(isLegalRecord(record)).toBe(true);
  expect(isLegalRecord({ ...record, revision: undefined })).toBe(false);
  expect(isLegalRecord({ ...record, kind: 'other' })).toBe(false);
  expect(isLegalRecord({ ...record, history: [{}] })).toBe(false);
  expect(isLegalRecord({ ...record, draft: { ...draft, review_confirmed: undefined } })).toBe(false);
});
