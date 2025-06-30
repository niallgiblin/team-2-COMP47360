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
  // State hooks
  const [input, setInput] = useState("");
  const [results, setResults] = useState([]);
  const [vibe, setVibe] = useState("");
  const [venueType, setVenueType] = useState("");
  const [cuisine, setCuisine] = useState("");
  const navigate = useNavigate();

  // Pagination state
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(0);
  const [totalElements, setTotalElements] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const handleGetDirections = (venue) => {
    navigate("/map", { state: { selectedVenue: venue } });
  };

  // Memoized search function
  const handleSearch = useCallback(() => {
    if (!input && !vibe && !venueType && !cuisine) {
      setResults([]);
      setTotalPages(0);
      setTotalElements(0);
      return;
    }

    setIsLoading(true);

    // Build the request body for vibe search
    const requestBody = {
      vibeDescription: input || `${vibe} ${venueType} ${cuisine}`.trim(),
      maxResults: pageSize * 10 // Get more results for pagination
    };

    fetch(`http://localhost:8080/vibe/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    })
      .then((res) => {
        if (!res.ok) throw new Error("Search failed");
        return res.json();
      })
      .then((data) => {
        // Extract locations from the vibe search response
        const locations = data.locations || [];
        
        // Handle pagination manually since vibe search doesn't support it natively
        const totalElements = locations.length;
        const totalPages = Math.ceil(totalElements / pageSize);
        const startIndex = page * pageSize;
        const endIndex = startIndex + pageSize;
        const paginatedResults = locations.slice(startIndex, endIndex);
        
        setResults(paginatedResults);
        setTotalPages(totalPages);
        setTotalElements(totalElements);
      })
      .catch((err) => {
        console.error("Error fetching search results:", err);
        setResults([]);
        setTotalPages(0);
        setTotalElements(0);
      })
      .finally(() => setIsLoading(false));
  }, [input, vibe, venueType, cuisine, page, pageSize]);

  // Handle page change
  const handlePageChange = (event, newPage) => {
    setPage(newPage - 1); // MUI Pagination uses 1-based index
  };

  // Handle page size change
  const handlePageSizeChange = (e) => {
    setPageSize(e.target.value);
    setPage(0); // Reset to first page when changing size
  };

  // Trigger search when filters or pagination changes
  useEffect(() => {
    handleSearch();
  }, [handleSearch]);



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
          onSubmit={(e) => {
            e.preventDefault();
            setPage(0); // Reset to first page on new search
          }}
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
            Find My Vibe
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
          <Typography align="center" sx={{ color: "#aaa", mb: 4 }}>
            Loading...
          </Typography>
        ) : results.length === 0 && (input || vibe || venueType || cuisine) ? (
          <Typography align="center" sx={{ color: "#aaa", mb: 4 }}>
            No matching venues found.
          </Typography>
        ) : null}

        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', md: 'row' },
            alignItems: 'flex-start',
            gap: 3,
          }}
        >
          {/* Left: Sidebar PlanSummary */}
          <Box
            sx={{
              width: { xs: '100%', md: 320 },
              position: { md: 'sticky' },
              top: { md: 80 },
              alignSelf: 'flex-start',
            }}
          >
            <PlanSummary />
          </Box>

          {/* Right: Venue list */}
          <Box sx={{ flex: 1 }}>
            {results.map((venue, index) => (
              <TrendingVenueCard
                key={venue.id}
                venue={venue}
                rank={index + 1}
                onGetDirections={handleGetDirections}
                onClick={() =>
                  navigate("/map-view", { state: { selectedVenue: venue } })
                }
              />
            ))}
          </Box>
        </Box>



        {totalPages > 1 && (
          <Box
            sx={{
              display: "flex",
              justifyContent: "center",
              mt: 3,
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <Pagination
              count={totalPages}
              page={page + 1}
              onChange={handlePageChange}
              color="primary"
              showFirstButton
              showLastButton
              sx={{ my: 2 }}
            />
            <FormControl sx={{ minWidth: 120, mt: 2 }}>
              <InputLabel>Items per page</InputLabel>
              <Select
                value={pageSize}
                label="Items per page"
                onChange={handlePageSizeChange}
              >
                <MenuItem value={10}>10</MenuItem>
                <MenuItem value={20}>20</MenuItem>
                <MenuItem value={50}>50</MenuItem>
              </Select>
            </FormControl>
          </Box>
        )}

        {totalElements > 0 && (
          <Typography
            variant="body2"
            align="center"
            sx={{ color: "#aaa", mt: 2 }}
          >
            Showing {page * pageSize + 1}-
            {Math.min((page + 1) * pageSize, totalElements)} of {totalElements}{" "}
            venues
          </Typography>
        )}
      </Box>
    </PageWrapper>
  );
}
