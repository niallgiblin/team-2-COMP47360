import { vi, describe, test, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import MapView from '../../pages/MapView';

const theme = createTheme();

const planVenues = [
  { id: 1, name: 'Venue A', lat: 40.7589, lng: -73.9851 },
  { id: 2, name: 'Venue B', lat: 40.7614, lng: -73.9778 },
];

let mockPlanState = {
  plan: planVenues,
  fromPlan: true,
  setFromPlan: vi.fn(),
};

const localStorageMock = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => {
      store[key] = value.toString();
    },
    removeItem: (key) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children, ...props }) => (
    <div data-testid="map-container" {...props}>{children}</div>
  ),
  TileLayer: (props) => <div data-testid="tile-layer" {...props} />,
  Marker: (props) => <div data-testid="marker" {...props} />,
  Popup: ({ children, ...props }) => (
    <div data-testid="popup" {...props}>{children}</div>
  ),
  useMap: () => ({ setView: vi.fn(), flyTo: vi.fn() }),
}));

vi.mock('../DemoMap', () => ({
  default: () => <div data-testid="demo-map">Demo Map</div>,
}));

vi.mock('../CompactPlanSummary', () => ({ default: () => null }));
vi.mock('../CompactSavedPlans', () => ({ default: () => null }));
vi.mock('../CompactFavorites', () => ({ default: () => null }));
vi.mock('../CompactSharedPlans', () => ({ default: () => null }));
vi.mock('../SharedPlans', () => ({ default: () => null }));
vi.mock('../VenueCard', () => ({ default: () => null }));
vi.mock('../ForecastSlider', () => ({ default: () => null }));

const mockFetchAllData = vi.fn().mockResolvedValue(undefined);

vi.mock('../../context/BusynessContext', () => ({
  useBusyness: () => ({
    busynessData: [{ LocationID: '1', busyness: 0.5 }],
    predictionData: [],
    fetchAllData: mockFetchAllData,
  }),
}));

vi.mock('../../context/PlanContext', () => ({
  usePlan: () => mockPlanState,
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, username: 'testuser' },
    token: 'test-token',
    isAuthenticated: true,
  }),
}));

function defaultFetchHandler(url) {
  if (typeof url === 'string' && url.includes('manhattanZones.geojson')) {
    return {
      ok: true,
      json: async () => ({ type: 'FeatureCollection', features: [] }),
    };
  }
  if (typeof url === 'string' && url.includes('/api/vibe/map-data')) {
    return {
      ok: true,
      json: async () => ({ locations: planVenues, busyness: {} }),
    };
  }
  if (typeof url === 'string' && url.includes('routes.googleapis.com')) {
    return { ok: false, status: 503, text: async () => 'unavailable' };
  }
  return { ok: false, status: 404, json: async () => ({}) };
}

function renderMapView() {
  return render(
    <BrowserRouter>
      <ThemeProvider theme={theme}>
        <MapView />
      </ThemeProvider>
    </BrowserRouter>
  );
}

async function openDirectionsDrawer() {
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /get directions/i })).toBeInTheDocument();
  });
  fireEvent.click(screen.getByRole('button', { name: /get directions/i }));
}

describe('MapView route and sidebar integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPlanState = {
      plan: planVenues,
      fromPlan: true,
      setFromPlan: vi.fn(),
    };
    Object.defineProperty(window, 'localStorage', { value: localStorageMock, configurable: true });
    localStorage.clear();
    window.scrollTo = vi.fn();
    window.alert = vi.fn();
    Element.prototype.scrollIntoView = vi.fn();
    vi.stubGlobal('fetch', vi.fn(defaultFetchHandler));
    vi.stubEnv('VITE_GOOGLE_API_KEY', 'test-key');
  });

  test('imports MapView from pages and renders map shell', async () => {
    renderMapView();

    await waitFor(() => {
      expect(screen.getByTestId('demo-map')).toBeInTheDocument();
    });
  });

  test('shows empty directions heading when directions drawer is open with no steps', async () => {
    renderMapView();
    await openDirectionsDrawer();

    await waitFor(() => {
      expect(screen.getByText(/No directions available/i)).toBeInTheDocument();
    });
  });

  test('shows empty state body copy per UI-SPEC', async () => {
    renderMapView();
    await openDirectionsDrawer();

    await waitFor(() => {
      expect(
        screen.getByText('Choose a start and destination, then get directions.')
      ).toBeInTheDocument();
    });
  });

  test('shows route error copy when Google route request fails', async () => {
    renderMapView();
    await openDirectionsDrawer();

    await waitFor(() => {
      expect(
        screen.getByText(
          'We could not load this route. Check the start and destination, then try again.'
        )
      ).toBeInTheDocument();
    });
  });

  test('shows fallback route notice when detailed geometry is unavailable', async () => {
    fetch.mockImplementation(async (url) => {
      if (typeof url === 'string' && url.includes('routes.googleapis.com')) {
        return {
          ok: true,
          json: async () => ({
            routes: [{
              legs: [{
                steps: [],
                startLocation: { latLng: { latitude: 40.7589, longitude: -73.9851 } },
                endLocation: { latLng: { latitude: 40.7614, longitude: -73.9778 } },
              }],
              polyline: null,
            }],
          }),
        };
      }
      return defaultFetchHandler(url);
    });

    renderMapView();
    await openDirectionsDrawer();

    await waitFor(() => {
      expect(
        screen.getByText(
          'Showing an approximate route because detailed route geometry is unavailable.'
        )
      ).toBeInTheDocument();
    });
  });
});
