import { act } from 'react';
import { createRoot } from 'react-dom/client';
import axios from 'axios';
import LegalDocument from './LegalDocument';

jest.mock('axios');
jest.mock('react-router-dom', () => ({
  useParams: () => ({ lang: 'fr' }),
  useSearchParams: () => [new URLSearchParams()],
}), { virtual: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('published legal pages', () => {
  let container;
  let root;
  beforeEach(() => {
    axios.get.mockReset();
    container = document.createElement('div');
    root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); });

  it.each(['legal-notice', 'privacy'])('renders the published %s safely with its versioned PDF', async (kind) => {
    axios.get.mockResolvedValue({ data: {
      kind, version: 'version-a', title: 'Document officiel',
      sections: [{ heading: 'Informations', paragraphs: ['<script>window.pirate = true</script>'] }],
    } });
    await act(async () => root.render(<LegalDocument kind={kind} />));
    expect(container.textContent).toContain('Document officiel');
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('a[href$="/pdf"]').href).toContain(`/api/legal-documents/${kind}/version-a/pdf`);
  });

  it('does not present a missing published document as an approved default', async () => {
    axios.get.mockRejectedValueOnce({ response: { status: 404 } });
    await act(async () => root.render(<LegalDocument kind="privacy" />));
    expect(container.querySelector('[role="alert"]').textContent).toContain('pas encore été publié');
    expect(container.querySelector('article')).toBeNull();
    axios.get.mockResolvedValueOnce({ data: {
      kind: 'privacy', version: 'new-version', title: 'Confidentialité',
      sections: [{ heading: 'Contact', paragraphs: ['Contact validé.'] }],
    } });
    await act(async () => container.querySelector('button').click());
    expect(container.querySelector('article').textContent).toContain('Contact validé.');
  });

  it('reports network errors and malformed data explicitly', async () => {
    axios.get.mockResolvedValueOnce({ data: { kind: 'privacy', version: 'invalid' } });
    await act(async () => root.render(<LegalDocument kind="privacy" />));
    expect(container.querySelector('[role="alert"]').textContent).toContain('invalide');
    expect(container.querySelector('a[href$="/pdf"]')).toBeNull();
  });
});
