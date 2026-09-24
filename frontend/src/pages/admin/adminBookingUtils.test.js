import { buildAdminEstimatePriceQuery, toOptionalNumber } from './adminBookingUtils';

describe('adminBookingUtils', () => {
  describe('toOptionalNumber', () => {
    it('returns null for empty or invalid values', () => {
      expect(toOptionalNumber('')).toBeNull();
      expect(toOptionalNumber('   ')).toBeNull();
      expect(toOptionalNumber(null)).toBeNull();
      expect(toOptionalNumber(undefined)).toBeNull();
      expect(toOptionalNumber('abc')).toBeNull();
    });

    it('returns parsed finite numbers', () => {
      expect(toOptionalNumber('42')).toBe(42);
      expect(toOptionalNumber('12.5')).toBe(12.5);
      expect(toOptionalNumber(8)).toBe(8);
    });
  });

  describe('buildAdminEstimatePriceQuery', () => {
    it('builds distance query with numeric duration for transfer bookings', () => {
      const query = buildAdminEstimatePriceQuery({
        transferType: 'simple',
        distanceKm: '18.2',
        durationMinutes: '35',
        dispositionHours: '',
      });

      expect(query).toBe('transfer_type=simple&distance_km=18.2&duration_minutes=35');
    });

    it('builds hourly query for disposition bookings', () => {
      const query = buildAdminEstimatePriceQuery({
        transferType: 'disposition',
        distanceKm: '',
        durationMinutes: '',
        dispositionHours: '4',
      });

      expect(query).toBe('transfer_type=disposition&disposition_hours=4');
    });
  });
});
