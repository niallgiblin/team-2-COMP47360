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
import PlanSummary from "../components/PlanSummary";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point as turfPoint } from "@turf/helpers";

export default function FindMyVibe() {
  // State hooks for user input and results
  const [input, setInput] = useState("");           // manual text input 
  const [vibe, setVibe] = useState("");             // vibe filter
  const [venueType, setVenueType] = useState("");   //venue type
  const [cuisine, setCuisine] = useState("");       // cuisine filter
  const navigate = useNavigate();                   // navigation handler
  const [hasSearched, setHasSearched] = useState(false); // track if a search has been triggered, so the plan summary is displayed
  const [isLoading, setIsLoading] = useState(false);

  // State for all results from API and the currently displayed page
  const [allResults, setAllResults] = useState([]);
  const [paginatedResults, setPaginatedResults] = useState([]);

  // Pagination state
  const [page, setPage] = useState(1); // Use 1-based indexing for user-facing page number
  const [pageSize, setPageSize] = useState(10);
  const [totalElements, setTotalElements] = useState(0);

  // state for zone data
  const [zoneData, setZoneData] = useState(null); // GeoJSON data for zone lookups
  // Busyness state
  const [busynessMap, setBusynessMap] = useState({});

  useEffect(() => {
    fetch("/manhattanZones.geojson")
      .then((res) => res.json())
      .then((data) => setZoneData(data))
      .catch((err) => {
        console.error("Failed to load zone data:", err);
      });
  }, []);

  useEffect(() => {
    fetch(`/api/vibe/map-data`)
      .then((res) => res.json())
      .then((data) => {
        setBusynessMap(data.busyness || {});
      })
      .catch((err) => {
        console.error("Failed to fetch map-data:", err);
      });
  }, []);

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

    try {
      const requestBody = {
        vibeDescription: input || `${vibe} ${venueType} ${cuisine}`.trim(),
        maxResults: 50, // Fetch a larger set for client-side pagination
      };

      const res = await fetch(`/api/vibe/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!res.ok) throw new Error("Search failed");
      const data = await res.json();

      const locations = data.locations || [];

      const normalizedResults = locations.map((v) => {
        const priceMap = {
          "price level very cheap": 1,
          "price level cheap": 2,
          "price level moderate": 3,
          "price level expensive": 4,
          "price level very expensive": 5,
        };
        let parsedPrice = 0;
        const rawPrice = v.price;
        if (typeof rawPrice === 'number') {
          parsedPrice = rawPrice;
        } else if (typeof rawPrice === 'string') {
          parsedPrice = priceMap[rawPrice.trim().toLowerCase()] || 0;
        }

        //IMPORTANT!! REMOVE MOCK DATA FROM TAGS DEBUGGING
        const enriched = {
          ...v,
          id: v.id || `${v.name}-${v.lat}-${v.lng}`,
          latitude: v.lat,
          longitude: v.lng,
          address: v.addr || v.address || "No address provided",
          zone: v.zone || "Unknown",
          price: parsedPrice,
          description: v.description || "",
          summary: v.summary || v.description || "",
          imageUrl: v.imageUrl || v.image_url || v.image || null,
          tags: typeof v.tags === 'string' ? v.tags.split(',').map(t => t.trim()) : v.tags || ['art', 'historic', 'date night'],
        };

        const text = `${v.tags || ""} ${v.loc_type || ""} ${v.description || ""} ${v.summary || ""}`.toLowerCase();
        enriched.isRestaurant = text.includes("restaurant");
        enriched.isBar = text.includes("bar");
        enriched.isClub = text.includes("club");
        enriched.isLandmark = text.includes("landmark");

        if (zoneData && enriched.latitude && enriched.longitude) {
          const venuePoint = turfPoint([enriched.longitude, enriched.latitude]);
          const matchingZone = zoneData.features.find((feature) =>
            booleanPointInPolygon(venuePoint, feature.geometry)
          );
          if (matchingZone) {
            enriched.zoneId = matchingZone.properties.LocationID;
          }
        }
        return enriched;
      });

      setAllResults(normalizedResults);
      setPage(1); // Reset to the first page on a new search
    } catch (err) {
      console.error("Error fetching search results:", err);
      setAllResults([]);
    } finally {
      setIsLoading(false);
    }
  }, [input, vibe, venueType, cuisine, zoneData]);

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

  // Pagination handlers
  const handlePageChange = (event, newPage) => {
    setPage(newPage);
  };

  const handlePageSizeChange = (e) => {
    setPageSize(parseInt(e.target.value, 10));
    setPage(1); // Reset to first page when page size changes
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

        {/* Search Form */}
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

        {/* Filter Selects */}
        <Box
          sx={{
            display: "flex",
            flexDirection: { xs: "column", sm: "row" },
            gap: 2,
            flexWrap: "wrap",
            mb: 4,
          }}
        >
          <FormControl sx={{ flex: 1, minWidth: 120, backgroundColor: "#fff", borderRadius: 1, mt: 1 }}>
            <InputLabel id="vibe-label">Vibe</InputLabel>
            <Select labelId="vibe-label" value={vibe} label="Vibe" onChange={(e) => setVibe(e.target.value)}>
              <MenuItem value=""><em>None</em></MenuItem>
              <MenuItem value="cozy">Cozy</MenuItem>
              <MenuItem value="jazz">Jazz</MenuItem>
              <MenuItem value="trendy">Trendy</MenuItem>
              <MenuItem value="underground">Underground</MenuItem>
            </Select>
          </FormControl>

          <FormControl sx={{ flex: 1, minWidth: 120, backgroundColor: "#fff", borderRadius: 1, mt: 1 }}>
            <InputLabel id="type-label">Venue Type</InputLabel>
            <Select labelId="type-label" value={venueType} label="Venue Type" onChange={(e) => setVenueType(e.target.value)}>
              <MenuItem value=""><em>None</em></MenuItem>
              <MenuItem value="bar">Bar</MenuItem>
              <MenuItem value="club">Club</MenuItem>
              <MenuItem value="restaurant">Restaurant</MenuItem>
              <MenuItem value="rooftop">Rooftop</MenuItem>
            </Select>
          </FormControl>

          <FormControl sx={{ flex: 1, minWidth: 120, backgroundColor: "#fff", borderRadius: 1, mt: 1 }}>
            <InputLabel id="cuisine-label">Cuisine</InputLabel>
            <Select labelId="cuisine-label" value={cuisine} label="Cuisine" onChange={(e) => setCuisine(e.target.value)}>
              <MenuItem value=""><em>None</em></MenuItem>
              <MenuItem value="italian">Italian</MenuItem>
              <MenuItem value="thai">Thai</MenuItem>
              <MenuItem value="greek">Greek</MenuItem>
              <MenuItem value="mexican">Mexican</MenuItem>
            </Select>
          </FormControl>
        </Box>

        {/* Loading / Empty States */}
        {isLoading ? (
          <Typography align="center" sx={{ color: "#aaa", my: 4 }}>Loading...</Typography>
        ) : hasSearched && allResults.length === 0 ? (
          <Typography align="center" sx={{ color: "#aaa", my: 4 }}>No matching venues found.</Typography>
        ) : null}

        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, alignItems: 'flex-start', gap: 3 }}>
          {hasSearched && allResults.length > 0 && (
            <Box sx={{ width: { xs: '100%', md: 320 }, position: { md: 'sticky' }, top: { md: 80 }, alignSelf: 'flex-start' }}>
              <PlanSummary />
            </Box>
          )}

          <Box sx={{ flex: 1 }}>
            {paginatedResults.map((venue, index) => (
              <TrendingVenueCard
                key={venue.id || index}
                venue={venue}
                busynessMap={busynessMap}
                rank={index + 1}
                onGetDirections={handleGetDirections}
                onClick={() => navigate("/map-view", { state: { selectedVenue: venue } })}
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
        </Box>

        {/* Results Count */}
        {allResults.length > 0 && !isLoading && (
          <Typography variant="body2" align="center" sx={{ color: "#aaa", mt: 2 }}>
            Showing {(page - 1) * pageSize + 1}-
            {Math.min(page * pageSize, totalElements)} of {totalElements} venues
          </Typography>
        )}
      </Box>
    </PageWrapper>
  );
}