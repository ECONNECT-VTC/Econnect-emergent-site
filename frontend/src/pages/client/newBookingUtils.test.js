import { buildEstimatePriceQuery } from './newBookingUtils';

describe('new booking disposition pricing query', () => {
  it('includes route distance and duration so disposition pricing uses the geocoded trip', () => {
    expect(buildEstimatePriceQuery({
      transferType: 'disposition',
      distance: '28.5',
      duration: '36',
      dispositionHours: '5',
    })).toBe('transfer_type=disposition&disposition_hours=5&distance_km=28.5&duration_minutes=36');
  });

  it('does not estimate disposition until a positive duration is known', () => {
    expect(buildEstimatePriceQuery({
      transferType: 'disposition', distance: '28.5', duration: '36', dispositionHours: '',
    })).toBeNull();
  });

  it('keeps distance and duration for ordinary transfers', () => {
    expect(buildEstimatePriceQuery({
      transferType: 'simple', distance: '28.5', duration: '36', dispositionHours: '',
    })).toBe('transfer_type=simple&distance_km=28.5&duration_minutes=36');
  });
});
