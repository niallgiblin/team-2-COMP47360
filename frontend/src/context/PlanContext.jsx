import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from "../hooks/useAuth";
import { resolveApiBaseUrl, joinApiPath } from '../../services/apiUrls';

// Create context and custom hook
const PlanContext = createContext();
export const usePlan = () => useContext(PlanContext);

// Provider component
export function PlanProvider({ children }) {
  // Core states
  const [plan, setPlan] = useState([]);                    // Current working plan (unsaved)
  const [savedPlans, setSavedPlans] = useState([]);        // Plans saved by this user
  const [sharedPlans, setSharedPlans] = useState([]);      // Plans shared *with* this user

  const [selectedVenue, setSelectedVenue] = useState(null);
  const [fromPlan, setFromPlan] = useState(false);         // Whether map was loaded from a saved/shared plan

  const { token, makeAuthenticatedRequest } = useAuth();

  // Fetch saved + shared plans when the user logs in or out
  useEffect(() => {
    fetchSavedPlans();
    fetchSharedPlans();
  }, [token]);

  // Fetch the user's saved plans
  const fetchSavedPlans = useCallback(async () => {
    if (!token) return;

    try {
      const response = await makeAuthenticatedRequest(joinApiPath(resolveApiBaseUrl(), '/plans'));
      const data = await response.json();
      setSavedPlans(data.plans || []);
    } catch (error) {
      console.error("Failed to fetch saved plans:", error);
      setSavedPlans([]);
    }
  }, [token, makeAuthenticatedRequest]);


  // Fetch plans saved by the current user
  const fetchSharedPlans = useCallback(async () => {
    if (!token) return;

    try {
      const response = await makeAuthenticatedRequest(joinApiPath(resolveApiBaseUrl(), '/plans/shared-with-me'));
      const data = await response.json();
      let shared = data.sharedPlans || [];

      setSharedPlans(shared);
    } catch (error) {
      console.error("Failed to fetch shared plans:", error);
      setSharedPlans([]);
    }
  }, [token, makeAuthenticatedRequest]);


  // Add a venue to the current working plan
  const addToPlan = (venue) => {
    if (plan.length >= 5 || isInPlan(venue)) return;
    setPlan([...plan, venue]);
  };

  // Remove a venue from the current plan
  const removeFromPlan = (venueId) => {
    setPlan(plan.filter((v) => v.id !== venueId));
  };


  // Check if a venue is already in the current plan
  const isInPlan = (venue) => {
    return plan.some((v) => v.id === venue.id);
  };

  // Clear all venues from the current plan
  const clearPlan = () => setPlan([]);

  // Save the current plan to the server under a given name
  const savePlan = async (name) => {
    if (plan.length === 0 || !token) return null;

    const createPlanRequest = {
      name,
      locationIds: plan.map(v => v.id),
    };

    try {
      const response = await makeAuthenticatedRequest(joinApiPath(resolveApiBaseUrl(), '/plans'), {
        method: 'POST',
        body: JSON.stringify(createPlanRequest),
      });
      const saved = await response.json();
      const newPlan = saved.plan;
      if (newPlan) {
        setSavedPlans((prev) => [newPlan, ...prev]);
      }
      return newPlan;
    } catch (error) {
      console.error('❌ Failed to save plan:', error);
      return null;
    }
  };

  // Save a plan from a list of venues (bypassing current state)
  const savePlanFromVenues = async (name, venues) => {
    if (!venues || venues.length === 0 || !token) return null;

    const createPlanRequest = {
      name,
      locationIds: venues.map(v => v.id),
    };

    try {
      const response = await makeAuthenticatedRequest(joinApiPath(resolveApiBaseUrl(), '/plans'), {
        method: 'POST',
        body: JSON.stringify(createPlanRequest),
      });
      const saved = await response.json();
      const newPlan = saved.plan;
      if (newPlan) await fetchSavedPlans();
      return newPlan;
    } catch (error) {
      console.error('❌ Failed to save plan from venues:', error);
      return null;
    }
  };

  // Load a plan (from saved or shared) into the current working plan
  const loadPlan = (input) => {
    if (Array.isArray(input)) {
      setPlan(input);
    } else if (input && Array.isArray(input.venues)) {
      setPlan(input.venues);
    } else {
      setPlan([]);
    }
  };

  //Load a plan by its ID from the backend
  const loadPlanById = async (id) => {
    if (!token) return;
    try {
      const response = await makeAuthenticatedRequest(joinApiPath(resolveApiBaseUrl(), `/plans/${id}`));
      const data = await response.json();
      setPlan(data.plan.venues || []);
    } catch (error) {
      console.error('Failed to load plan by ID:', error);
    }
  };

  // Delete a plan the user has previously saved
  const deletePlan = async (id) => {
    if (!token) return;
    try {
      await makeAuthenticatedRequest(joinApiPath(resolveApiBaseUrl(), `/plans/${id}`), { method: 'DELETE' });
      setSavedPlans((prev) => prev.filter((p) => p.id !== id));
    } catch (error) {
      console.error('Failed to delete plan:', error);
    }
  };

  // Provide context to children
  return (
    <PlanContext.Provider
      value={{
        // Core planning state
        plan,
        addToPlan,
        removeFromPlan,
        isInPlan,
        clearPlan,

        // Saved + Shared Plans
        savedPlans,
        sharedPlans,
        fetchSharedPlans,
        refreshSavedPlans: fetchSavedPlans,

        // Save / Load helpers
        savePlan,
        savePlanFromVenues,
        loadPlan,
        loadPlanById,
        deletePlan,

        // UI support
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
