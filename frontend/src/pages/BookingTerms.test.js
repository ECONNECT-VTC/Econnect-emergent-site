import { act } from 'react';
import { createRoot } from 'react-dom/client';
import axios from 'axios';
import BookingTerms from './BookingTerms';

jest.mock('axios');
let mockVersion = '';
jest.mock('react-router-dom', () => ({
  useParams: () => ({ lang: 'fr' }),
  useSearchParams: () => [new URLSearchParams(mockVersion)],
}), { virtual: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

it.each(['', 'version=2025-01-01'])('shows the current published terms or the exact archived text and PDF for %s', async (version) => {
  mockVersion = version;
  axios.get.mockResolvedValue({ data: {
    kind: 'terms', version: version ? '2025-01-01' : '2026-11-04', title: 'CGV',
    sections: [{ heading: 'Réservation', paragraphs: ['Confirmation par email.'] }],
  } });
  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    await act(async () => root.render(<BookingTerms />));
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(axios.get.mock.calls.at(-1)[0]).toContain(
      version ? '/api/legal-documents/terms?version=2025-01-01' : '/api/legal-documents/terms'
    );
    expect(container.querySelector('a[href$="/pdf"]').href).toContain(
      version ? '/api/legal-documents/terms/2025-01-01/pdf' : '/api/legal-documents/terms/2026-11-04/pdf'
    );
    expect(container.textContent).toContain('Confirmation par email.');
  } finally {
    await act(async () => root.unmount());
  }
});
