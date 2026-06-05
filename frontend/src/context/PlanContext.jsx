import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from "../hooks/useAuth";
import { resolveApiBaseUrl, joinApiPath } from '../../services/apiUrls';

// Create context and custom hook
const PlanContext = createContext();
export const usePlan = () => useContext(PlanContext);

const WORKING_PLAN_STORAGE_KEY = 'urban-gala-working-plan';

function parsePlanRating(venue) {
  const candidates = [venue?.review, venue?.rating];
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return candidate;
    }
    if (typeof candidate === 'string') {
      const match = candidate.match(/([0-9]+(?:\.[0-9]+)?)/);
      if (match) {
        const parsed = Number(match[1]);
        if (Number.isFinite(parsed)) return parsed;
      }
    }
  }
  return 0;
}

function normalizePlanPrice(price) {
  if (typeof price === 'number' && Number.isFinite(price)) return price;
  if (typeof price !== 'string') return price;

  const priceLevels = {
    'price level very cheap': 1,
    'price level cheap': 2,
    'price level moderate': 3,
    'price level expensive': 4,
    'price level very expensive': 5,
  };

  return priceLevels[price.trim().toLowerCase()] || price;
}

function normalizePlanVenue(venue) {
  if (!venue) return venue;

  const rating = parsePlanRating(venue);
  const price = normalizePlanPrice(venue.price);
  const lat = venue.lat ?? venue.latitude;
  const lng = venue.lng ?? venue.longitude;

  return {
    ...venue,
    lat,
    lng,
    latitude: venue.latitude ?? lat,
    longitude: venue.longitude ?? lng,
    price,
    rating,
    review: rating,
  };
}

function hasPlanValue(value) {
  if (value === null || value === undefined || value === '') return false;
  if (typeof value === 'number' && !Number.isFinite(value)) return false;
  return true;
}

function mergePlanVenue(existing, incoming) {
  const merged = { ...existing };

  Object.entries(incoming).forEach(([key, value]) => {
    if (!hasPlanValue(value)) return;
    if (!hasPlanValue(merged[key]) || key === 'rating' || key === 'review' || key === 'price') {
      merged[key] = value;
    }
  });

  return normalizePlanVenue(merged);
}

function loadStoredPlan() {
  if (typeof window === 'undefined') return [];

  try {
    const stored = window.sessionStorage.getItem(WORKING_PLAN_STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? parsed.map(normalizePlanVenue) : [];
  } catch {
    return [];
  }
}

// Provider component
export function PlanProvider({ children }) {
  // Core states
  const [plan, setPlan] = useState(loadStoredPlan);        // Current working plan (unsaved)
  const [savedPlans, setSavedPlans] = useState([]);        // Plans saved by this user
  const [sharedPlans, setSharedPlans] = useState([]);      // Plans shared *with* this user

  const [selectedVenue, setSelectedVenue] = useState(null);
  const [fromPlan, setFromPlan] = useState(false);         // Whether map was loaded from a saved/shared plan

  const { token, makeAuthenticatedRequest } = useAuth();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      window.sessionStorage.setItem(WORKING_PLAN_STORAGE_KEY, JSON.stringify(plan));
    } catch (error) {
      console.error("Failed to persist working plan:", error);
    }
  }, [plan]);

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
    setPlan((currentPlan) => {
      if (!venue) {
        return currentPlan;
      }

      const normalizedVenue = normalizePlanVenue(venue);
      const existingIndex = currentPlan.findIndex((v) => v.id === normalizedVenue.id);

      if (existingIndex >= 0) {
        return currentPlan.map((item, index) => (
          index === existingIndex ? mergePlanVenue(item, normalizedVenue) : item
        ));
      }

      if (currentPlan.length >= 5) {
        return currentPlan;
      }

      return [...currentPlan, normalizedVenue];
    });
  };

  // Remove a venue from the current plan
  const removeFromPlan = (venueId) => {
    setPlan((currentPlan) => currentPlan.filter((v) => v.id !== venueId));
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
