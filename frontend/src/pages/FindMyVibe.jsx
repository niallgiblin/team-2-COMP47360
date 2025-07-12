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
  const [results, setResults] = useState([]);       // search results (list of venues)
  const [vibe, setVibe] = useState("");             // vibe filter
  const [venueType, setVenueType] = useState("");   //venue type
  const [cuisine, setCuisine] = useState("");       // cuisine filter
  const navigate = useNavigate();                   // navigation handler
  const [hasSearched, setHasSearched] = useState(false); // track if a search has been triggered, so the plan summary is displayed

  // Pagination state
  const [page, setPage] = useState(0);                      // current page index
  const [pageSize, setPageSize] = useState(20);             // number of items per page
  const [totalPages, setTotalPages] = useState(0);          // total number of pages
  const [totalElements, setTotalElements] = useState(0);    // total number of search results
  const [isLoading, setIsLoading] = useState(false);

  // state for zone data
  const [zoneData, setZoneData] = useState(null);
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
    fetch("http://localhost:8080/vibe/map-data")
      .then((res) => res.json())
      .then((data) => {
        setBusynessMap(data.busyness || {});
      })
      .catch((err) => {
        console.error("Failed to fetch map-data:", err);
      });
  }, []);

  // handle get directions button
  const handleGetDirections = (venue) => {
    navigate("/map", { state: { selectedVenue: venue } }); // navigates to map page
  };
  
  // Main search function
  const handleSearch = useCallback(() => {
    if (!input && !vibe && !venueType && !cuisine) {    // prevent search if no filters or text input provided
      setResults([]);
      setTotalPages(0);
      setTotalElements(0);
      return;
    }

    setIsLoading(true);                                 // start loading state
    setHasSearched(true);                               // mark that the user has searched

    // Build the request body for vibe search
    const requestBody = {
      vibeDescription: input || `${vibe} ${venueType} ${cuisine}`.trim(),
      maxResults: pageSize * 10, // Get more results for pagination
    };

    // Perform the vibe search
    fetch(`http://localhost:8080/vibe/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",                     // tell the server we're using JSON
      },
      body: JSON.stringify(requestBody),                        // convert request body to JSON string
    })
      .then((res) => {
        if (!res.ok) throw new Error("Search failed");
        return res.json();
      })
      .then((data) => {
        const locations = (data.locations || []).slice(0, 5);       //extract up to 5 top-matching locations

        const totalElements = locations.length;                      // pagination logic - total number of venues returned
        const totalPages = Math.ceil(totalElements / pageSize);      
        const startIndex = page * pageSize;
        const endIndex = startIndex + pageSize;
        const paginatedResults = locations.slice(startIndex, endIndex);

        // normalise and enrich venue data for frontend usage
        const normalizedResults = paginatedResults.map((v) => {
        const rawPrice = v.price;
        console.log("Original price from backend:", v.price);

        const priceMap = {
          "price level very cheap": 1,
          "price level cheap": 2,
          "price level moderate": 3,
          "price level expensive": 4,
          "price level very expensive": 5,
        };

        let parsedPrice = 0;

        if (typeof rawPrice === "number") {
          parsedPrice = rawPrice;
        } else if (typeof rawPrice === "string") {
          const lower = rawPrice.trim().toLowerCase();
          parsedPrice = priceMap[lower] || 0;
        }

        const enriched = {
          ...v,
          latitude: v.lat,
          longitude: v.lng,
          address: v.addr || v.address || "No address provided",
          zone: v.zone || "Unknown",
          price: parsedPrice,
          description: v.description || "",
          summary: v.summary || v.description || "",
          imageUrl: v.imageUrl || v.image_url || v.image || null,
        };
          
          const text = (
            (v.tags || "") +
            " " +
            (v.loc_type || "") +
            " " +
            (v.description || "") +
            " " +
            (v.summary || "")
          ).toLowerCase();

          enriched.isRestaurant = text.includes("restaurant");
          enriched.isBar = text.includes("bar");
          enriched.isClub = text.includes("club");
          enriched.isLandmark = text.includes("landmark");


          // use turf to find which zone this venue is in
          if (zoneData && enriched.latitude && enriched.longitude) {
            const venuePoint = turfPoint([enriched.longitude, enriched.latitude]);
            const matchingZone = zoneData.features.find((feature) =>
              booleanPointInPolygon(venuePoint, feature.geometry)
            );
            // if a match is found, attach locationID to the venue 
            if (matchingZone) {
              enriched.zoneId = matchingZone.properties.LocationID;
            }
          }

          return enriched;
        });

        setResults(normalizedResults);
        setTotalPages(totalPages);
        setTotalElements(totalElements);

        // DEBUGGING log
        console.log("Raw vibe search results:", locations);
        console.log("Paginated results (before normalization):", paginatedResults);
        console.log("First normalized venue:", normalizedResults[0]);
        console.log("Total results:", totalElements, "| Showing page:", page + 1);
      })
      .catch((err) => {
        console.error("Error fetching search results:", err);
        setResults([]);
        setTotalPages(0);
        setTotalElements(0);
      })
      .finally(() => setIsLoading(false));
  }, [input, vibe, venueType, cuisine, page, pageSize, zoneData]);

  useEffect(() => {
    handleSearch();
  }, [handleSearch]);

  const handlePageChange = (event, newPage) => {
    setPage(newPage - 1);
  };

  const handlePageSizeChange = (e) => {
    setPageSize(e.target.value);
    setPage(0);
  };

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
          onSubmit={(e) => {
            e.preventDefault();
            setPage(0);
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
          <Typography align="center" sx={{ color: "#aaa", mb: 4 }}>Loading...</Typography>
        ) : results.length === 0 && (input || vibe || venueType || cuisine) ? (
          <Typography align="center" sx={{ color: "#aaa", mb: 4 }}>No matching venues found.</Typography>
        ) : null}

        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, alignItems: 'flex-start', gap: 3 }}>
          {hasSearched && (
            <Box sx={{ width: { xs: '100%', md: 320 }, position: { md: 'sticky' }, top: { md: 80 }, alignSelf: 'flex-start' }}>
              <PlanSummary />
            </Box>
          )}

          <Box sx={{ flex: 1 }}>
            {results.map((venue, index) => (
              <TrendingVenueCard
                key={venue.id}
                venue={venue}
                busynessMap={busynessMap}
                rank={index + 1}
                onGetDirections={handleGetDirections}
                onClick={() => navigate("/map-view", { state: { selectedVenue: venue } })}
              />
            ))}
          </Box>
        </Box>

        {/* Pagination */}
        {totalPages > 1 && (
          <Box sx={{ display: "flex", justifyContent: "center", mt: 3, flexDirection: "column", alignItems: "center" }}>
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
              <Select value={pageSize} label="Items per page" onChange={handlePageSizeChange}>
                <MenuItem value={10}>10</MenuItem>
                <MenuItem value={20}>20</MenuItem>
                <MenuItem value={50}>50</MenuItem>
              </Select>
            </FormControl>
          </Box>
        )}

        {totalElements > 0 && (
          <Typography variant="body2" align="center" sx={{ color: "#aaa", mt: 2 }}>
            Showing {page * pageSize + 1}-
            {Math.min((page + 1) * pageSize, totalElements)} of {totalElements} venues
          </Typography>
        )}
      </Box>
    </PageWrapper>
  );
}