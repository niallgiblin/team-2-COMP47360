import { vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AIChatWidget from '../AIChatWidget';

// Mock the API service
const mockApiService = {
  sendChatMessage: vi.fn(),
};

vi.mock('../../services/apiService', () => ({
  default: mockApiService,
}));

// Mock the auth context
const mockAuthContext = {
  user: { id: 1, username: 'testuser' },
  token: 'test-token',
  isAuthenticated: true,
};

const renderWithProviders = (component) => {
  return render(component);
};

describe('AIChatWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('renders chat widget with toggle button', () => {
    renderWithProviders(<AIChatWidget />);
    
    expect(screen.getByRole('button', { name: /chat/i })).toBeInTheDocument();
  });

  test('opens chat window when toggle button is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AIChatWidget />);
    
    const toggleButton = screen.getByRole('button', { name: /chat/i });
    await user.click(toggleButton);
    
    expect(screen.getByText(/ai assistant/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/type your message/i)).toBeInTheDocument();
  });

  test('sends message when form is submitted', async () => {
    const user = userEvent.setup();
    mockApiService.sendChatMessage.mockResolvedValue({
      message: 'Hello! How can I help you today?',
      recommendations: [],
    });
    
    renderWithProviders(<AIChatWidget />);
    
    // Open chat
    const toggleButton = screen.getByRole('button', { name: /chat/i });
    await user.click(toggleButton);
    
    // Type and send message
    const input = screen.getByPlaceholderText(/type your message/i);
    const sendButton = screen.getByRole('button', { name: /send/i });
    
    await user.type(input, 'Hello AI');
    await user.click(sendButton);
    
    await waitFor(() => {
      expect(mockApiService.sendChatMessage).toHaveBeenCalledWith('Hello AI');
    });
  });

  test('displays user message in chat', async () => {
    const user = userEvent.setup();
    mockApiService.sendChatMessage.mockResolvedValue({
      message: 'Hello! How can I help you today?',
      recommendations: [],
    });
    
    renderWithProviders(<AIChatWidget />);
    
    // Open chat
    const toggleButton = screen.getByRole('button', { name: /chat/i });
    await user.click(toggleButton);
    
    // Send message
    const input = screen.getByPlaceholderText(/type your message/i);
    const sendButton = screen.getByRole('button', { name: /send/i });
    
    await user.type(input, 'Hello AI');
    await user.click(sendButton);
    
    await waitFor(() => {
      expect(screen.getByText('Hello AI')).toBeInTheDocument();
    });
  });

  test('displays AI response in chat', async () => {
    const user = userEvent.setup();
    const aiResponse = 'Hello! How can I help you today?';
    mockApiService.sendChatMessage.mockResolvedValue({
      message: aiResponse,
      recommendations: [],
    });
    
    renderWithProviders(<AIChatWidget />);
    
    // Open chat
    const toggleButton = screen.getByRole('button', { name: /chat/i });
    await user.click(toggleButton);
    
    // Send message
    const input = screen.getByPlaceholderText(/type your message/i);
    const sendButton = screen.getByRole('button', { name: /send/i });
    
    await user.type(input, 'Hello AI');
    await user.click(sendButton);
    
    await waitFor(() => {
      expect(screen.getByText(aiResponse)).toBeInTheDocument();
    });
  });

  test('displays loading state while waiting for response', async () => {
    const user = userEvent.setup();
    mockApiService.sendChatMessage.mockImplementation(() => 
      new Promise(resolve => setTimeout(() => resolve({
        message: 'Response',
        recommendations: [],
      }), 100))
    );
    
    renderWithProviders(<AIChatWidget />);
    
    // Open chat
    const toggleButton = screen.getByRole('button', { name: /chat/i });
    await user.click(toggleButton);
    
    // Send message
    const input = screen.getByPlaceholderText(/type your message/i);
    const sendButton = screen.getByRole('button', { name: /send/i });
    
    await user.type(input, 'Hello AI');
    await user.click(sendButton);
    
    // Check for loading state
    expect(screen.getByText(/typing/i)).toBeInTheDocument();
  });

  test('handles API errors gracefully', async () => {
    const user = userEvent.setup();
    mockApiService.sendChatMessage.mockRejectedValue(new Error('API Error'));
    
    renderWithProviders(<AIChatWidget />);
    
    // Open chat
    const toggleButton = screen.getByRole('button', { name: /chat/i });
    await user.click(toggleButton);
    
    // Send message
    const input = screen.getByPlaceholderText(/type your message/i);
    const sendButton = screen.getByRole('button', { name: /send/i });
    
    await user.type(input, 'Hello AI');
    await user.click(sendButton);
    
    await waitFor(() => {
      expect(screen.getByText(/error/i)).toBeInTheDocument();
    });
  });

  test('prevents sending empty messages', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AIChatWidget />);
    
    // Open chat
    const toggleButton = screen.getByRole('button', { name: /chat/i });
    await user.click(toggleButton);
    
    // Try to send empty message
    const sendButton = screen.getByRole('button', { name: /send/i });
    await user.click(sendButton);
    
    expect(mockApiService.sendChatMessage).not.toHaveBeenCalled();
  });

  test('clears input after sending message', async () => {
    const user = userEvent.setup();
    mockApiService.sendChatMessage.mockResolvedValue({
      message: 'Response',
      recommendations: [],
    });
    
    renderWithProviders(<AIChatWidget />);
    
    // Open chat
    const toggleButton = screen.getByRole('button', { name: /chat/i });
    await user.click(toggleButton);
    
    // Send message
    const input = screen.getByPlaceholderText(/type your message/i);
    const sendButton = screen.getByRole('button', { name: /send/i });
    
    await user.type(input, 'Hello AI');
    await user.click(sendButton);
    
    await waitFor(() => {
      expect(input.value).toBe('');
    });
  });

  test('displays recommendations when provided', async () => {
    const user = userEvent.setup();
    const recommendations = [
      { id: 1, name: 'Restaurant A' },
      { id: 2, name: 'Restaurant B' },
    ];
    mockApiService.sendChatMessage.mockResolvedValue({
      message: 'Here are some recommendations',
      recommendations: recommendations,
    });
    
    renderWithProviders(<AIChatWidget />);
    
    // Open chat
    const toggleButton = screen.getByRole('button', { name: /chat/i });
    await user.click(toggleButton);
    
    // Send message
    const input = screen.getByPlaceholderText(/type your message/i);
    const sendButton = screen.getByRole('button', { name: /send/i });
    
    await user.type(input, 'Recommend me restaurants');
    await user.click(sendButton);
    
    await waitFor(() => {
      expect(screen.getByText('Restaurant A')).toBeInTheDocument();
      expect(screen.getByText('Restaurant B')).toBeInTheDocument();
    });
  });

  test('closes chat window when close button is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AIChatWidget />);
    
    // Open chat
    const toggleButton = screen.getByRole('button', { name: /chat/i });
    await user.click(toggleButton);
    
    // Verify chat is open
    expect(screen.getByText(/ai assistant/i)).toBeInTheDocument();
    
    // Close chat
    const closeButton = screen.getByRole('button', { name: /close/i });
    await user.click(closeButton);
    
    // Verify chat is closed
    expect(screen.queryByText(/ai assistant/i)).not.toBeInTheDocument();
  });

  test('handles keyboard shortcuts', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AIChatWidget />);
    
    // Open chat
    const toggleButton = screen.getByRole('button', { name: /chat/i });
    await user.click(toggleButton);
    
    // Test Enter key to send message
    const input = screen.getByPlaceholderText(/type your message/i);
    await user.type(input, 'Hello AI{enter}');
    
    expect(mockApiService.sendChatMessage).toHaveBeenCalledWith('Hello AI');
  });
}); 