import React from 'react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import './Header.css'; // Assuming you have a separate CSS file for styling

const Header = () => {
  const [isMobile, setIsMobile] = useState(false);
  const [language, setLanguage] = useState('en'); // Default language

  const toggleMobileMenu = () => {
    setIsMobile(!isMobile);
  };

  const handleLanguageChange = (e) => {
    setLanguage(e.target.value);
  };

  return (
    <header className="header">
      <div className="logo">Econnect</div>
      <nav className={`nav ${isMobile ? 'mobile' : ''}`}> 
        <ul>
          <li><Link to="/">Home</Link></li>
          <li><Link to="/about">About</Link></li>
          <li><Link to="/services">Services</Link></li>
          <li><Link to="/contact">Contact</Link></li>
        </ul>
        <div className="user-menu">
          <button className="user-button">User</button>
          <div className="language-selector">
            <select value={language} onChange={handleLanguageChange}>
              <option value="en">English</option>
              <option value="fr">Français</option>
              <option value="es">Español</option>
            </select>
          </div>
        </div>
      </nav>
      <button className="mobile-menu-toggle" onClick={toggleMobileMenu}>
        {isMobile ? 'Close' : 'Menu'}
      </button>
    </header>
  );
};

export default Header;