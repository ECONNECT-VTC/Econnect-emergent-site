import {
  CATEGORY_DISPLAY_NAMES,
  DISPOSITION_SERVICE_CATEGORY_KEYS,
  getCategoryDisplayName,
  getOrderedDispositionCategoryNames,
  getVehicleCategoryPresentation,
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

  it('exposes the corrected premium presentation metadata used in booking forms', () => {
    expect(getVehicleCategoryPresentation('Berline')).toMatchObject({
      displayName: 'Confort Classique',
      passengers: 4,
      luggage: 2,
      hasWifi: true,
    });
    expect(getVehicleCategoryPresentation('Luxe')).toMatchObject({
      displayName: 'Prestige',
      passengers: 4,
      luggage: 3,
      hasWifi: true,
    });
    expect(getVehicleCategoryPresentation('Van')).toMatchObject({
      passengers: 7,
      luggage: 5,
      hasWifi: false,
    });
    expect(getVehicleCategoryPresentation('Confort Premium')).toMatchObject({
      backendName: 'Green',
      passengers: 4,
    });
  });
});
