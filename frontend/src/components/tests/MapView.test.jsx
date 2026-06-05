import { vi, describe, test, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { DateTime } from 'luxon';
import MapView from '../../pages/MapView';
import { getFallbackForecastTimestamps } from '../../utils/forecastTimes';
import { enrichVenuesWithZones } from '../../utils/zoneEnrichment';
import { FALLBACK_POLYLINE_NOTICE } from '../../utils/routeNormalizer';
import {
  EMPTY_DIRECTIONS_BODY,
  EMPTY_DIRECTIONS_HEADING,
} from '../DirectionSidebar';

const theme = createTheme();

const planVenues = [
  { id: 1, name: 'Venue A', lat: 40.7589, lng: -73.9851 },
  { id: 2, name: 'Venue B', lat: 40.7614, lng: -73.9778 },
];

const threeStopPlanVenues = [
  ...planVenues,
  { id: 3, name: 'Venue C', lat: 40.7505, lng: -73.9934 },
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

const demoMapProps = { current: null };

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
  default: (props) => {
    demoMapProps.current = props;
    return <div data-testid="demo-map">Demo Map</div>;
  },
}));

const forecastSliderProps = { current: null };
vi.mock('../ForecastSlider', () => ({
  default: (props) => {
    forecastSliderProps.current = props;
    return props.mode === 'forecast' ? (
      <div data-testid="forecast-slider">{props.timestamps?.length ?? 0}</div>
    ) : null;
  },
}));

vi.mock('../CompactPlanSummary', () => ({ default: () => null }));
vi.mock('../CompactSavedPlans', () => ({ default: () => null }));
vi.mock('../CompactFavorites', () => ({ default: () => null }));
vi.mock('../CompactSharedPlans', () => ({ default: () => null }));
vi.mock('../SharedPlans', () => ({ default: () => null }));
vi.mock('../VenueCard', () => ({ default: () => null }));

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

