// priceUtils.js

/**
 * Calculate price based on distance and vehicle rate.
 * @param {number} distance - The distance traveled in kilometers.
 * @param {number} rate - The rate per kilometer.
 * @returns {number} - The total price calculated.
 */
function calculatePrice(distance, rate) {
    return distance * rate;
}

/**
 * Calculate price for a vehicle based on its type and distance.
 * @param {number} distance - The distance traveled in kilometers.
 * @param {string} vehicleType - Type of the vehicle (e.g., 'car', 'bike').
 * @returns {number} - The total price calculated based on vehicle type.
 */
function calculateVehiclePrice(distance, vehicleType) {
    const rates = {
        car: 1.5,
        bike: 1.0,
        bus: 2.0
    };

    const rate = rates[vehicleType] || 1.5; // default to car rate if type not found
    return calculatePrice(distance, rate);
}

module.exports = { calculatePrice, calculateVehiclePrice };