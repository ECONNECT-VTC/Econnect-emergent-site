import { act } from 'react';
import { createRoot } from 'react-dom/client';
import axios from 'axios';
import AdminLegalDocuments from './AdminLegalDocuments';

jest.mock('axios');
jest.mock('react-router-dom', () => ({ useParams: () => ({ lang: 'fr' }) }), { virtual: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const kinds = ['terms', 'legal-notice', 'privacy'];
const seed = (kind) => ({
  kind, revision: 0, published_version: null, history: [],
  draft: { title: `Titre ${kind}`, sections: [{ heading: 'Premier bloc', paragraphs: ['Proposition à relire.'] }], review_confirmed: false },
});

describe('admin legal documents', () => {
  let container;
  let root;
  const button = (text) => [...container.querySelectorAll('button')].find((item) => item.textContent === text);
  const click = async (text) => { await act(async () => button(text).click()); };
  const type = async (id, value) => {
    await act(async () => {
      const input = container.querySelector(`#${id}`);
      const prototype = input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  beforeEach(() => {
    axios.get.mockReset().mockResolvedValue({ data: { documents: kinds.map(seed) } });
    axios.put.mockReset();
    axios.post.mockReset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    jest.restoreAllMocks();
  });

  it('edits text blocks, preserves edits across tabs and saves without publishing', async () => {
    await act(async () => root.render(<AdminLegalDocuments />));
    expect(container.querySelector('[data-testid="publish-legal-draft"]').disabled).toBe(true);
    await type('legal-title', 'Mes CGV');
    await type('legal-text-0-0', 'Mes conditions de réservation.');
    await click('Mentions légales');
    expect(container.querySelector('#legal-title').value).toBe('Titre legal-notice');
    await click('CGV *');
    expect(container.querySelector('#legal-title').value).toBe('Mes CGV');
    await click('Ajouter un paragraphe au bloc 1');
    await type('legal-text-0-1', 'Deuxième paragraphe.');
    await click('Prévisualiser');
    expect(container.querySelector('article').textContent).toContain('Deuxième paragraphe.');
    axios.put.mockImplementation((url, body) => Promise.resolve({ data: {
      ...seed('terms'), revision: 1,
      draft: { title: body.title, sections: body.sections, review_confirmed: body.review_confirmed },
    } }));
    await click('Enregistrer le brouillon');
    expect(axios.put).toHaveBeenCalledWith(expect.stringContaining('/admin/legal-documents/terms/draft'), expect.objectContaining({
      revision: 0, title: 'Mes CGV', review_confirmed: false,
    }), expect.objectContaining({ withCredentials: true }));
    expect(axios.post).not.toHaveBeenCalled();
    expect(container.querySelector('[role="status"]').textContent).toContain('publié n’a pas changé');
  });

  it('publishes only a saved, explicitly reviewed draft and requires confirmation', async () => {
    await act(async () => root.render(<AdminLegalDocuments />));
    await act(async () => container.querySelector('input[type="checkbox"]').click());
    expect(container.querySelector('[data-testid="publish-legal-draft"]').disabled).toBe(true);
    const saved = { ...seed('terms'), revision: 1, draft: { ...seed('terms').draft, review_confirmed: true } };
    axios.put.mockResolvedValue({ data: saved });
    await click('Enregistrer le brouillon');
    expect(container.querySelector('[data-testid="publish-legal-draft"]').disabled).toBe(false);
    await click('Publier une nouvelle version');
    expect(axios.post).not.toHaveBeenCalled();
    expect(container.querySelector('[role="dialog"]').textContent).toContain('anciennes versions');
    const publication = {
      ...saved, revision: 2, published_version: 'version-a',
      history: [{ version: 'version-a', title: saved.draft.title, published_at: '2026-11-12T12:00:00Z', published_by: 'admin-1' }],
    };
    axios.post.mockResolvedValue({ data: publication });
    await click('Confirmer la publication');
    expect(axios.post).toHaveBeenCalledWith(expect.stringContaining('/admin/legal-documents/terms/publish'),
      { revision: 1 }, expect.objectContaining({ withCredentials: true }));
    expect(container.textContent).toContain('Nouvelle version publiée');
    expect(container.textContent).toContain('version-a');
    await type('legal-title', 'Titre modifié');
    expect(container.querySelector('input[type="checkbox"]').checked).toBe(false);
    expect(container.querySelector('[data-testid="publish-legal-draft"]').disabled).toBe(true);
    expect(container.textContent).toContain('version-a');
  });

  it('preserves local edits when a concurrent update causes a conflict', async () => {
    await act(async () => root.render(<AdminLegalDocuments />));
    await type('legal-title', 'Ne pas perdre ce texte');
    axios.put.mockRejectedValue({ response: { status: 409, data: { detail: 'Le document a changé. Rechargez-le.' } } });
    await click('Enregistrer le brouillon');
    expect(container.querySelector('[role="alert"]').textContent).toContain('changé');
    expect(container.querySelector('#legal-title').value).toBe('Ne pas perdre ce texte');
    jest.spyOn(window, 'confirm').mockReturnValue(false);
    await click('Recharger');
    expect(axios.get).toHaveBeenCalledTimes(1);
    expect(container.querySelector('#legal-title').value).toBe('Ne pas perdre ce texte');
  });

  it('reads an archived snapshot without replacing the draft', async () => {
    const item = seed('terms');
    item.published_version = 'old';
    item.history = [{ version: 'old', title: 'Ancien titre', published_at: '2026-11-04T10:00:00Z' }];
    axios.get.mockResolvedValueOnce({ data: { documents: [item, seed('legal-notice'), seed('privacy')] } });
    await act(async () => root.render(<AdminLegalDocuments />));
    await type('legal-title', 'Brouillon distinct');
    axios.get.mockResolvedValueOnce({ data: {
      kind: 'terms', version: 'old', title: 'Ancien titre',
      sections: [{ heading: 'Anciennes règles', paragraphs: ['Anciennes conditions.'] }],
    } });
    await click('Consulter old');
    expect(container.querySelector('article').textContent).toContain('Anciennes conditions.');
    expect(container.querySelector('#legal-title').value).toBe('Brouillon distinct');
    expect(axios.put).not.toHaveBeenCalled();
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('shows loading and server failures with retry instead of empty editable documents', async () => {
    axios.get.mockRejectedValueOnce({ response: { status: 403, data: { detail: 'Accès interdit' } } });
    await act(async () => root.render(<AdminLegalDocuments />));
    expect(container.querySelector('[role="alert"]').textContent).toContain('Accès interdit');
    expect(container.querySelector('form')).toBeNull();
    await click('Recharger');
    expect(container.querySelector('form')).not.toBeNull();
  });

  it('does not claim publication success when the server rejects an incomplete text', async () => {
    const item = seed('privacy');
    item.draft.review_confirmed = true;
    axios.get.mockResolvedValueOnce({ data: { documents: [seed('terms'), seed('legal-notice'), item] } });
    await act(async () => root.render(<AdminLegalDocuments />));
    await click('Confidentialité');
    await click('Publier une nouvelle version');
    axios.post.mockRejectedValue({ response: { status: 422, data: { detail: 'Complétez les informations manquantes avant publication.' } } });
    await click('Confirmer la publication');
    expect(container.querySelector('[role="alert"]').textContent).toContain('informations manquantes');
    expect(container.textContent).toContain('Aucune version publiée');
    expect(container.textContent).not.toContain('Nouvelle version publiée');
  });

  it('adds and removes text blocks without altering another document', async () => {
    await act(async () => root.render(<AdminLegalDocuments />));
    await click('Ajouter un bloc');
    await type('legal-section-1', 'Nouveau bloc');
    await type('legal-text-1-0', 'Nouveau texte');
    expect(container.querySelector('#legal-section-1').value).toBe('Nouveau bloc');
    await click('Supprimer le bloc 1');
    expect(container.querySelector('#legal-section-0').value).toBe('Nouveau bloc');
    await click('Confidentialité');
    expect(container.querySelector('#legal-section-0').value).toBe('Premier bloc');
    expect(container.querySelector('#legal-section-1')).toBeNull();
  });
});
