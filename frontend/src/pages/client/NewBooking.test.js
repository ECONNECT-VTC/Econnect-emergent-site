import { buildEstimatePriceQuery, parseBookingError } from './newBookingUtils';

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

  it('builds hourly estimate params for disposition bookings', () => {
    expect(
      buildEstimatePriceQuery({
        transferType: 'disposition',
        distance: '22',
        duration: '40',
        dispositionHours: '4.5',
      })
    ).toBe('transfer_type=disposition&disposition_hours=4.5');
  });

  it('builds distance estimate params for non-disposition bookings', () => {
    expect(
      buildEstimatePriceQuery({
        transferType: 'simple',
        distance: '18.2',
        duration: '35',
      })
    ).toBe('transfer_type=simple&distance_km=18.2&duration_minutes=35');
  });

  it('keeps retour transfer type when building distance estimate params', () => {
    expect(
      buildEstimatePriceQuery({
        transferType: 'retour',
        distance: '18.2',
        duration: '35',
      })
    ).toBe('transfer_type=retour&distance_km=18.2&duration_minutes=35');
  });
});
