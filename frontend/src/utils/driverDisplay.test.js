import { getClientFacingDriverName } from './driverDisplay';

describe('getClientFacingDriverName', () => {
  it('returns explicit fallback when driver is not assigned', () => {
    expect(getClientFacingDriverName({})).toBe('Chauffeur non assigné');
  });

  it('never exposes admin-like labels to clients', () => {
    expect(getClientFacingDriverName({ driver_display_name: 'Administrateur' })).toBe('Chauffeur non assigné');
    expect(getClientFacingDriverName({ driver_name: 'admin' })).toBe('Chauffeur non assigné');
  });

  it('returns assigned driver real name when available', () => {
    expect(getClientFacingDriverName({ driver_display_name: 'Oumar Bah', driver_name: 'Administrateur' })).toBe('Oumar Bah');
  });
});
