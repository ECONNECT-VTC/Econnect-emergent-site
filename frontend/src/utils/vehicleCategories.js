export const VEHICLE_CATEGORY_CONFIG = [
  {
    backendName: 'Berline',
    displayName: 'Confort Classique',
    translationKey: 'comfortClassique',
    image: '/photo/chr.png',
  },
  {
    backendName: 'Green',
    displayName: 'Confort Premium',
    translationKey: 'comfortPremium',
    image: '/photo/classe_c.png',
  },
  {
    backendName: 'Luxe',
    displayName: 'Prestige',
    translationKey: 'prestige',
    image: '/photo/range_rover.png',
  },
  {
    backendName: 'Van',
    displayName: 'Van',
    translationKey: 'van',
    image: '/photo/classe_v.png',
  },
];

export const CATEGORY_IMAGES = Object.fromEntries(
  VEHICLE_CATEGORY_CONFIG.map(({ backendName, image }) => [backendName, image])
);

export const CATEGORY_DISPLAY_NAMES = Object.fromEntries(
  VEHICLE_CATEGORY_CONFIG.map(({ backendName, displayName }) => [backendName, displayName])
);

export const DISPOSITION_SERVICE_CATEGORY_KEYS = VEHICLE_CATEGORY_CONFIG.map(
  ({ translationKey }) => translationKey
);

const CATEGORY_ORDER = VEHICLE_CATEGORY_CONFIG.map(({ backendName }) => backendName);

export const getCategoryDisplayName = (categoryName) =>
  CATEGORY_DISPLAY_NAMES[categoryName] || categoryName;

export const getOrderedDispositionCategoryNames = (categories = []) => {
  const categoryNames = [
    ...new Set((categories || []).map((category) => category?.name).filter(Boolean)),
  ];

  if (categoryNames.length === 0) {
    return CATEGORY_ORDER;
  }

  const knownCategories = CATEGORY_ORDER.filter((categoryName) => categoryNames.includes(categoryName));
  const remainingCategories = categoryNames.filter((categoryName) => !CATEGORY_ORDER.includes(categoryName));

  return [...knownCategories, ...remainingCategories];
};
