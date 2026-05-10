import React from 'react';
import { Link } from 'react-router-dom';
import './Header.css';

const Header = () => (
  <header className="header">
    <div className="logo">🚗 Econnect VTC</div>
    <nav className="navigation">
      <ul>
        <li><Link to="/">Accueil</Link></li>
        <li><Link to="/services">Services</Link></li>
        <li className="dropdown">
          <span>Gamme ▼</span>
          <div className="dropdown-content">
            <a href="#">Comfort Classique</a>
            <a href="#">Comfort Premium</a>
            <a href="#">Prestige</a>
            <a href="#">Van</a>
          </div>
        </li>
        <li><Link to="/about">À propos</Link></li>
        <li><Link to="/contact">Contact</Link></li>
      </ul>
      <div className="header-actions">
        <Link to="/login" className="action-btn">Connexion</Link>
        <Link to="/register" className="action-btn action-btn--primary">S'inscrire</Link>
      </div>
    </nav>
  </header>
);

export default Header;