vi.mock('../../utils/zoneEnrichment', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    enrichVenuesWithZones: vi.fn((venues, zoneData) =>
      actual.enrichVenuesWithZones(venues, zoneData)
    ),
  };
});

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
    forecastSliderProps.current = null;
    demoMapProps.current = null;
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

  test('uses 12 fallback forecast timestamps when backend forecast points are absent', async () => {
    renderMapView();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /forecast/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /forecast/i }));

    await waitFor(() => {
      expect(screen.getByTestId('forecast-slider')).toHaveTextContent('12');
    });

    const expected = getFallbackForecastTimestamps(
      DateTime.now(),
      12,
      'America/New_York'
    );
    expect(forecastSliderProps.current.timestamps).toHaveLength(12);
    expect(forecastSliderProps.current.timestamps[0]).toBe(expected[0]);
  });

  test('preserves backend zoneId when enriching plan venues', async () => {
    mockPlanState = {
      plan: [{ ...planVenues[0], zoneId: '77' }, planVenues[1]],
      fromPlan: true,
      setFromPlan: vi.fn(),
    };

    renderMapView();

    await waitFor(() => {
      expect(enrichVenuesWithZones).toHaveBeenCalled();
      const result = enrichVenuesWithZones.mock.results.at(-1)?.value;
      expect(result?.[0]?.zoneId).toBe('77');
    });
  });

  test('does not select a default venue when opening map view without a plan', async () => {
    mockPlanState = {
      plan: [],
      fromPlan: false,
      setFromPlan: vi.fn(),
    };

    renderMapView();

    await waitFor(() => {
      expect(screen.getByTestId('demo-map')).toBeInTheDocument();
      expect(demoMapProps.current?.fromPlan).toBe(false);
      expect(demoMapProps.current?.selectedVenue).toBeNull();
    });
  });

  test('does not alert when Get Directions clicked without a start location', async () => {
    mockPlanState = {
      plan: [],
      fromPlan: false,
      setFromPlan: vi.fn(),
    };

    renderMapView();
    await waitFor(() => {
      expect(screen.getByLabelText(/destination/i)).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText(/destination/i), {
      target: { value: 'Times Square' },
    });
    await openDirectionsDrawer();

    await waitFor(() => {
      expect(window.alert).not.toHaveBeenCalled();
      expect(screen.getByText(EMPTY_DIRECTIONS_HEADING)).toBeInTheDocument();
      expect(screen.getByText(EMPTY_DIRECTIONS_BODY)).toBeInTheDocument();
    });
  });

  test('shows empty directions heading when drawer opens before route resolves', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url) => {
        if (typeof url === 'string' && url.includes('routes.googleapis.com')) {
          return new Promise(() => {});
        }
        return defaultFetchHandler(url);
      })
    );

    renderMapView();
    await openDirectionsDrawer();

    await waitFor(() => {
      expect(screen.getByText('No directions available')).toBeInTheDocument();
    });
  });

  test('shows empty state body copy per UI-SPEC', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url) => {
        if (typeof url === 'string' && url.includes('routes.googleapis.com')) {
          return new Promise(() => {});
        }
        return defaultFetchHandler(url);
      })
    );

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
      expect(screen.getByText(FALLBACK_POLYLINE_NOTICE)).toBeInTheDocument();
    });
  });

  test('uses one Google route call for multi-stop walking plans', async () => {
    let routeCalls = 0;
    fetch.mockImplementation(async (url) => {
      if (typeof url === 'string' && url.includes('routes.googleapis.com')) {
        routeCalls += 1;
        return {
          ok: true,
          json: async () => ({
            routes: [{
              legs: [
                {
                  steps: [{
                    navigationInstruction: { instructions: 'Walk north' },
                    distanceMeters: 100,
                    staticDuration: '120s',
                  }],
                  startLocation: { latLng: { latitude: 40.7589, longitude: -73.9851 } },
                  endLocation: { latLng: { latitude: 40.7614, longitude: -73.9778 } },
                },
              ],
              polyline: { encodedPolyline: '_p~iF~ps|U_ulLnnqC_mqNvxq`@' },
            }],
          }),
        };
      }
      return defaultFetchHandler(url);
    });

    renderMapView();
    await openDirectionsDrawer();

    await waitFor(() => {
      expect(routeCalls).toBe(1);
      expect(screen.getByText(/Walk north/)).toBeInTheDocument();
    });
  });

  test('routes every walking plan leg even when fromPlan flag has not caught up', async () => {
    mockPlanState = {
      plan: threeStopPlanVenues,
      fromPlan: false,
      setFromPlan: vi.fn(),
    };

    let routeCalls = 0;
    fetch.mockImplementation(async (url, options) => {
      if (typeof url === 'string' && url.includes('routes.googleapis.com')) {
        routeCalls += 1;
        const body = JSON.parse(options.body);

        expect(body.origin.location.latLng).toEqual({
          latitude: threeStopPlanVenues[0].lat,
          longitude: threeStopPlanVenues[0].lng,
        });
        expect(body.intermediates).toHaveLength(1);
        expect(body.intermediates[0].location.latLng).toEqual({
          latitude: threeStopPlanVenues[1].lat,
          longitude: threeStopPlanVenues[1].lng,
        });
        expect(body.destination.location.latLng).toEqual({
          latitude: threeStopPlanVenues[2].lat,
          longitude: threeStopPlanVenues[2].lng,
        });

        return {
          ok: true,
          json: async () => ({
            routes: [{
              legs: [
                {
                  steps: [{
                    navigationInstruction: { instructions: 'Walk from first to second' },
                    distanceMeters: 100,
                    staticDuration: '120s',
                  }],
                  startLocation: { latLng: { latitude: threeStopPlanVenues[0].lat, longitude: threeStopPlanVenues[0].lng } },
                  endLocation: { latLng: { latitude: threeStopPlanVenues[1].lat, longitude: threeStopPlanVenues[1].lng } },
                },
                {
                  steps: [{
                    navigationInstruction: { instructions: 'Walk from second to third' },
                    distanceMeters: 200,
                    staticDuration: '180s',
                  }],
                  startLocation: { latLng: { latitude: threeStopPlanVenues[1].lat, longitude: threeStopPlanVenues[1].lng } },
                  endLocation: { latLng: { latitude: threeStopPlanVenues[2].lat, longitude: threeStopPlanVenues[2].lng } },
                },
              ],
              polyline: { encodedPolyline: '_p~iF~ps|U_ulLnnqC_mqNvxq`@' },
            }],
          }),
        };
      }
      return defaultFetchHandler(url);
    });

    renderMapView();
    await openDirectionsDrawer();

    await waitFor(() => {
      expect(routeCalls).toBe(1);
      expect(screen.getByText(/Venue A -> Venue B/)).toBeInTheDocument();
      expect(screen.getByText(/Venue B -> Venue C/)).toBeInTheDocument();
      expect(screen.getByText(/Walk from second to third/)).toBeInTheDocument();
    });
  });

  test('renders leg headings with Start -> Destination text', async () => {
    fetch.mockImplementation(async (url) => {
      if (typeof url === 'string' && url.includes('routes.googleapis.com')) {
        return {
          ok: true,
          json: async () => ({
            routes: [{
              legs: [{
                steps: [{
                  navigationInstruction: { instructions: 'Walk north' },
                  distanceMeters: 100,
                  staticDuration: '120s',
                }],
                startLocation: { latLng: { latitude: 40.7589, longitude: -73.9851 } },
                endLocation: { latLng: { latitude: 40.7614, longitude: -73.9778 } },
              }],
              polyline: { encodedPolyline: '_p~iF~ps|U_ulLnnqC_mqNvxq`@' },
            }],
          }),
        };
      }
      return defaultFetchHandler(url);
    });

    renderMapView();
    await openDirectionsDrawer();

    await waitFor(() => {
      expect(screen.getByText(/Venue A -> Venue B/)).toBeInTheDocument();
    });
  });

  test('labels walking plan legs from custom start to first venue before final venue', async () => {
    fetch.mockImplementation(async (url, options) => {
      if (typeof url === 'string' && url.includes('nominatim.openstreetmap.org')) {
        return {
          ok: true,
          json: async () => [{ lat: '40.7484', lon: '-73.9857' }],
        };
      }
      if (typeof url === 'string' && url.includes('routes.googleapis.com')) {
        const body = JSON.parse(options.body);

        expect(body.origin.location.latLng).toEqual({
          latitude: 40.7484,
          longitude: -73.9857,
        });
        expect(body.destination.location.latLng).toEqual({
          latitude: planVenues[1].lat,
          longitude: planVenues[1].lng,
        });
        expect(body.intermediates).toHaveLength(1);
        expect(body.intermediates[0].location.latLng).toEqual({
          latitude: planVenues[0].lat,
          longitude: planVenues[0].lng,
        });

        return {
          ok: true,
          json: async () => ({
            routes: [{
              legs: [
                {
                  steps: [{
                    navigationInstruction: { instructions: 'Walk from custom start' },
                    distanceMeters: 100,
                    staticDuration: '120s',
                  }],
                  startLocation: { latLng: { latitude: 40.7484, longitude: -73.9857 } },
                  endLocation: { latLng: { latitude: planVenues[0].lat, longitude: planVenues[0].lng } },
                },
                {
                  steps: [{
                    navigationInstruction: { instructions: 'Continue to second venue' },
                    distanceMeters: 200,
                    staticDuration: '180s',
                  }],
                  startLocation: { latLng: { latitude: planVenues[0].lat, longitude: planVenues[0].lng } },
                  endLocation: { latLng: { latitude: planVenues[1].lat, longitude: planVenues[1].lng } },
                },
              ],
              polyline: { encodedPolyline: '_p~iF~ps|U_ulLnnqC_mqNvxq`@' },
            }],
          }),
        };
      }
      return defaultFetchHandler(url);
    });

    renderMapView();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /get directions/i })).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText(/start location/i), {
      target: { value: 'empire state building' },
    });
    fireEvent.click(screen.getByRole('button', { name: /get directions/i }));

    await waitFor(() => {
      expect(screen.getByText(/Start -> Venue A/)).toBeInTheDocument();
      expect(screen.getByText(/Venue A -> Venue B/)).toBeInTheDocument();
    });
  });

  test('keeps directions available for the current plan after reset map', async () => {
    renderMapView();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /get directions/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /get directions/i }));

    await waitFor(() => {
      expect(screen.getByText(/hide directions/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/reset map/i));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /get directions/i })).toBeInTheDocument();
    });
  });
});
