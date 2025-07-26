import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { PlanProvider, usePlan } from "../PlanContext";
import { vi, test, expect, beforeEach } from 'vitest';

// ✅ Mock AuthContext (user is required in PlanContext)
vi.mock('../AuthContext', () => ({
  useAuth: () => ({ user: { id: 'test-user', firstName: 'Test' } }),
}));

function TestComponent() {
  const { plan, addToPlan, removeFromPlan } = usePlan();

  return (
    <>
      <div data-testid="plan-length">{plan.length}</div>
      <div data-testid="plan-json">{JSON.stringify(plan)}</div>
      <button onClick={() => addToPlan({ id: '1', name: 'Venue 1' })} data-testid="add">
        Add Venue 1
      </button>
      <button onClick={() => removeFromPlan('1')} data-testid="remove">
        Remove Venue 1
      </button>
    </>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

test('addToPlan and removeFromPlan work correctly', () => {
  render(
    <PlanProvider>
      <TestComponent />
    </PlanProvider>
  );

  const lengthDiv = screen.getByTestId('plan-length');
  const planJSON = screen.getByTestId('plan-json');
  const addBtn = screen.getByTestId('add');
  const removeBtn = screen.getByTestId('remove');

  // 🔍 Initially empty
  expect(lengthDiv.textContent).toBe('0');
  expect(planJSON.textContent).toBe('[]');

  // ➕ Add venue
  fireEvent.click(addBtn);
  expect(lengthDiv.textContent).toBe('1');
  expect(planJSON.textContent).toContain('"id":"1"');
  expect(planJSON.textContent).toContain('"name":"Venue 1"');

  // ➕ Add duplicate (should not increase count)
  fireEvent.click(addBtn);
  expect(lengthDiv.textContent).toBe('1'); // Still 1
  expect(planJSON.textContent.match(/"id":"1"/g)?.length).toBe(1); // Still only one item with id 1

  // ➖ Remove
  fireEvent.click(removeBtn);
  expect(lengthDiv.textContent).toBe('0');
  expect(planJSON.textContent).toBe('[]');
});
