import React from 'react';
import './LandingPage.css';

function LandingPage() {
    return (
        <div className="landing-page">
            {/* Hero Section */}
            <section className="hero">
                <h1>Welcome to Econnect!</h1>
                <p>Your go-to solution for all your connectivity needs.</p>
                <button>Get Started</button>
            </section>

            {/* Quote Calculator */}
            <section className="quote-calculator">
                <h2>Get a Quote</h2>
                <form>
                    <input type="text" placeholder="Enter your details" required />
                    <button type="submit">Calculate</button>
                </form>
            </section>

            {/* Features Grid */}
            <section className="features">
                <h2>Features</h2>
                <div className="features-grid">
                    <div className="feature-item">Feature 1</div>
                    <div className="feature-item">Feature 2</div>
                    <div className="feature-item">Feature 3</div>
                    <div className="feature-item">Feature 4</div>
                </div>
            </section>

            {/* Benefits List */}
            <section className="benefits">
                <h2>Benefits</h2>
                <ul>
                    <li>Benefit 1</li>
                    <li>Benefit 2</li>
                    <li>Benefit 3</li>
                </ul>
            </section>

            {/* Testimonials Section */}
            <section className="testimonials">
                <h2>What Our Customers Say</h2>
                <div className="testimonial">
                    <p>"Great service! Highly recommend." - Customer 1</p>
                </div>
                <div className="testimonial">
                    <p>"Very satisfied with the results." - Customer 2</p>
                </div>
                <div className="testimonial">
                    <p>"Exceptional quality and customer support." - Customer 3</p>
                </div>
                <div className="testimonial">
                    <p>"Would definitely use again!" - Customer 4</p>
                </div>
            </section>
        </div>
    );
}

export default LandingPage;
