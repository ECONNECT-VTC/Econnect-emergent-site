import {
  CATEGORY_DISPLAY_NAMES,
  DISPOSITION_SERVICE_CATEGORY_KEYS,
  getCategoryDisplayName,
  getOrderedDispositionCategoryNames,
} from './vehicleCategories';

describe('vehicleCategories utils', () => {
  it('exposes the same disposition gammes as the public-facing frontend', () => {
    expect(DISPOSITION_SERVICE_CATEGORY_KEYS).toEqual([
      'comfortClassique',
      'comfortPremium',
      'prestige',
      'van',
    ]);
  });

  it('maps admin category names to the expected public labels', () => {
    expect(CATEGORY_DISPLAY_NAMES.Green).toBe('Confort Premium');
    expect(getCategoryDisplayName('Luxe')).toBe('Prestige');
    expect(getCategoryDisplayName('Unknown')).toBe('Unknown');
  });

  it('keeps disposition categories ordered consistently with the client frontend', () => {
    expect(
      getOrderedDispositionCategoryNames([
        { name: 'Van' },
        { name: 'Green' },
        { name: 'Berline' },
      ])
    ).toEqual(['Berline', 'Green', 'Van']);

    expect(getOrderedDispositionCategoryNames()).toEqual(['Berline', 'Green', 'Luxe', 'Van']);
  });
});
