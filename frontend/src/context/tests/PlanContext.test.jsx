import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, test, expect, beforeEach } from 'vitest';
import { AuthContext } from '../../context/AuthContext';
import { PlanProvider, usePlan } from '../PlanContext';

// A mock component that uses the PlanContext
function TestComponent() {
  const { plan, addToPlan, removeFromPlan } = usePlan();

  return (
    <>
      <div data-testid="plan-length">{plan.length}</div>
      <div data-testid="plan-json">{JSON.stringify(plan)}</div>
      <button onClick={() => addToPlan({ id: '1', name: 'Venue 1' })} data-testid="add">
        Add
      </button>
      <button onClick={() => removeFromPlan('1')} data-testid="remove">
        Remove
      </button>
    </>
  );
}

// Provide a fake auth context so `useAuth()` inside PlanContext doesn't fail
function MockAuthProvider({ children }) {
  const mockAuthValue = {
    user: { id: 'mock-user', firstName: 'Test' },
    token: 'mock-token',
    isAuthenticated: true,
    makeAuthenticatedRequest: async () => ({
      json: async () => ({ plans: [], sharedPlans: [] }),
    }),
  };

  return (
    <AuthContext.Provider value={mockAuthValue}>
      {children}
    </AuthContext.Provider>
  );
}

describe('PlanContext', () => {
  beforeEach(() => {
    localStorage.clear(); // avoid using stale token data
  });

  test('addToPlan and removeFromPlan work correctly', async () => {
    render(
      <MockAuthProvider>
        <PlanProvider>
          <TestComponent />
        </PlanProvider>
      </MockAuthProvider>
    );

    const lengthDiv = screen.getByTestId('plan-length');
    const planJSON = screen.getByTestId('plan-json');
    const addBtn = screen.getByTestId('add');
    const removeBtn = screen.getByTestId('remove');

    expect(lengthDiv.textContent).toBe('0');
    expect(planJSON.textContent).toBe('[]');

    // Add venue
    fireEvent.click(addBtn);
    expect(lengthDiv.textContent).toBe('1');
    expect(planJSON.textContent).toContain('"id":"1"');

    // Try to add the same venue again (should not duplicate)
    fireEvent.click(addBtn);
    expect(lengthDiv.textContent).toBe('1');

    // Remove venue
    fireEvent.click(removeBtn);
    expect(lengthDiv.textContent).toBe('0');
    expect(planJSON.textContent).toBe('[]');
  });
});
