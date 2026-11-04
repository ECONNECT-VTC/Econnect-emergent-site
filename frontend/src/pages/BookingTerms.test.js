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

it.each(['', 'version=2025-01-01'])('shows the canonical terms or the exact historical PDF for %s', async (version) => {
  mockVersion = version;
  axios.get.mockResolvedValue({ data: {
    enabled: false, version: '2026-11-04', title: 'CGV',
    sections: [{ heading: 'Réservation', paragraphs: ['Confirmation par email.'] }],
  } });
  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    await act(async () => root.render(<BookingTerms />));
    expect(container.querySelector('[role="note"]').textContent).toContain('non activé');
    expect(container.querySelector('a[href$="/pdf"]').href).toContain(
      version ? '/api/booking-terms/2025-01-01/pdf' : '/api/booking-terms/2026-11-04/pdf'
    );
    expect(container.textContent.includes('Confirmation par email.')).toBe(!version);
  } finally {
    await act(async () => root.unmount());
  }
});
