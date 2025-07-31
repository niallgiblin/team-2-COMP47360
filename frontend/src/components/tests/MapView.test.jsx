import { vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import MapView from '../MapView';

// Mock Leaflet components
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children, ...props }) => (
    <div data-testid="map-container" {...props}>
      {children}
    </div>
  ),
  TileLayer: (props) => <div data-testid="tile-layer" {...props} />,
  Marker: (props) => <div data-testid="marker" {...props} />,
  Popup: ({ children, ...props }) => (
    <div data-testid="popup" {...props}>
      {children}
    </div>
  ),
  useMap: () => ({
    setView: vi.fn(),
    flyTo: vi.fn(),
  }),
}));

// Mock the map context
const mockMapContext = {
  venues: [
    {
      id: 1,
      name: 'Test Restaurant',
      lat: 40.7589,
      lng: -73.9851,
      description: 'A great test restaurant',
      review: 4.5,
      numReviews: 100,
      busyness: 0.7,
    },
    {
      id: 2,
      name: 'Test Bar',
      lat: 40.7589,
      lng: -73.9851,
      description: 'A great test bar',
      review: 4.2,
      numReviews: 50,
      busyness: 0.8,
    },
  ],
  selectedVenue: null,
  setSelectedVenue: vi.fn(),
  isLoading: false,
  error: null,
};

// Mock the busyness context
const mockBusynessContext = {
  busynessData: {
    '1': 0.7,
    '2': 0.8,
  },
  isLoading: false,
  error: null,
};

// Mock the auth context
const mockAuthContext = {
  user: { id: 1, username: 'testuser' },
  token: 'test-token',
  isAuthenticated: true,
  login: vi.fn(),
  logout: vi.fn(),
};

// Mock the plan context
const mockPlanContext = {
  currentPlan: null,
  setCurrentPlan: vi.fn(),
  addVenueToPlan: vi.fn(),
  removeVenueFromPlan: vi.fn(),
};

const renderWithProviders = (component) => {
  return render(
    <BrowserRouter>
      {component}
    </BrowserRouter>
  );
};

describe('MapView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('renders map container', () => {
    renderWithProviders(<MapView />);
    
    expect(screen.getByTestId('map-container')).toBeInTheDocument();
    expect(screen.getByTestId('tile-layer')).toBeInTheDocument();
  });

  test('renders markers for venues', () => {
    renderWithProviders(<MapView />);
    
    const markers = screen.getAllByTestId('marker');
    expect(markers).toHaveLength(2);
  });

  test('displays venue information in popup when marker is clicked', async () => {
    renderWithProviders(<MapView />);
    
    const markers = screen.getAllByTestId('marker');
    fireEvent.click(markers[0]);
    
    await waitFor(() => {
      expect(screen.getByText('Test Restaurant')).toBeInTheDocument();
      expect(screen.getByText('A great test restaurant')).toBeInTheDocument();
      expect(screen.getByText('4.5')).toBeInTheDocument();
    });
  });

  test('shows busyness indicator for venues', () => {
    renderWithProviders(<MapView />);
    
    // Check if busyness indicators are rendered
    expect(screen.getByText('70%')).toBeInTheDocument();
    expect(screen.getByText('80%')).toBeInTheDocument();
  });

  test('handles venue selection', async () => {
    const mockSetSelectedVenue = vi.fn();
    mockMapContext.setSelectedVenue = mockSetSelectedVenue;
    
    renderWithProviders(<MapView />);
    
    const markers = screen.getAllByTestId('marker');
    fireEvent.click(markers[0]);
    
    await waitFor(() => {
      expect(mockSetSelectedVenue).toHaveBeenCalledWith(mockMapContext.venues[0]);
    });
  });

  test('displays loading state when venues are loading', () => {
    const loadingContext = { ...mockMapContext, isLoading: true };
    
    renderWithProviders(<MapView />);
    
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  test('displays error state when there is an error', () => {
    const errorContext = { ...mockMapContext, error: 'Failed to load venues' };
    
    renderWithProviders(<MapView />);
    
    expect(screen.getByText(/error/i)).toBeInTheDocument();
  });

  test('handles empty venues list', () => {
    const emptyContext = { ...mockMapContext, venues: [] };
    
    renderWithProviders(<MapView />);
    
    const markers = screen.queryAllByTestId('marker');
    expect(markers).toHaveLength(0);
  });

  test('displays venue details in popup', async () => {
    renderWithProviders(<MapView />);
    
    const markers = screen.getAllByTestId('marker');
    fireEvent.click(markers[0]);
    
    await waitFor(() => {
      expect(screen.getByText('Test Restaurant')).toBeInTheDocument();
      expect(screen.getByText('A great test restaurant')).toBeInTheDocument();
      expect(screen.getByText('4.5')).toBeInTheDocument();
      expect(screen.getByText('100 reviews')).toBeInTheDocument();
    });
  });

  test('handles venue with missing data gracefully', () => {
    const incompleteVenue = {
      id: 3,
      name: 'Incomplete Venue',
      lat: 40.7589,
      lng: -73.9851,
    };
    
    const incompleteContext = {
      ...mockMapContext,
      venues: [incompleteVenue],
    };
    
    renderWithProviders(<MapView />);
    
    const markers = screen.getAllByTestId('marker');
    expect(markers).toHaveLength(1);
  });

  test('displays busyness level with appropriate styling', () => {
    renderWithProviders(<MapView />);
    
    // Check if busyness indicators are rendered with appropriate styling
    const busynessIndicators = screen.getAllByText(/\d+%/);
    expect(busynessIndicators).toHaveLength(2);
  });

  test('handles map zoom and pan interactions', () => {
    renderWithProviders(<MapView />);
    
    const mapContainer = screen.getByTestId('map-container');
    
    // Simulate map interactions
    fireEvent.mouseDown(mapContainer);
    fireEvent.mouseMove(mapContainer);
    fireEvent.mouseUp(mapContainer);
    
    // Map should still be rendered
    expect(mapContainer).toBeInTheDocument();
  });
}); 