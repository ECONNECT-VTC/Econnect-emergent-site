import React, { useState } from 'react';

const QuoteCalculator = () => {
    const [distance, setDistance] = useState(0);
    const [price, setPrice] = useState(0);

    const calculatePrice = (distance) => {
        const ratePerMile = 1.5; // Example rate
        return distance * ratePerMile;
    };

    const handleDistanceChange = (event) => {
        const inputDistance = event.target.value;
        setDistance(inputDistance);
        setPrice(calculatePrice(inputDistance));
    };

    return (
        <div>
            <h2>Quote Estimator</h2>
            <label>
                Distance (miles):
                <input
                    type="number"
                    value={distance}
                    onChange={handleDistanceChange}
                />
            </label>
            <p>Estimated Price: ${price.toFixed(2)}</p>
        </div>
    );
};

export default QuoteCalculator;