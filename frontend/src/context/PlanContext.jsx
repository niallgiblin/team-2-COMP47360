import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';

// API helpers
const fetchPlansFromServer = async (token) => {
  const res = await fetch('http://localhost:8080/api/plans', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) throw new Error('Failed to fetch plans');
  return res.json();
};

const savePlanToServer = async (plan, token) => {
  const res = await fetch('http://localhost:8080/api/plans', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(plan),
  });
  if (!res.ok) throw new Error('Failed to save plan');
  return res.json();
};

const deletePlanFromServer = async (planId, token) => {
  const res = await fetch(`http://localhost:8080/api/plans/${planId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) throw new Error('Failed to delete plan');
};

// load plan by ID from backend
const fetchPlanById = async (id, token) => {
  const res = await fetch(`http://localhost:8080/api/plans/${id}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) throw new Error('Failed to load plan by ID');
  return res.json();
};

// Create the context
const PlanContext = createContext();
export const usePlan = () => useContext(PlanContext);

// Provider
export function PlanProvider({ children }) {
  const [plan, setPlan] = useState([]);
  const [savedPlans, setSavedPlans] = useState([]);
  const { user } = useAuth();
  const [selectedVenue, setSelectedVenue] = useState(null);
  const [fromPlan, setFromPlan] = useState(false);

  useEffect(() => {
    if (user?.token) {
      fetchPlansFromServer(user.token)
        .then(setSavedPlans)
        .catch(console.error);
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
    if (plan.length === 0 || !user?.token) return;

    const newPlan = {
      name,
      venues: plan,
      createdAt: new Date().toISOString(),
    };

    return savePlanToServer(newPlan, user.token).then((saved) => {
      setSavedPlans((prev) => [...prev, saved]);
      return saved;
    });
  };

  const loadPlan = (saved) => {
    setPlan(saved.venues);
  };

  const loadPlanById = async (id) => {
    if (!user?.token) return;
    const plan = await fetchPlanById(id, user.token);
    setPlan(plan.venues);
  };

  const deletePlan = (id) => {
    if (!user?.token) return;
    deletePlanFromServer(id, user.token).then(() => {
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
