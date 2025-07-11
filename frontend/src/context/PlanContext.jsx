import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';

// Simulated backend storage using localStorage
const fetchPlansFromServer = async (userId) => {
  const stored = localStorage.getItem(`savedPlans_${userId}`);
  return stored ? JSON.parse(stored) : [];
};

const savePlanToServer = async (plan, userId) => {
  const all = await fetchPlansFromServer(userId);
  const updated = [...all, plan];
  localStorage.setItem(`savedPlans_${userId}`, JSON.stringify(updated));
  return plan;
};

const deletePlanFromServer = async (planId, userId) => {
  const all = await fetchPlansFromServer(userId);
  const updated = all.filter(p => p.id !== planId);
  localStorage.setItem(`savedPlans_${userId}`, JSON.stringify(updated));
};

// Create the context
const PlanContext = createContext();

// Hook to use context
export const usePlan = () => useContext(PlanContext);

// Context provider component
export function PlanProvider({ children }) {
  const [plan, setPlan] = useState([]);
  const [savedPlans, setSavedPlans] = useState([]);
  const { user } = useAuth();
  const [selectedVenue, setSelectedVenue] = useState(null);
  const [fromPlan, setFromPlan] = useState(false);


  useEffect(() => {
    if (user?.id) {
      fetchPlansFromServer(user.id).then(setSavedPlans);
    }
  }, [user]);

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

  const savePlan = (name) => {
    if (plan.length === 0 || !user?.id) return;

    const newPlan = {
      id: crypto.randomUUID(),
      name,
      venues: [...plan],
      createdAt: new Date().toISOString(),
    };

    return savePlanToServer(newPlan, user.id).then(() => {
      setSavedPlans((prev) => [...prev, newPlan]);
      return newPlan; // return the saved plan
    });
    
  };

  const loadPlan = (saved) => {
    setPlan(saved.venues);
  };

  const deletePlan = (id) => {
    if (!user?.id) return;
    deletePlanFromServer(id, user.id).then(() => {
      setSavedPlans((prev) => prev.filter((p) => p.id !== id));
    });
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
        deletePlan,
        selectedVenue,
        setSelectedVenue,
        fromPlan,
        setFromPlan
      }}
    >
      {children}
    </PlanContext.Provider>
  );
}
