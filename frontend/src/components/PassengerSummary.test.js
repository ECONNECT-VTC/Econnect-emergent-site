import { act } from 'react';
import { createRoot } from 'react-dom/client';
import PassengerSummary from './PassengerSummary';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

it('shows passenger categories and seat requests without inventing legacy details', async () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  await act(async () => root.render(<PassengerSummary booking={{
    passenger_count: 4, adult_count: 2, child_count: 1, infant_count: 1,
    baby_seat_count: 1, booster_seat_count: 1,
  }} />));
  expect(container.textContent).toContain('2 adulte(s), 1 enfant(s), 1 bébé(s)');
  expect(container.textContent).toContain('Sièges bébé : 1 · Rehausseurs : 1');
  await act(async () => root.render(<PassengerSummary booking={{ passenger_count: 2, baby_seat_count: 1 }} />));
  expect(container.textContent).toContain('Passagers : 2');
  expect(container.textContent).not.toContain('adulte');
  await act(async () => root.unmount());
});
