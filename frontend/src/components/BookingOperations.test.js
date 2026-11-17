import { act } from 'react';
import { createRoot } from 'react-dom/client';
import axios from 'axios';
import { ArriveButton, WaitingTimer, AdminOperationReviews } from './BookingOperations';
import WaitingRulesEditor from './WaitingRulesEditor';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
jest.mock('axios');
jest.mock('@/config', () => 'http://api.test', { virtual: true });

const waiting = {
  id: 'wait-1', started_at: '2026-11-17T10:00:00Z', ended_at: null,
  rules: { enabled: true, free_minutes: 5, price_per_minute: '1.25' }, review: null,
};

describe('recorded booking operations', () => {
  let container;
  let root;
  const change = (input, value) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-17T10:04:59Z'));
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    jest.clearAllMocks();
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove(); jest.useRealTimers();
  });

  it('counts down the allowance then estimates started minutes and freezes on departure', async () => {
    const interval = jest.spyOn(global, 'setInterval');
    const clear = jest.spyOn(global, 'clearInterval');
    await act(async () => root.render(<WaitingTimer waiting={waiting} />));
    const timerId = interval.mock.results[0].value;
    expect(container.textContent).toContain('Franchise restante : 0 min 01 s');
    await act(async () => jest.advanceTimersByTime(2000));
    expect(container.textContent).toContain('1.25 €');
    await act(async () => root.render(<WaitingTimer waiting={{ ...waiting, ended_at: '2026-11-17T10:06:01Z' }} />));
    expect(container.textContent).toContain('2.50 €');
    await act(async () => jest.advanceTimersByTime(60000));
    expect(container.textContent).toContain('2.50 €');
    expect(clear).toHaveBeenCalledWith(timerId);
    interval.mockRestore(); clear.mockRestore();
  });

  it('records arrival explicitly, surfaces failures and hides the action after arrival', async () => {
    const onChanged = jest.fn();
    axios.post.mockRejectedValueOnce({ response: { data: { detail: 'Course réaffectée' } } });
    await act(async () => root.render(<ArriveButton booking={{ id: 'b', status: 'ASSIGNED' }} onChanged={onChanged} />));
    await act(async () => container.querySelector('button').click());
    expect(container.textContent).toContain('Course réaffectée');
    expect(onChanged).not.toHaveBeenCalled();
    axios.post.mockResolvedValue({});
    await act(async () => container.querySelector('button').click());
    expect(axios.post).toHaveBeenLastCalledWith('http://api.test/api/bookings/b/arrive', {}, expect.objectContaining({ withCredentials: true }));
    expect(onChanged).toHaveBeenCalledTimes(1);
    await act(async () => root.render(<ArriveButton booking={{ id: 'b', status: 'ASSIGNED', waiting }} />));
    expect(container.querySelector('button')).toBeNull();
  });

  it('requires an explicit route supplement and tax before adding a draft, never invoices automatically', async () => {
    const onChanged = jest.fn();
    axios.post.mockResolvedValue({});
    await act(async () => root.render(<AdminOperationReviews booking={{
      id: 'b', route_change: { id: 'route-1', suggested_supplement: 30, review: null },
    }} onChanged={onChanged} />));
    const inputs = container.querySelectorAll('input');
    expect(inputs[0].value).toBe('');
    await act(async () => { change(inputs[0], '12.50'); change(inputs[1], '10'); });
    await act(async () => container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(axios.post).toHaveBeenCalledWith('http://api.test/api/admin/bookings/b/operations/route-1/review', {
      decision: 'approve', line: {
        description: 'Modification du trajet', quantity: '1', unit_price_ttc: '12.50',
        tax_treatment: 'vat', vat_percent: '10', tax_reason: null,
      },
    }, expect.any(Object));
    expect(onChanged).toHaveBeenCalled();
  });

  it('does not allow review while waiting is active and rejects without adding fees', async () => {
    axios.post.mockResolvedValue({});
    await act(async () => root.render(<AdminOperationReviews booking={{ id: 'b', waiting }} />));
    expect(container.querySelector('form')).toBeNull();
    await act(async () => root.render(<AdminOperationReviews booking={{ id: 'b', waiting: { ...waiting, ended_at: '2026-11-17T10:06:01Z' } }} onChanged={jest.fn()} />));
    const reject = [...container.querySelectorAll('button')].find((button) => button.textContent.includes('sans supplément'));
    await act(async () => reject.click());
    expect(axios.post).toHaveBeenCalledWith('http://api.test/api/admin/bookings/b/operations/wait-1/review', { decision: 'reject' }, expect.any(Object));
  });

  it('loads and saves the waiting allowance and rate only on admin action', async () => {
    axios.get.mockResolvedValue({ data: waiting.rules });
    axios.put.mockResolvedValue({ data: waiting.rules });
    await act(async () => root.render(<WaitingRulesEditor />));
    expect(axios.put).not.toHaveBeenCalled();
    expect(container.textContent).toContain('jamais facturée automatiquement');
    const inputs = container.querySelectorAll('input[type="number"]');
    await act(async () => { change(inputs[0], '10'); change(inputs[1], '2.50'); });
    await act(async () => container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(axios.put).toHaveBeenCalledWith('http://api.test/api/admin/waiting-rules', {
      enabled: true, free_minutes: 10, price_per_minute: '2.50',
    }, expect.any(Object));
    expect(container.textContent).toContain('prochaines attentes uniquement');
  });
});
