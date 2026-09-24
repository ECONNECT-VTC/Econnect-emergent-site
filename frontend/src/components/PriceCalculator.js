// PriceCalculator.js

import React, { useState } from 'react';
import { GoogleApiWrapper, Map, Marker } from 'google-maps-react';

const PriceCalculator = ({ google, rates }) => {
    const [origin, setOrigin] = useState('');
    const [destination, setDestination] = useState('');
    const [distance, setDistance] = useState(0);
    const [price, setPrice] = useState(0);

    const calculatePrice = () => {
        const rate = rates.find(rate => rate.distance === distance);
        if (rate) {
            setPrice(rate.price);
        } else {
            setPrice(0);
        }
    };

    const handleSubmit = () => {
        const service = new google.maps.DistanceMatrixService();
        service.getDistanceMatrix({
            origins: [origin],
            destinations: [destination],
            travelMode: 'DRIVING',
        }, (response, status) => {
            if (status === 'OK') {
                const distanceValue = response.rows[0].elements[0].distance.value / 1000; // in kilometers
                setDistance(distanceValue);
                calculatePrice(); // Calculate price based on distance
            }
        });
    };

    return (
        <div>
            <h1>Price Calculator</h1>
            <input type="text" placeholder="Origin" value={origin} onChange={(e) => setOrigin(e.target.value)} />
            <input type="text" placeholder="Destination" value={destination} onChange={(e) => setDestination(e.target.value)} />
            <button onClick={handleSubmit}>Calculate</button>
            <p>Distance: {distance} km</p>
            <p>Estimated Price: ${price}</p>
            <Map google={google} zoom={14}>
                <Marker position={{ lat: 0, lng: 0 }} />
            </Map>
        </div>
    );
};

export default GoogleApiWrapper({ apiKey: 'YOUR_GOOGLE_MAPS_API_KEY' })(PriceCalculator);