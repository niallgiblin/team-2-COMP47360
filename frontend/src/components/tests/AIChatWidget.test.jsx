import { vi } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import AIChatWidget from '../AIChatWidget';

// Mock the API service
const mockChatAPI = vi.hoisted(() => ({
  sendMessage: vi.fn(),
}));

const mockLocationAPI = vi.hoisted(() => ({
  getLocationById: vi.fn(),
  searchLocations: vi.fn(),
}));

const mockPlanContext = vi.hoisted(() => ({
  addToPlan: vi.fn(),
  setSelectedVenue: vi.fn(),
  setFromPlan: vi.fn(),
}));

const mockAuthContext = vi.hoisted(() => ({
  user: { id: 'user-1', username: 'tester' },
}));

vi.mock('../../../services/apiService', () => ({
  chatAPI: mockChatAPI,
  locationAPI: mockLocationAPI,
}));

vi.mock('../../context/PlanContext', () => ({
  usePlan: () => mockPlanContext,
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => mockAuthContext,
}));

const renderWithProviders = (component) => {
  return render(<MemoryRouter>{component}</MemoryRouter>);
};

describe('AIChatWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthContext.user = { id: 'user-1', username: 'tester' };
    mockLocationAPI.getLocationById.mockRejectedValue(new Error('not found'));
    mockLocationAPI.searchLocations.mockRejectedValue(new Error('not found'));
    window.sessionStorage.clear();
  });

  // --- Accessibility and copy contract ---

  test('renders launcher with accessible name Open AI Concierge', () => {
    renderWithProviders(<AIChatWidget />);
    expect(screen.getByRole('button', { name: 'Open AI Concierge' })).toBeInTheDocument();
  });

  test('renders chat-window inert and aria-hidden when closed', () => {
    const { container } = renderWithProviders(<AIChatWidget />);
    const window = container.querySelector('.chat-window');
    expect(window).toBeInTheDocument();
    expect(window.hasAttribute('inert')).toBe(true);
    expect(window.getAttribute('aria-hidden')).toBe('true');
  });

  test('does not steal focus on initial render', () => {
    renderWithProviders(<AIChatWidget />);
    const launcher = screen.getByRole('button', { name: 'Open AI Concierge' });
    expect(document.activeElement).not.toBe(launcher);
    expect(document.activeElement).toBe(document.body);
  });

  test('opens chat window with locked title and moves focus to input', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AIChatWidget />);

    const launcher = screen.getByRole('button', { name: 'Open AI Concierge' });
    await user.click(launcher);

    expect(screen.getByText('AI Concierge')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Type a message...')).toBeInTheDocument();
    // Launcher label changes to Hide AI Concierge when open
    expect(screen.getByRole('button', { name: 'Hide AI Concierge' })).toBeInTheDocument();
    // Close button
    expect(screen.getByRole('button', { name: 'Close AI Concierge' })).toBeInTheDocument();
    // Send button
    expect(screen.getByRole('button', { name: 'Send message' })).toBeInTheDocument();
    // Focus moves to input
    expect(screen.getByPlaceholderText('Type a message...')).toHaveFocus();
    // Open window has no inert or aria-hidden
    const { container } = renderWithProviders(<AIChatWidget />);
    // Re-test with fresh render after click — need to re-query inside the same render
  });

  test('open window shows launcher with Hide AI Concierge and no inert', async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(<AIChatWidget />);

    const launcher = screen.getByRole('button', { name: 'Open AI Concierge' });
    await user.click(launcher);

    const window = container.querySelector('.chat-window');
    expect(window).toBeInTheDocument();
    expect(window.hasAttribute('inert')).toBe(false);
    expect(window.getAttribute('aria-hidden')).toBe('false');
    expect(screen.getByRole('button', { name: 'Hide AI Concierge' })).toBeInTheDocument();
  });

  test('closing chat returns focus to launcher and restores inert state', async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(<AIChatWidget />);

    const launcher = screen.getByRole('button', { name: 'Open AI Concierge' });
    await user.click(launcher);

    expect(screen.getByPlaceholderText('Type a message...')).toHaveFocus();

    const closeButton = screen.getByRole('button', { name: 'Close AI Concierge' });
    await user.click(closeButton);

    // Launcher regains focus
    expect(screen.getByRole('button', { name: 'Open AI Concierge' })).toHaveFocus();
    // Chat window is closed
    const window = container.querySelector('.chat-window');
    expect(window.hasAttribute('inert')).toBe(true);
    expect(window.getAttribute('aria-hidden')).toBe('true');
  });

  test('restored-open mount renders open without stealing focus', () => {
    window.sessionStorage.setItem(
      'urban-gala-chat-messages:user:user-1',
      JSON.stringify([
        { text: 'Saved user question', sender: 'user' },
        { text: 'Saved bot answer', sender: 'bot' },
      ])
    );
    window.sessionStorage.setItem('urban-gala-chat-open:user:user-1', 'true');

    const activeBefore = document.activeElement;
    const { container } = renderWithProviders(<AIChatWidget />);

    expect(container.querySelector('.chat-window')).toHaveClass('open');
    expect(screen.getByText('Saved user question')).toBeInTheDocument();
    expect(screen.getByText('Saved bot answer')).toBeInTheDocument();
    // Focus must not be stolen on restored-open mount
    expect(document.activeElement).toBe(activeBefore);
    expect(document.activeElement).not.toBe(screen.getByPlaceholderText('Type a message...'));
  });

  // --- Loading, error, and send states ---

  test('displays polite loading status with AI Concierge is thinking', async () => {
    const user = userEvent.setup();
    mockChatAPI.sendMessage.mockImplementation(() =>
      new Promise(resolve => setTimeout(() => resolve({
        response: 'Response',
        citations: [],
      }), 100))
    );

    renderWithProviders(<AIChatWidget />);

    const launcher = screen.getByRole('button', { name: 'Open AI Concierge' });
    await user.click(launcher);

    const input = screen.getByPlaceholderText('Type a message...');
    await user.type(input, 'Hello');
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    // Loading status is discoverable by role
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('AI Concierge is thinking')).toBeInTheDocument();
  });

  test('disables input and send while loading with is-loading class and aria-busy', async () => {
    const user = userEvent.setup();
    let resolvePromise;
    mockChatAPI.sendMessage.mockImplementation(() =>
      new Promise(resolve => { resolvePromise = resolve; })
    );

    const { container } = renderWithProviders(<AIChatWidget />);

    const launcher = screen.getByRole('button', { name: 'Open AI Concierge' });
    await user.click(launcher);

    const input = screen.getByPlaceholderText('Type a message...');
    const sendButton = screen.getByRole('button', { name: 'Send message' });

    await user.type(input, 'Hello');
    await user.click(sendButton);

    // Both input and send are natively disabled
    expect(input).toBeDisabled();
    expect(sendButton).toBeDisabled();

    // Loading hooks
    const inputContainer = container.querySelector('.input-container');
    expect(inputContainer.classList.contains('is-loading')).toBe(true);
    expect(inputContainer.getAttribute('aria-busy')).toBe('true');

    // Complete the request
    resolvePromise({ response: 'Response', citations: [] });

    await waitFor(() => {
      expect(inputContainer.classList.contains('is-loading')).toBe(false);
    });
    expect(inputContainer.getAttribute('aria-busy')).toBeFalsy();
  });

  test('prevents duplicate send attempts while loading', async () => {
    const user = userEvent.setup();
    let resolvePromise;
    mockChatAPI.sendMessage.mockImplementation(() =>
      new Promise(resolve => { resolvePromise = resolve; })
    );

    renderWithProviders(<AIChatWidget />);

    const launcher = screen.getByRole('button', { name: 'Open AI Concierge' });
    await user.click(launcher);

    const input = screen.getByPlaceholderText('Type a message...');
    const sendButton = screen.getByRole('button', { name: 'Send message' });

    await user.type(input, 'Hello');
    await user.click(sendButton);

    // While pending, try another Enter dispatch
    await user.type(input, '{enter}');
    await user.click(sendButton);

    // The send button is disabled so click is no-op, and Enter path is guarded
    expect(mockChatAPI.sendMessage).toHaveBeenCalledTimes(1);

    // Settle
    resolvePromise({ response: 'Response', citations: [] });

    await waitFor(() => {
      expect(screen.getByText('Response')).toBeInTheDocument();
    });
  });

  test('input and send return to idle eligibility after request resolution', async () => {
    const user = userEvent.setup();
    mockChatAPI.sendMessage.mockResolvedValue({
      response: 'Response',
      citations: [],
    });

    renderWithProviders(<AIChatWidget />);

    const launcher = screen.getByRole('button', { name: 'Open AI Concierge' });
    await user.click(launcher);

    const input = screen.getByPlaceholderText('Type a message...');
    const sendButton = screen.getByRole('button', { name: 'Send message' });

    await user.type(input, 'Hello');
    await user.click(sendButton);

    await waitFor(() => {
      expect(screen.getByText('Response')).toBeInTheDocument();
    });

    // After resolution, input is re-enabled (empty, so send is disabled)
    expect(input).not.toBeDisabled();
    // Send is disabled because input is empty after clearing
    expect(sendButton).toBeDisabled();
  });

  test('sends message when Enter is pressed with non-empty input', async () => {
    const user = userEvent.setup();
    mockChatAPI.sendMessage.mockResolvedValue({
      response: 'Response',
      citations: [],
    });

    renderWithProviders(<AIChatWidget />);

    const launcher = screen.getByRole('button', { name: 'Open AI Concierge' });
    await user.click(launcher);

    const input = screen.getByPlaceholderText('Type a message...');
    await user.type(input, 'Hello AI{enter}');

    expect(mockChatAPI.sendMessage).toHaveBeenCalledWith(
      'Hello AI',
      expect.any(Array)
    );
  });

  test('renders the exact locked error text on API failure', async () => {
    const user = userEvent.setup();
    mockChatAPI.sendMessage.mockRejectedValue(new Error('API Error'));

    renderWithProviders(<AIChatWidget />);

    const launcher = screen.getByRole('button', { name: 'Open AI Concierge' });
    await user.click(launcher);

    const input = screen.getByPlaceholderText('Type a message...');
    await user.type(input, 'Hello');
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() => {
      expect(screen.getByText(/Sorry, I'm having trouble connecting/)).toBeInTheDocument();
      expect(screen.getByText(/Please try again/)).toBeInTheDocument();
    });
  });

  test('renders the exact locked clear confirmation text', async () => {
    const user = userEvent.setup();

    renderWithProviders(<AIChatWidget />);

    const launcher = screen.getByRole('button', { name: 'Open AI Concierge' });
    await user.click(launcher);

    const input = screen.getByPlaceholderText('Type a message...');
    await user.type(input, 'please clear chat history');
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() => {
      expect(screen.getByText(/Chat history cleared/)).toBeInTheDocument();
      expect(screen.getByText(/What vibe should we find next/)).toBeInTheDocument();
    });
    expect(mockChatAPI.sendMessage).not.toHaveBeenCalled();
  });

  test('does not use dangerouslySetInnerHTML', async () => {
    const user = userEvent.setup();
    mockChatAPI.sendMessage.mockResolvedValue({
      response: 'Hello! <script>alert("xss")</script>',
      citations: [],
    });

    renderWithProviders(<AIChatWidget />);

    const launcher = screen.getByRole('button', { name: 'Open AI Concierge' });
    await user.click(launcher);

    const input = screen.getByPlaceholderText('Type a message...');
    await user.type(input, 'Hello AI');
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() => {
      expect(screen.getByText(/script/)).toBeInTheDocument();
    });
  });

  // --- Preserved behavior: send, persistence, venue actions ---

  test('sends message when form is submitted', async () => {
    const user = userEvent.setup();
    mockChatAPI.sendMessage.mockResolvedValue({
      response: 'Hello! How can I help you today?',
      citations: [],
    });

    renderWithProviders(<AIChatWidget />);

    const launcher = screen.getByRole('button', { name: 'Open AI Concierge' });
    await user.click(launcher);

    const input = screen.getByPlaceholderText('Type a message...');
    const sendButton = screen.getByRole('button', { name: 'Send message' });

    await user.type(input, 'Hello AI');
    await user.click(sendButton);

    await waitFor(() => {
      expect(mockChatAPI.sendMessage).toHaveBeenCalledWith(
        'Hello AI',
        [expect.objectContaining({ sender: 'bot' })]
      );
    });
  });

  test('displays user message in chat', async () => {
    const user = userEvent.setup();
    mockChatAPI.sendMessage.mockResolvedValue({
      response: 'Hello! How can I help you today?',
      citations: [],
    });

    renderWithProviders(<AIChatWidget />);

    const launcher = screen.getByRole('button', { name: 'Open AI Concierge' });
    await user.click(launcher);

    const input = screen.getByPlaceholderText('Type a message...');
    const sendButton = screen.getByRole('button', { name: 'Send message' });

    await user.type(input, 'Hello AI');
    await user.click(sendButton);

    await waitFor(() => {
      expect(screen.getByText('Hello AI')).toBeInTheDocument();
    });
  });

  test('displays AI response in chat', async () => {
    const user = userEvent.setup();
    const aiResponse = 'Hello! How can I help you today?';
    mockChatAPI.sendMessage.mockResolvedValue({
      response: aiResponse,
      citations: [],
    });

    renderWithProviders(<AIChatWidget />);

    const launcher = screen.getByRole('button', { name: 'Open AI Concierge' });
    await user.click(launcher);

    const input = screen.getByPlaceholderText('Type a message...');
    const sendButton = screen.getByRole('button', { name: 'Send message' });

    await user.type(input, 'Hello AI');
    await user.click(sendButton);

    await waitFor(() => {
      expect(screen.getByText('How can I help you today?')).toBeInTheDocument();
    });
  });

  test('prevents sending empty messages', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AIChatWidget />);

    const launcher = screen.getByRole('button', { name: 'Open AI Concierge' });
    await user.click(launcher);

    const sendButton = screen.getByRole('button', { name: 'Send message' });
    await user.click(sendButton);

    expect(mockChatAPI.sendMessage).not.toHaveBeenCalled();
  });

  test('clears input after sending message', async () => {
    const user = userEvent.setup();
    mockChatAPI.sendMessage.mockResolvedValue({
      response: 'Response',
      citations: [],
    });

    renderWithProviders(<AIChatWidget />);

    const launcher = screen.getByRole('button', { name: 'Open AI Concierge' });
    await user.click(launcher);

    const input = screen.getByPlaceholderText('Type a message...');
    const sendButton = screen.getByRole('button', { name: 'Send message' });

    await user.type(input, 'Hello AI');
    await user.click(sendButton);

    await waitFor(() => {
      expect(input.value).toBe('');
    });
  });

  // --- Venue citation card tests (updated to new accessible names) ---

  test('displays clickable venue cards only for referenced citations', async () => {
    const user = userEvent.setup();
    const citations = [
      { venue_id: 1, name: 'Restaurant A', zone: 'East Village', rating: 'Rating: 4.5', price: 'price level moderate', address: '1 Main St' },
      { venue_id: 2, name: 'Restaurant B', zone: 'Lower East Side', rating: 4.2, address: '2 Main St' },
      { venue_id: 3, name: 'Pizza Place', zone: 'East Village', rating: 4.0, address: '3 Main St' },
    ];
    mockChatAPI.sendMessage.mockResolvedValue({
      response: 'Restaurant A [1] is great. It is rated 4.5 [1].\n\n---\n[1] Restaurant A — Thai restaurant in East Village (4.5/5)\n[2] Restaurant B — Restaurant in Lower East Side (4.2/5)',
      citations,
    });

    renderWithProviders(<AIChatWidget />);

    const launcher = screen.getByRole('button', { name: 'Open AI Concierge' });
    await user.click(launcher);

    const input = screen.getByPlaceholderText('Type a message...');
    const sendButton = screen.getByRole('button', { name: 'Send message' });

    await user.type(input, 'Recommend me restaurants');
    await user.click(sendButton);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add restaurant a to plan and view on map/i })).toBeInTheDocument();
    });
    expect(screen.getByText('Restaurant A is great.')).toBeInTheDocument();
    expect(screen.getByText('It is rated 4.5.')).toBeInTheDocument();
    expect(screen.getByText(/add to plan/i)).toBeInTheDocument();
    expect(screen.queryByText(/\[1\]/)).not.toBeInTheDocument();
    expect(screen.queryByText(/thai restaurant in east village/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add restaurant b to plan and view on map/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add pizza place to plan and view on map/i })).not.toBeInTheDocument();
    // No venue-citation-number element
    expect(document.querySelector('.venue-citation-number')).toBeNull();

    mockLocationAPI.getLocationById.mockResolvedValueOnce({
      location: {
        id: 1,
        name: 'Restaurant A',
        lat: 40.71,
        lng: -73.99,
        review: 4.8,
        price: 4,
        isRestaurant: true,
        uri: 'https://restaurant-a.example',
        description: 'Canonical restaurant details',
      },
    });
    await user.click(screen.getByRole('button', { name: /add restaurant a to plan and view on map/i }));

    await waitFor(() => {
      expect(mockLocationAPI.getLocationById).toHaveBeenCalledWith(1);
    });
    expect(mockPlanContext.addToPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 1,
        name: 'Restaurant A',
        lat: 40.71,
        lng: -73.99,
        rating: 4.8,
        review: 4.8,
        price: 4,
        isRestaurant: true,
        uri: 'https://restaurant-a.example',
        description: 'Canonical restaurant details',
      })
    );
    expect(mockPlanContext.setSelectedVenue).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 1,
        name: 'Restaurant A',
        lat: 40.71,
        lng: -73.99,
        rating: 4.8,
        review: 4.8,
        price: 4,
        isRestaurant: true,
      })
    );
    expect(mockPlanContext.setFromPlan).toHaveBeenCalledWith(false);
    expect(screen.getByPlaceholderText('Type a message...')).toBeInTheDocument();
  });

  test('links named venues and ignores stray citation markers for unnamed venues', async () => {
    const user = userEvent.setup();
    const citations = [
      { venue_id: 1, name: 'Dixon Place Open Channels New York Inc', zone: 'Lower East Side', rating: 4.7, address: '161A Chrystie St' },
      { venue_id: 173, name: 'Bacaro', zone: 'Lower East Side', rating: 4.4, address: '136 Division St' },
      { venue_id: 4, name: 'The Fear City Comedy Club', zone: 'Lower East Side', rating: 4.0, address: '17 Essex St' },
    ];
    mockChatAPI.sendMessage.mockResolvedValue({
      response: 'For dinner, Bacaro is a great Italian choice in the Lower East Side. After dinner, head to Dixon Place Open Channels New York Inc [1] for a late-night DJ set. [3]',
      citations,
    });

    renderWithProviders(<AIChatWidget />);

    const launcher = screen.getByRole('button', { name: 'Open AI Concierge' });
    await user.click(launcher);

    const input = screen.getByPlaceholderText('Type a message...');
    await user.type(input, 'Italian dinner then a DJ set');
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add bacaro to plan and view on map/i })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /add dixon place open channels new york inc to plan and view on map/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add the fear city comedy club to plan and view on map/i })).not.toBeInTheDocument();
  });

  test('links referenced citations even when response uses generic suggestion wording', async () => {
    const user = userEvent.setup();
    const citations = [
      { venue_id: 1061, name: 'The Milton', zone: 'Yorkville West', rating: 4.3, address: '1754 2nd Ave' },
      { venue_id: 1580, name: 'The Comic Strip', zone: 'Yorkville West', rating: 4.3, address: '1568 2nd Ave' },
    ];
    mockChatAPI.sendMessage.mockResolvedValue({
      response: 'For a low-travel night, start with the nearby pub [1], then walk to the comedy club [2].',
      citations,
    });

    renderWithProviders(<AIChatWidget />);

    await user.click(screen.getByRole('button', { name: 'Open AI Concierge' }));
    await user.type(screen.getByPlaceholderText('Type a message...'), 'cozy pub near UES then comedy');
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add the milton to plan and view on map/i })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /add the comic strip to plan and view on map/i })).toBeInTheDocument();
  });

  test('shows returned venue links when response uses generic venue wording', async () => {
    const user = userEvent.setup();
    const citations = [
      { venue_id: 631, name: 'Treadwell Park', zone: 'Lenox Hill West', rating: 4.4, address: '1125 1st Ave' },
      { venue_id: 1558, name: 'Rodneys', zone: 'Lenox Hill East', rating: 4.9, address: '1118 1st Ave' },
    ];
    mockChatAPI.sendMessage.mockResolvedValue({
      response: 'Start with a nearby beer hall, then head to a local comedy room.',
      citations,
    });

    renderWithProviders(<AIChatWidget />);

    await user.click(screen.getByRole('button', { name: 'Open AI Concierge' }));
    await user.type(screen.getByPlaceholderText('Type a message...'), 'nearby pub and comedy');
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() => {
      expect(screen.getByText('Start with a nearby beer hall, then head to a local comedy room.')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /add treadwell park to plan and view on map/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add rodneys to plan and view on map/i })).toBeInTheDocument();
  });

  test('ignores inline source footer when choosing venue cards', async () => {
    const user = userEvent.setup();
    const citations = [
      { venue_id: 1, name: 'estiatorio Milos Midtown', zone: 'Midtown North', rating: 4.5, address: '125 W 55th St' },
      { venue_id: 2, name: 'Lokal Mediterranean Kitchen', zone: 'Upper West Side South', rating: 4.5, address: '473 Columbus Ave' },
      { venue_id: 3, name: '123BSB', zone: 'Manhattanville', rating: 4.1, address: '712 W 125th St' },
    ];
    mockChatAPI.sendMessage.mockResolvedValue({
      response: 'For Mediterranean fare, Lokal Mediterranean Kitchen is a great choice. After dinner, head to 123BSB for a lively bar experience. --- estiatorio Milos Midtown — Restaurant, Bar in Midtown North (Rating: 4.5★) Lokal Mediterranean Kitchen — Restaurant, Bar in Upper West Side South (Rating: 4.5★) 123BSB — Restaurant, Bar in Manhattanville (Rating: 4.1★)',
      citations,
    });

    renderWithProviders(<AIChatWidget />);

    await user.click(screen.getByRole('button', { name: 'Open AI Concierge' }));
    await user.type(screen.getByPlaceholderText('Type a message...'), 'mediterranean then lively bar');
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add lokal mediterranean kitchen to plan and view on map/i })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /add 123bsb to plan and view on map/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add estiatorio milos midtown to plan and view on map/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/restaurant, bar in midtown north/i)).not.toBeInTheDocument();
  });

  test('shows up to five suggested venue links to match plan capacity', async () => {
    const user = userEvent.setup();
    const citations = [
      { venue_id: 1, name: 'Homemade Taqueria Columbus', zone: 'Bloomingdale', rating: 4.2, address: '999 Columbus Ave' },
      { venue_id: 2, name: 'Caff Panna', zone: 'Gramercy', rating: 4.7, address: '77 Irving Pl' },
      { venue_id: 3, name: 'The Rum House', zone: 'Midtown North', rating: 4.4, address: '228 W 47th St' },
      { venue_id: 4, name: 'Bathtub Gin', zone: 'Midtown South', rating: 4.3, address: '132 9th Ave' },
      { venue_id: 5, name: 'Avrililillys Creamery LLC', zone: 'Hamilton Heights', rating: 4.8, address: '1610 Amsterdam Ave' },
    ];
    mockChatAPI.sendMessage.mockResolvedValue({
      response: 'Start with Homemade Taqueria Columbus [1] for tacos, then Caff Panna [2] for ice cream. For drinks, try The Rum House [3] or Bathtub Gin [4]. If you want another dessert option, Avrililillys Creamery LLC [5] is farther uptown.',
      citations,
    });

    renderWithProviders(<AIChatWidget />);

    await user.click(screen.getByRole('button', { name: 'Open AI Concierge' }));
    await user.type(screen.getByPlaceholderText('Type a message...'), 'cheap tacos ice cream drinks');
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add homemade taqueria columbus to plan and view on map/i })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /add caff panna to plan and view on map/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add the rum house to plan and view on map/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add bathtub gin to plan and view on map/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add avrililillys creamery llc to plan and view on map/i })).toBeInTheDocument();
  });

  // --- Persistence ---

  test('restores persisted messages and open state after refresh', async () => {
    window.sessionStorage.setItem(
      'urban-gala-chat-messages:user:user-1',
      JSON.stringify([
        { text: 'Saved user question', sender: 'user' },
        { text: 'Saved bot answer', sender: 'bot' },
      ])
    );
    window.sessionStorage.setItem('urban-gala-chat-open:user:user-1', 'true');

    const { container } = renderWithProviders(<AIChatWidget />);

    expect(container.querySelector('.chat-window')).toHaveClass('open');
    expect(screen.getByText('Saved user question')).toBeInTheDocument();
    expect(screen.getByText('Saved bot answer')).toBeInTheDocument();
  });

  test('keeps persisted chat history isolated per authenticated user', () => {
    window.sessionStorage.setItem(
      'urban-gala-chat-messages:user:user-1',
      JSON.stringify([
        { text: 'First account private chat', sender: 'user' },
      ])
    );
    window.sessionStorage.setItem(
      'urban-gala-chat-messages:user:user-2',
      JSON.stringify([
        { text: 'Second account private chat', sender: 'user' },
      ])
    );
    window.sessionStorage.setItem('urban-gala-chat-open:user:user-2', 'true');
    mockAuthContext.user = { id: 'user-2', username: 'other-user' };

    const { container } = renderWithProviders(<AIChatWidget />);

    expect(container.querySelector('.chat-window')).toHaveClass('open');
    expect(screen.getByText('Second account private chat')).toBeInTheDocument();
    expect(screen.queryByText('First account private chat')).not.toBeInTheDocument();
  });

  test('does not restore legacy unscoped chat storage for authenticated users', () => {
    window.sessionStorage.setItem(
      'urban-gala-chat-messages',
      JSON.stringify([
        { text: 'Legacy account bleed', sender: 'user' },
      ])
    );
    window.sessionStorage.setItem('urban-gala-chat-open', 'true');

    const { container } = renderWithProviders(<AIChatWidget />);

    expect(container.querySelector('.chat-window')).not.toHaveClass('open');
    expect(screen.queryByText('Legacy account bleed')).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem('urban-gala-chat-messages')).toBeNull();
    expect(window.sessionStorage.getItem('urban-gala-chat-open')).toBeNull();
  });

  test('clears chat history and context when asked', async () => {
    const user = userEvent.setup();
    window.sessionStorage.setItem(
      'urban-gala-chat-messages:user:user-1',
      JSON.stringify([
        { text: 'Earlier user question', sender: 'user' },
        { text: 'Earlier bot answer', sender: 'bot' },
      ])
    );
    window.sessionStorage.setItem('urban-gala-chat-open:user:user-1', 'true');

    renderWithProviders(<AIChatWidget />);

    expect(screen.getByText('Earlier user question')).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('Type a message...'), 'please clear chat history');
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() => {
      expect(screen.getByText(/chat history cleared/i)).toBeInTheDocument();
    });

    expect(mockChatAPI.sendMessage).not.toHaveBeenCalled();
    expect(screen.queryByText('Earlier user question')).not.toBeInTheDocument();
    expect(screen.queryByText('Earlier bot answer')).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem('urban-gala-chat-messages:user:user-1')).not.toContain('Earlier user question');
  });

  test('disables only the activated venue card while hydration is pending, prevents duplicate activation', async () => {
    const user = userEvent.setup();
    let resolveHydration;
    mockLocationAPI.getLocationById.mockImplementation(() =>
      new Promise(resolve => { resolveHydration = resolve; })
    );

    const citations = [
      { venue_id: 1, name: 'Restaurant A', zone: 'East Village', rating: 4.5, address: '1 Main St' },
      { venue_id: 2, name: 'Restaurant B', zone: 'Lower East Side', rating: 4.2, address: '2 Main St' },
    ];
    mockChatAPI.sendMessage.mockResolvedValue({
      response: 'Restaurant A [1] and Restaurant B [2] are great options.',
      citations,
    });

    renderWithProviders(<AIChatWidget />);

    await user.click(screen.getByRole('button', { name: 'Open AI Concierge' }));
    await user.type(screen.getByPlaceholderText('Type a message...'), 'restaurants');
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add restaurant a to plan and view on map/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /add restaurant b to plan and view on map/i })).toBeInTheDocument();
    });

    const cardA = screen.getByRole('button', { name: /add restaurant a to plan and view on map/i });
    const cardB = screen.getByRole('button', { name: /add restaurant b to plan and view on map/i });

    // First click on card A
    await user.click(cardA);

    // Card A should be disabled immediately, card B should remain enabled
    expect(cardA).toBeDisabled();
    expect(cardB).not.toBeDisabled();

    // Click card A again while pending — should be a no-op
    await user.click(cardA);

    // getLocationById should only be called once
    expect(mockLocationAPI.getLocationById).toHaveBeenCalledTimes(1);

    // Resolve the hydration
    resolveHydration({
      location: {
        id: 1,
        name: 'Restaurant A',
        lat: 40.71,
        lng: -73.99,
        review: 4.8,
        price: 4,
        isRestaurant: true,
      },
    });

    await waitFor(() => {
      expect(mockPlanContext.addToPlan).toHaveBeenCalledTimes(1);
    });
    expect(mockPlanContext.setFromPlan).toHaveBeenCalledWith(false);
    // Chat input should still be rendered after activation
    expect(screen.getByPlaceholderText('Type a message...')).toBeInTheDocument();
  });

  test('does not send cleared user turns as context after clearing chat', async () => {
    const user = userEvent.setup();
    window.sessionStorage.setItem(
      'urban-gala-chat-messages:user:user-1',
      JSON.stringify([
        { text: 'Find jazz bars in Midtown', sender: 'user' },
        { text: 'Earlier bot answer', sender: 'bot' },
      ])
    );
    window.sessionStorage.setItem('urban-gala-chat-open:user:user-1', 'true');
    mockChatAPI.sendMessage.mockResolvedValue({
      response: 'Fresh answer',
      citations: [],
    });

    renderWithProviders(<AIChatWidget />);

    await user.type(screen.getByPlaceholderText('Type a message...'), 'reset context');
    await user.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() => {
      expect(screen.getByText(/chat history cleared/i)).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText('Type a message...'), 'find rooftop bars');
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() => {
      expect(mockChatAPI.sendMessage).toHaveBeenCalledWith(
        'find rooftop bars',
        [expect.objectContaining({ sender: 'bot', text: expect.stringMatching(/chat history cleared/i) })]
      );
    });
    expect(JSON.stringify(mockChatAPI.sendMessage.mock.calls[0][1])).not.toContain('Find jazz bars in Midtown');
  });
});
