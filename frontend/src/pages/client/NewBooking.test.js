import { parseBookingError } from './newBookingUtils';

describe('NewBooking parseBookingError', () => {
  it('returns string detail', () => {
    expect(parseBookingError({ response: { data: { detail: 'Erreur API' } } })).toBe('Erreur API');
  });

  it('formats validation array detail', () => {
    const err = {
      response: {
        data: {
          detail: [
            { loc: ['body', 'pickup_address'], msg: 'field required' },
            { loc: ['body', 'pickup_time'], msg: 'invalid time' },
          ],
        },
      },
    };
    expect(parseBookingError(err)).toBe('pickup_address: field required | pickup_time: invalid time');
  });

  it('uses fallback for unknown shapes', () => {
    expect(parseBookingError({ response: { data: { detail: { foo: 'bar' } } } }, 'Fallback')).toBe('Fallback');
    expect(parseBookingError(null, 'Fallback')).toBe('Fallback');
  });
});
