export const VEHICLE_CATEGORY_CONFIG = [
  {
    backendName: 'Berline',
    displayName: 'Confort Classique',
    translationKey: 'comfortClassique',
    image: '/photo/chr.png',
    passengers: 4,
    luggage: 2,
    hasWifi: true,
    order: 1,
    startingPrice: '30€',
  },
  {
    backendName: 'Green',
    displayName: 'Confort Premium',
    translationKey: 'comfortPremium',
    image: '/photo/classe_c.png',
    passengers: 4,
    luggage: 2,
    hasWifi: true,
    order: 2,
    startingPrice: '55€',
  },
  {
    backendName: 'Luxe',
    displayName: 'Prestige',
    translationKey: 'prestige',
    image: '/photo/Range_rover.png',
    passengers: 4,
    luggage: 3,
    hasWifi: true,
    order: 3,
    startingPrice: '90€',
  },
  {
    backendName: 'Van',
    displayName: 'Van',
    translationKey: 'van',
    image: '/photo/classe_v.png',
    passengers: 7,
    luggage: 5,
    hasWifi: true,
    order: 4,
    startingPrice: '70€',
  },
];

export const CATEGORY_IMAGES = Object.fromEntries(
  VEHICLE_CATEGORY_CONFIG.map(({ backendName, image }) => [backendName, image])
);

export const CATEGORY_DISPLAY_NAMES = Object.fromEntries(
  VEHICLE_CATEGORY_CONFIG.map(({ backendName, displayName }) => [backendName, displayName])
);

export const CATEGORY_PRESENTATION = Object.fromEntries(
  VEHICLE_CATEGORY_CONFIG.map((category) => [category.backendName, category])
);

export const DISPOSITION_SERVICE_CATEGORY_KEYS = VEHICLE_CATEGORY_CONFIG.map(
  ({ translationKey }) => translationKey
);

const CATEGORY_ORDER = VEHICLE_CATEGORY_CONFIG.map(({ backendName }) => backendName);
const CATEGORY_ORDER_SET = new Set(CATEGORY_ORDER);
const CATEGORY_ALIAS_MAP = Object.fromEntries(
  VEHICLE_CATEGORY_CONFIG.flatMap((category) => [
    [category.backendName.toLowerCase(), category.backendName],
    [category.displayName.toLowerCase(), category.backendName],
  ])
);

export const getCategoryDisplayName = (categoryName) =>
  CATEGORY_DISPLAY_NAMES[categoryName] || categoryName;

export const getVehicleCategoryPresentation = (categoryName) => {
  const normalizedName = (categoryName || '').trim().toLowerCase();
  const backendName = CATEGORY_ALIAS_MAP[normalizedName] || categoryName;
  return CATEGORY_PRESENTATION[backendName] || null;
};

export const findDispositionEstimateForCategory = (estimates = [], categoryName) => {
  const normalizedName = (categoryName || '').trim().toLowerCase();
  const backendName = CATEGORY_ALIAS_MAP[normalizedName] || categoryName;

  if (!backendName) {
    return null;
  }

  return estimates.find((estimate) => {
    const estimateName = (estimate?.category_name || '').trim().toLowerCase();
    return CATEGORY_ALIAS_MAP[estimateName] === backendName || estimate?.category_name === backendName;
  }) || null;
};

export const findVehicleCategoryByName = (categories = [], categoryName) => {
  const rawCategoryName = (categoryName || '').trim();
  if (!rawCategoryName) {
    return null;
  }

  const normalizedName = rawCategoryName.toLowerCase();
  const backendName = (CATEGORY_ALIAS_MAP[normalizedName] || normalizedName).toLowerCase();

  return categories.find((category) => {
    const categoryNameValue = (category?.name || '').trim().toLowerCase();
    const categoryBackendName = (CATEGORY_ALIAS_MAP[categoryNameValue] || categoryNameValue).toLowerCase();
    return categoryBackendName === backendName;
  }) || null;
};

export const getOrderedDispositionCategoryNames = (categories = []) => {
  const categoryNames = [
    ...new Set(categories.map((category) => category?.name).filter(Boolean)),
  ];

  if (categoryNames.length === 0) {
    return CATEGORY_ORDER;
  }

  const categoryNameSet = new Set(categoryNames);
  const knownCategories = CATEGORY_ORDER.filter((categoryName) => categoryNameSet.has(categoryName));
  const remainingCategories = categoryNames.filter((categoryName) => !CATEGORY_ORDER_SET.has(categoryName));

  return [...knownCategories, ...remainingCategories];
};
