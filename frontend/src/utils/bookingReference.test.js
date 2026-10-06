import { formatBookingReference } from './bookingReference';

describe('formatBookingReference', () => {
  it.each([
    ['abcdef123456', 'ABCDEF'],
    ['  aBcDeF123456 \n', 'ABCDEF'],
    ['abc', 'ABC'],
    [' ab cd ef ', 'AB CD '],
    [123456789, '123456'],
    [undefined, ''],
    [null, ''],
    ['', ''],
    [' \n\t ', ''],
    [0, ''],
    [false, ''],
  ])('formats %p as %p', (id, expected) => {
    expect(formatBookingReference(id)).toBe(expected);
  });
});
