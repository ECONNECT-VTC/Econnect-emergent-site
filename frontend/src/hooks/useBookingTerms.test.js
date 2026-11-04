import { act } from 'react';
import { createRoot } from 'react-dom/client';
import axios from 'axios';
import useBookingTerms from './useBookingTerms';
import BookingTermsAcceptance from '@/components/BookingTermsAcceptance';

jest.mock('axios');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const document = { enabled: true, version: '2026-11-04', title: 'CGV', sections: [] };
let consent;

function Harness() {
  consent = useBookingTerms();
  return <BookingTermsAcceptance consent={consent} lang="fr" />;
}

describe('booking terms acceptance', () => {
  let container;
  let root;
  beforeEach(() => {
    axios.get.mockReset().mockResolvedValue({ data: document });
    container = window.document.createElement('div');
    root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); });

  it('starts unchecked, blocks checkout and only sends consent after an explicit action', async () => {
    await act(async () => root.render(<Harness />));
    const checkbox = container.querySelector('input');
    expect(checkbox.checked).toBe(false);
    expect(consent.ready).toBe(false);
    expect(consent.validate({})).toContain('accepter');
    expect(container.querySelector('a').href).toContain('/fr/conditions-generales?version=2026-11-04');
    await act(async () => checkbox.click());
    expect(consent.ready).toBe(true);
    expect(consent.payload).toEqual({ terms_accepted: true, terms_version: '2026-11-04' });
    expect(consent.validate({ terms_accepted: true, terms_version: 'old-version' })).toContain('version actuelle');
    await act(async () => checkbox.click());
    expect(consent.ready).toBe(false);
  });

  it('requires fresh acceptance after reloading the document and does not trust a stale draft', async () => {
    await act(async () => root.render(<Harness />));
    await act(async () => container.querySelector('input').click());
    axios.get.mockResolvedValueOnce({ data: { ...document, version: '2026-12-01' } });
    await act(async () => consent.retry());
    expect(consent.ready).toBe(false);
    expect(consent.validate({ terms_accepted: true, terms_version: document.version })).toContain('version actuelle');
  });

  it('preserves legacy booking behavior only when the server explicitly disables terms', async () => {
    axios.get.mockResolvedValueOnce({ data: { ...document, enabled: false } });
    await act(async () => root.render(<Harness />));
    expect(container.querySelector('input')).toBeNull();
    expect(consent.payload).toEqual({});
    expect(consent.ready).toBe(true);
  });

  it.each([undefined, [], { version: 'incomplete' }])('blocks checkout on malformed configuration %p', async (data) => {
    axios.get.mockResolvedValueOnce({ data });
    await act(async () => root.render(<Harness />));
    expect(consent.ready).toBe(false);
    expect(container.querySelector('[role="alert"]').textContent).toContain('invalide');
  });

  it('shows an explicit network failure with retry instead of silently disabling consent', async () => {
    axios.get.mockRejectedValueOnce(new Error('Network Error'));
    await act(async () => root.render(<Harness />));
    expect(consent.ready).toBe(false);
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    await act(async () => container.querySelector('button').click());
    expect(container.querySelector('input').checked).toBe(false);
  });

  it('does not validate a saved acceptance until the current configuration has loaded', async () => {
    let resolve;
    axios.get.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    await act(async () => root.render(<Harness />));
    expect(container.querySelector('[role="status"]')).not.toBeNull();
    expect(consent.ready).toBe(false);
    expect(consent.validate({ terms_accepted: true, terms_version: document.version })).toContain('chargement');
    await act(async () => resolve({ data: document }));
    expect(consent.validate({ terms_accepted: true, terms_version: document.version })).toBe('');
    expect(consent.ready).toBe(false);
  });

  it('reloads and clears acceptance if the backend rejects a version changed during checkout', async () => {
    await act(async () => root.render(<Harness />));
    await act(async () => container.querySelector('input').click());
    axios.get.mockResolvedValueOnce({ data: { ...document, version: '2026-12-01' } });
    await act(async () => consent.refreshAfterError({
      response: { status: 422, data: { detail: [{ loc: ['body', 'terms_version'], msg: 'Version changed' }] } },
    }));
    expect(axios.get).toHaveBeenCalledTimes(2);
    expect(consent.terms.version).toBe('2026-12-01');
    expect(consent.accepted).toBe(false);
    expect(consent.ready).toBe(false);
  });
});
