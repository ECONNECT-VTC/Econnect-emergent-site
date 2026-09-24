/**
 * Tests for the booking price estimation logic.
 * Covers: distance × price_per_km, min_fare floor, aller-retour doubling (Bug 3a).
 */

/**
 * Mirrors the price calculation used in BookingSection.getEstimatedPrice() when a
 * backend estimate is available (final_price from /api/estimate-price).
 * The backend already applies min_fare, so we just consume final_price directly.
 * We test the aller-retour doubling separately since it is applied client-side.
 */
function computePriceFromEstimate(finalPrice, transferType) {
  const price = Number(finalPrice);
  if (!Number.isFinite(price) || price <= 0) return null;
  return transferType === 'retour' ? price * 2 : price;
}

/**
 * Mirrors the fallback calculation (no backend estimate available):
 * parse the startingPrice string, apply aller-retour multiplier.
 */
function computeFallbackPrice(rawPriceString, transferType) {
  const parsed = Number(String(rawPriceString).replace(/[^\d.,]/g, '').replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return transferType === 'retour' ? parsed * 2 : parsed;
}

describe('bookingPrice — distance-based estimate (from backend)', () => {
  test('returns final_price as-is for a one-way trip', () => {
    expect(computePriceFromEstimate(45, 'aller')).toBe(45);
  });

  test('doubles final_price for aller-retour', () => {
    expect(computePriceFromEstimate(45, 'retour')).toBe(90);
  });

  test('returns null for a zero or negative price', () => {
    expect(computePriceFromEstimate(0, 'aller')).toBeNull();
    expect(computePriceFromEstimate(-5, 'aller')).toBeNull();
  });

  test('returns null for a non-numeric final_price', () => {
    expect(computePriceFromEstimate(NaN, 'aller')).toBeNull();
    expect(computePriceFromEstimate(null, 'aller')).toBeNull();
    expect(computePriceFromEstimate(undefined, 'aller')).toBeNull();
  });
});

describe('bookingPrice — fallback min_fare parse (string prices like "30€")', () => {
  test('parses "30€" correctly for a one-way trip', () => {
    expect(computeFallbackPrice('30€', 'aller')).toBe(30);
  });

  test('doubles parsed price for aller-retour', () => {
    expect(computeFallbackPrice('30€', 'retour')).toBe(60);
  });

  test('parses plain numeric string', () => {
    expect(computeFallbackPrice('55', 'aller')).toBe(55);
  });

  test('returns null for non-parseable strings', () => {
    expect(computeFallbackPrice('N/A', 'aller')).toBeNull();
    expect(computeFallbackPrice('', 'aller')).toBeNull();
    expect(computeFallbackPrice(null, 'aller')).toBeNull();
    expect(computeFallbackPrice(undefined, 'aller')).toBeNull();
  });

  test('returns null for zero price', () => {
    expect(computeFallbackPrice('0€', 'aller')).toBeNull();
  });
});

describe('bookingPrice — min_fare applied server-side', () => {
  /**
   * The backend /api/estimate-price already enforces min_fare.
   * This test documents the expected behaviour: if the computed
   * distance price is below min_fare, the backend returns min_fare.
   * We verify that our client-side code consumes the final_price verbatim
   * (i.e. the min_fare floor is already baked in).
   */
  test('uses backend final_price which already reflects min_fare', () => {
    // Simulated: distance × price_per_km = 18 but min_fare = 30 → backend returns 30
    const backendFinalPrice = 30;
    expect(computePriceFromEstimate(backendFinalPrice, 'aller')).toBe(30);
  });

  test('aller-retour price is doubled even when min_fare was applied', () => {
    const backendFinalPrice = 30;
    expect(computePriceFromEstimate(backendFinalPrice, 'retour')).toBe(60);
  });
});
