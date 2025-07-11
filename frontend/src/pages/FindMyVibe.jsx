import { useState, useEffect, useCallback } from "react";
import {
  Box,
  Typography,
  TextField,
  Button,
  MenuItem,
  FormControl,
  Select,
  InputLabel,
  Pagination,
} from "@mui/material";
import PageWrapper from "../components/PageWrapper";
import TrendingVenueCard from "../components/TrendingVenueCard";
import { useNavigate } from "react-router-dom";
import PlanSummary from '../components/PlanSummary';

export default function FindMyVibe() {
  // State for form inputs
  const [input, setInput] = useState("");
  const [vibe, setVibe] = useState("");
  const [venueType, setVenueType] = useState("");
  const [cuisine, setCuisine] = useState("");

  // State for results and UI
  const [allResults, setAllResults] = useState([]); // Stores all results from the API
  const [paginatedResults, setPaginatedResults] = useState([]); // Stores results for the current page
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Pagination state
  const [page, setPage] = useState(1); // Use 1-based indexing for user-facing page number
  const [pageSize, setPageSize] = useState(10);
  const [totalElements, setTotalElements] = useState(0);

  // Navigation
  const navigate = useNavigate();

  // Handle navigation to map page
  const handleGetDirections = (venue) => {
    navigate("/map", { state: { selectedVenue: venue } });
  };

  // Main search function to fetch data from the backend
  const performSearch = useCallback(async () => {
    // Prevent search if no filters or text input are provided
    if (!input && !vibe && !venueType && !cuisine) {
      setAllResults([]);
      setHasSearched(true);
      return;
    }

    setIsLoading(true);
    setHasSearched(true);

    const requestBody = {
      vibeDescription: input || `${vibe} ${venueType} ${cuisine}`.trim(),
      maxResults: 50, // Fetch a larger set of results for client-side pagination
    };

    try {
      const res = await fetch(`http://localhost:8080/vibe/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!res.ok) throw new Error("Search failed");
      const data = await res.json();

      // The API seems to cap at 5 results, so we'll work with that.
      const locations = (data.locations || []).slice(0, 5);

      const normalizedResults = locations.map((v, index) => ({
        ...v,
        id: v.id || `${v.name}-${index}`, // Ensure a unique key
        latitude: v.lat,
        longitude: v.lng,
        address: v.addr || v.address || "No address provided",
        zone: v.zone || "Unknown",
        price: v.price || "",
        description: v.description || "",
      }));

      setAllResults(normalizedResults);
      setPage(1); // Reset to the first page on a new search
    } catch (err) {
      console.error("Error fetching search results:", err);
      setAllResults([]);
    } finally {
      setIsLoading(false);
    }
  }, [input, vibe, venueType, cuisine]);

  // Effect for client-side pagination
  // This runs when the full result set changes, or when page/pageSize is updated.
  useEffect(() => {
    const total = allResults.length;
    setTotalElements(total);

    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    setPaginatedResults(allResults.slice(startIndex, endIndex));
  }, [allResults, page, pageSize]);

  // Form submission handler
  const handleFormSubmit = (e) => {
    e.preventDefault();
    performSearch();
  };

  // Handle page change from Pagination component
  const handlePageChange = (event, newPage) => {
    setPage(newPage);
  };

  // Handle page size change
  const handlePageSizeChange = (e) => {
    setPageSize(parseInt(e.target.value, 10));
    setPage(1); // Reset to first page
  };

  const totalPages = Math.ceil(totalElements / pageSize);

  return (
    <PageWrapper fullWidth>
      <Box sx={{ maxWidth: 1000, mx: "auto", mb: 10, px: 2 }}>
        <Typography
          variant="h4"
          align="center"
          gutterBottom
          sx={{
            fontWeight: "bold",
            background: "linear-gradient(to right, #3ABEFF, #FF4ECD)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          Find Your Vibe
        </Typography>
        <Typography
          variant="body2"
          align="center"
          sx={{ mb: 4, color: "#aaa" }}
        >
          Describe your perfect night out — or choose from the filters below.
        </Typography>

        <Box
          component="form"
          onSubmit={handleFormSubmit}
          sx={{
            display: "flex",
            gap: 2,
            mb: 4,
            flexDirection: { xs: "column", sm: "row" },
            alignItems: "stretch",
          }}
        >
          <TextField
            fullWidth
            label="e.g. cosy Jazz cafe"
            variant="outlined"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            sx={{
              backgroundColor: "#fff",
              borderRadius: 1,
              flex: 1,
              "& .MuiInputBase-input": {
                height: "24px",
                padding: "16.5px 14px",
              },
            }}
          />
          <Button
            variant="contained"
            type="submit"
            disabled={isLoading}
            sx={{
              background: "linear-gradient(to right, #3ABEFF, #FF4ECD)",
              height: "56px",
              color: "#121212",
              fontWeight: "bold",
              px: 4,
              py: 1.5,
              fontSize: "1rem",
              borderRadius: "8px",
              whiteSpace: "nowrap",
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.2)",
              "&:hover": {
                background: "linear-gradient(to right, #5F3AFF, #FF6EDB)",
              },
            }}
          >
            {isLoading ? "Searching..." : "Find My Vibe"}
          </Button>
        </Box>

        <Box
          sx={{
            display: "flex",
            flexDirection: { xs: "column", sm: "row" },
            gap: 2,
            flexWrap: "wrap",
            mb: 4,
          }}
        >
          <FormControl
            sx={{
              flex: 1,
              minWidth: 120,
              backgroundColor: "#fff",
              borderRadius: 1,
              mt: 1,
            }}
          >
            <InputLabel id="vibe-label">Vibe</InputLabel>
            <Select
              labelId="vibe-label"
              value={vibe}
              label="Vibe"
              onChange={(e) => setVibe(e.target.value)}
            >
              <MenuItem value="">
                <em>None</em>
              </MenuItem>
              <MenuItem value="cozy">Cozy</MenuItem>
              <MenuItem value="jazz">Jazz</MenuItem>
              <MenuItem value="trendy">Trendy</MenuItem>
              <MenuItem value="underground">Underground</MenuItem>
            </Select>
          </FormControl>

          <FormControl
            sx={{
              flex: 1,
              minWidth: 120,
              backgroundColor: "#fff",
              borderRadius: 1,
              mt: 1,
            }}
          >
            <InputLabel id="type-label">Venue Type</InputLabel>
            <Select
              labelId="type-label"
              value={venueType}
              label="Venue Type"
              onChange={(e) => setVenueType(e.target.value)}
            >
              <MenuItem value="">
                <em>None</em>
              </MenuItem>
              <MenuItem value="bar">Bar</MenuItem>
              <MenuItem value="club">Club</MenuItem>
              <MenuItem value="restaurant">Restaurant</MenuItem>
              <MenuItem value="rooftop">Rooftop</MenuItem>
            </Select>
          </FormControl>

          <FormControl
            sx={{
              flex: 1,
              minWidth: 120,
              backgroundColor: "#fff",
              borderRadius: 1,
              mt: 1,
            }}
          >
            <InputLabel id="cuisine-label">Cuisine</InputLabel>
            <Select
              labelId="cuisine-label"
              value={cuisine}
              label="Cuisine"
              onChange={(e) => setCuisine(e.target.value)}
            >
              <MenuItem value="">
                <em>None</em>
              </MenuItem>
              <MenuItem value="italian">Italian</MenuItem>
              <MenuItem value="thai">Thai</MenuItem>
              <MenuItem value="greek">Greek</MenuItem>
              <MenuItem value="mexican">Mexican</MenuItem>
            </Select>
          </FormControl>
        </Box>

        {isLoading ? (
          <Typography align="center" sx={{ color: "#aaa", my: 4 }}>
            Loading...
          </Typography>
        ) : hasSearched && paginatedResults.length === 0 ? (
          <Typography align="center" sx={{ color: "#aaa", my: 4 }}>
            No matching venues found. Try a different vibe!
          </Typography>
        ) : null}

        <Box
          sx={{
            display: "flex",
            flexDirection: { xs: "column", md: "row" },
            alignItems: "flex-start",
            gap: 3,
          }}
        >
          <Box sx={{ flex: 3, width: "100%" }}>
            {paginatedResults.map((venue) => (
              <TrendingVenueCard
                key={venue.id}
                venue={venue}
                onGetDirections={() => handleGetDirections(venue)}
              />
            ))}
            {totalPages > 1 && (
              <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", mt: 4, gap: 2, flexWrap: 'wrap' }}>
                <Pagination
                  count={totalPages}
                  page={page}
                  onChange={handlePageChange}
                  color="primary"
                  sx={{
                    "& .MuiPaginationItem-root": { color: "white" },
                    "& .Mui-selected": {
                      background: "linear-gradient(to right, #3ABEFF, #FF4ECD)",
                      color: "black",
                    },
                  }}
                />
                <FormControl size="small" sx={{ minWidth: 120, backgroundColor: 'white', borderRadius: 1 }}>
                  <InputLabel id="page-size-label">Per Page</InputLabel>
                  <Select
                    labelId="page-size-label"
                    value={pageSize}
                    label="Per Page"
                    onChange={handlePageSizeChange}
                  >
                    <MenuItem value={10}>10</MenuItem>
                    <MenuItem value={20}>20</MenuItem>
                    <MenuItem value={50}>50</MenuItem>
                  </Select>
                </FormControl>
              </Box>
            )}
          </Box>
          <Box sx={{ flex: 2, width: "100%", position: "sticky", top: "20px" }}>
            <PlanSummary />
          </Box>
        </Box>
      </Box>
    </PageWrapper>
  );
}
