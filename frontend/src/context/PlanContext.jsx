import React, { createContext, useContext, useState } from 'react';

// Create the context
const PlanContext = createContext();

// Hook to use context
export const usePlan = () => useContext(PlanContext);

// Context provider component
export function PlanProvider({ children }) {
  const [plan, setPlan] = useState([]); // holds up to 3 venues

  // Add venue if not already in plan
  const addToPlan = (venue) => {
    if (plan.length >= 3 || isInPlan(venue)) return;
    setPlan([...plan, venue]);
  };

  // Remove venue by ID
  const removeFromPlan = (venueId) => {
    setPlan(plan.filter((v) => v.id !== venueId));
  };

  // Check if venue is already in plan
  const isInPlan = (venue) => {
    return plan.some((v) => v.id === venue.id);
  };

  // Clear the entire plan
  const clearPlan = () => setPlan([]);

  return (
    <PlanContext.Provider
      value={{
        plan,
        addToPlan,
        removeFromPlan,
        isInPlan,
        clearPlan,
      }}
    >
      {children}
    </PlanContext.Provider>
  );
}
