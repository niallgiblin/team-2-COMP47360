import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ForecastSlider from '../ForecastSlider';
import { vi } from 'vitest';
import { DateTime } from 'luxon';
import { ThemeProvider, createTheme } from '@mui/material/styles';

// Create a default MUI theme
const theme = createTheme();

// Helper function to render component wrapped with MUI ThemeProvider
function renderWithTheme(ui) {
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
}

describe('ForecastSlider Component', () => {
  const timestamps = [
    "2025-07-21T07:00:00Z",
    "2025-07-21T08:00:00Z",
    "2025-07-21T09:00:00Z",
  ];

  test('renders slider and formatted time when mode is forecast', () => {
    const handleChange = vi.fn();
    const selectedTimestamp = timestamps[1];

    renderWithTheme(
      <ForecastSlider
        timestamps={timestamps}
        selectedTimestamp={selectedTimestamp}
        onChange={handleChange}
        mode="forecast"
      />
    );

    const formattedDate = DateTime.fromISO(selectedTimestamp)
      .setZone("America/New_York")
      .toLocaleString(DateTime.DATETIME_MED);

    const paragraph = screen.getByText((_, el) =>
      el?.tagName.toLowerCase() === 'p' &&
      el.textContent?.includes('Forecast for:') &&
      el.textContent?.includes(formattedDate)
    );
    expect(paragraph).toBeInTheDocument();

    const slider = screen.getByRole('slider');
    expect(slider).toBeInTheDocument();

    fireEvent.change(slider, { target: { value: '2' } });
    expect(handleChange).toHaveBeenCalledWith(timestamps[2]);
  });

  test('returns null (renders nothing) if timestamps array is empty', () => {
    const { container } = renderWithTheme(
      <ForecastSlider
        timestamps={[]}
        selectedTimestamp={null}
        onChange={() => {}}
        mode="forecast"
      />
    );
    expect(container.firstChild).toBeNull();
  });

  test('does not render slider if mode is not forecast', () => {
    renderWithTheme(
      <ForecastSlider
        timestamps={timestamps}
        selectedTimestamp={timestamps[0]}
        onChange={() => {}}
        mode="past"
      />
    );
    expect(screen.queryByRole('slider')).toBeNull();
  });
});
