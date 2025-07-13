import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from "../hooks/useAuth";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api';

// Create the context
const PlanContext = createContext();
export const usePlan = () => useContext(PlanContext);

// Provider
export function PlanProvider({ children }) {
  const [plan, setPlan] = useState([]);
  const [savedPlans, setSavedPlans] = useState([]);
  const { token, makeAuthenticatedRequest } = useAuth();
  const [selectedVenue, setSelectedVenue] = useState(null);
  const [fromPlan, setFromPlan] = useState(false);

  useEffect(() => {
    const fetchPlans = async () => {
      if (token) {
        try {
          const response = await makeAuthenticatedRequest(`${API_BASE_URL}/plans`);
          if (!response.ok) {
            // This will provide a more specific error than the JSON parsing error
            throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
          }
          const data = await response.json();
          setSavedPlans(data);
        } catch (error) {
          console.error('Failed to fetch plans:', error);
          // Don't clear plans on a temporary network error
        }
      } else {
        // If there's no token (user logged out), clear the saved plans
        setSavedPlans([]);
      }
    };
    fetchPlans();
  }, [token, makeAuthenticatedRequest]);

  const addToPlan = (venue) => {
    if (plan.length >= 3 || isInPlan(venue)) return;
    setPlan([...plan, venue]);
  };

  const removeFromPlan = (venueId) => {
    setPlan(plan.filter((v) => v.id !== venueId));
  };

  const isInPlan = (venue) => {
    return plan.some((v) => v.id === venue.id);
  };

  const clearPlan = () => setPlan([]);

  const savePlan = async (name) => {
    if (plan.length === 0 || !token) return null;

    const newPlan = {
      name,
      venues: plan,
      createdAt: new Date().toISOString(),
    };

    try {
      const response = await makeAuthenticatedRequest(`${API_BASE_URL}/plans`, {
        method: 'POST',
        body: JSON.stringify(newPlan),
      });
      const saved = await response.json();
      setSavedPlans((prev) => [...prev, saved]);
      return saved;
    } catch (error) {
      console.error('Failed to save plan:', error);
      return null;
    }
  };

  const loadPlan = (saved) => {
    setPlan(saved.venues);
  };

  const loadPlanById = async (id) => {
    if (!token) return;
    try {
      const response = await makeAuthenticatedRequest(`${API_BASE_URL}/plans/${id}`);
      const data = await response.json();
      setPlan(data.venues);
    } catch (error) {
      console.error('Failed to load plan by ID:', error);
    }
  };

  const deletePlan = async (id) => {
    if (!token) return;
    try {
      await makeAuthenticatedRequest(`${API_BASE_URL}/plans/${id}`, { method: 'DELETE' });
      setSavedPlans((prev) => prev.filter((p) => p.id !== id));
    } catch (error) {
      console.error('Failed to delete plan:', error);
    }
  };

  return (
    <PlanContext.Provider
      value={{
        plan,
        addToPlan,
        removeFromPlan,
        isInPlan,
        clearPlan,
        savedPlans,
        savePlan,
        loadPlan,
        loadPlanById,
        deletePlan,
        selectedVenue,
        setSelectedVenue,
        fromPlan,
        setFromPlan,
      }}
    >
      {children}
    </PlanContext.Provider>
  );
}
