import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import axios from 'axios';
import API_URL from '@/config';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/api/auth/me`, {
        withCredentials: true
      });
      setUser(response.data);
    } catch (error) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = async (email, password) => {
    const response = await axios.post(`${API_URL}/api/auth/login`, 
      { email, password },
      { withCredentials: true }
    );
    setUser(response.data);
    return response.data;
  };

  const register = async (email, password, name, phone, role) => {
  try {
    const response = await axios.post(
      `${API_URL}/api/auth/register`,
      { email, password, name, phone, role },
      { withCredentials: true }
    );
    return response.data;
  } catch (err) {
    const data = err.response?.data;
    const detail = data?.detail;

    let message = "Erreur lors de l'inscription";

    if (typeof detail === 'string') {
      message = detail;
    } else if (Array.isArray(detail)) {
      message = detail.map((e) => e.msg).join(' ');
    } else if (typeof data?.message === 'string') {
      message = data.message;
    }

    throw new Error(message);
  }
};

  const logout = async () => {
    try {
      await axios.post(`${API_URL}/api/auth/logout`, {}, { withCredentials: true });
    } finally {
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
