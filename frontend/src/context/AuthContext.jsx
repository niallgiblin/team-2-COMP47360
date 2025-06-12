import { createContext, useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// Create the context
const AuthContext = createContext();

// Custom hook for easy access
export const useAuth = () => useContext(AuthContext);

// AuthProvider component that wraps your app
export const AuthProvider = ({ children }) => {
  const navigate = useNavigate();

  const [user, setUser] = useState(null); // e.g. { email: '', name: '' }
  const [token, setToken] = useState(null);

  // On first load, check if user is already logged in (via localStorage)
  useEffect(() => {
    const savedUser = JSON.parse(localStorage.getItem('user'));
    const savedToken = localStorage.getItem('token');

    if (savedUser && savedToken) {
      setUser(savedUser);
      setToken(savedToken);
    }
  }, []);

  // Login function
  const login = async (email, password) => {
    try {
      const res = await fetch('http://localhost:8080/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      if (!res.ok) throw new Error('Invalid credentials');

      const data = await res.json();
      setUser(data.user);
      setToken(data.token);

      localStorage.setItem('user', JSON.stringify(data.user));
      localStorage.setItem('token', data.token);

      navigate('/'); // Go to home page after login
    } catch (err) {
      console.error('Login failed:', err);
      throw err;
    }
  };

  // Signup function
  const signup = async (email, password) => {
    try {
      const res = await fetch('http://localhost:8080/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      if (!res.ok) throw new Error('Signup failed');

      const data = await res.json();
      setUser(data.user);
      setToken(data.token);

      localStorage.setItem('user', JSON.stringify(data.user));
      localStorage.setItem('token', data.token);

      navigate('/'); // Go to home page after signup
    } catch (err) {
      console.error('Signup failed:', err);
      throw err;
    }
  };

  // Logout function
  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    navigate('/login');
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, signup }}>
      {children}
    </AuthContext.Provider>
  );
};
