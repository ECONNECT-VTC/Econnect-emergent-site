import { passengerDetailsError } from './PassengerDetails';

describe('passenger details validation', () => {
  it('accepts adults, children, infants and appropriately matched seats', () => {
    expect(passengerDetailsError('4', '1', '1', '1', '1')).toBe('');
    expect(passengerDetailsError('1', '0', '0', '0', '0')).toBe('');
  });

  it('rejects inconsistent totals, seats, fractions and blank input', () => {
    for (const values of [
      ['2', '1', '2', '0', '0'],
      ['2', '0', '1', '0', '1'],
      ['2', '0', '1', '2', '0'],
      ['2', '0.5', '0', '0', '0'],
      ['2', '', '0', '0', '0'],
    ]) expect(passengerDetailsError(...values)).not.toBe('');
  });
});
