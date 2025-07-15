import { useState, useEffect, useCallback } from "react";
import { 
  Box,
  Typography,
  TextField,
  Button,
  MenuItem,
  FormControl,
  Select,
  InputLabel
} from "@mui/material";
import PageWrapper from "../components/PageWrapper";
import TrendingVenueCard from "../components/TrendingVenueCard";
import { useNavigate } from "react-router-dom";
import PlanSummary from "../components/PlanSummary";
// Turf imports for data enrichment
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

  const [allResults, setAllResults] = useState([]);
  const [busynessMap, setBusynessMap] = useState({});
  const [allVenues, setAllVenues] = useState([]);

  // state for zone data
  const [zoneData, setZoneData] = useState(null); // GeoJSON data for zone lookups

 useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const [zoneRes, mapDataRes] = await Promise.all([
          fetch("/manhattanZones.geojson"),
          fetch(`/api/vibe/map-data`),
        ]);

        if (zoneRes.ok) setZoneData(await zoneRes.json());
        else console.error("Failed to load zone data:", zoneRes.statusText);

        if (mapDataRes.ok) {
          const mapData = await mapDataRes.json();
          setBusynessMap(mapData.busyness || {});
          setAllVenues(mapData.locations || []);
        } else console.error("Failed to fetch map-data:", mapDataRes.statusText);
      } catch (error) {
        console.error("Error fetching initial data for FindMyVibe:", error);
      }
    };
    fetchInitialData();
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
      // Combine all inputs to create a more specific and intuitive search query.
      const vibeDescription = [input, vibe, venueType, cuisine].filter(Boolean).join(' ').trim();

      const requestBody = {
        vibeDescription: vibeDescription,
        maxResults: 5, 
      };

      const res = await fetch(`/api/vibe/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!res.ok) throw new Error("Search failed");
      const data = await res.json();
      const locations = data.locations || [];

      // Enrich the venue data to ensure consistency, just like on the Recommendations page
      const zoneNameToId = {};
      (allVenues || []).forEach(v => {
        if (v.zone && v.zoneId) {
          zoneNameToId[v.zone.trim().toLowerCase()] = String(v.zoneId);
        }
      });
      const transformed = locations.map((venue) => {
        let canonical = null;
        if (allVenues.length > 0) {
          canonical = allVenues.find(v =>
            v.id === venue.id ||
            v.id === venue.placeId ||
            (v.latitude === (venue.latitude || venue.lat) && v.longitude === (venue.longitude || venue.lng))
          );
        }
        const enriched = {
          ...canonical,
          ...venue,
          id: (canonical && canonical.id) || venue.id || venue.placeId, // Prefer canonical id
          latitude: venue.latitude || venue.lat || (canonical && canonical.latitude),
          longitude: venue.longitude || venue.lng || (canonical && canonical.longitude),
          address: venue.address || (canonical && canonical.address) || 'No address provided',
          zone: venue.zone || venue.Zone || (canonical && canonical.zone) || 'Unknown',
        };
        // Assign zoneId using Turf.js (polygon lookup)
        let zoneIdFromPolygon = null;
        if (zoneData && enriched.latitude && enriched.longitude) {
          try {
            const venuePoint = turfPoint([enriched.longitude, enriched.latitude]);
            const matchingZone = zoneData.features.find((feature) =>
              booleanPointInPolygon(venuePoint, feature.geometry)
            );
            if (matchingZone) {
              zoneIdFromPolygon = String(matchingZone.properties.LocationID);
              enriched.zoneId = zoneIdFromPolygon;
            }
          } catch (err) {
            console.warn(`[VIBE DEBUG] Polygon lookup failed for venue '${enriched.name}':`, err);
          }
        }
        // Fallback: Assign zoneId using zoneNameToId mapping if not set
        let zoneIdFromMapping = null;
        if (!enriched.zoneId && enriched.zone) {
          const zoneKey = enriched.zone.trim().toLowerCase();
          if (zoneNameToId[zoneKey]) {
            zoneIdFromMapping = zoneNameToId[zoneKey];
            enriched.zoneId = zoneIdFromMapping;
          }
        }
        // Fallback: Try to match zone name to any LocationID in allVenues
        if (!enriched.zoneId && enriched.zone) {
          const possible = (allVenues || []).find(v => v.zone && v.zone.trim().toLowerCase() === enriched.zone.trim().toLowerCase() && v.zoneId);
          if (possible) {
            enriched.zoneId = String(possible.zoneId);
          }
        }
        // Log detailed info for debugging
        const busynessValue = enriched.zoneId ? busynessMap[enriched.zoneId] : undefined;
        console.log(
          `[VIBE DEBUG] Venue: '${enriched.name}' | Zone: '${enriched.zone}' | zoneId (polygon): ${zoneIdFromPolygon} | zoneId (mapping): ${zoneIdFromMapping} | Final zoneId: ${enriched.zoneId} | Busyness: ${busynessValue}`
        );
        if (!enriched.zoneId) {
          console.warn(`[VIBE DEBUG] No zoneId could be assigned for venue '${enriched.name}' (zone: '${enriched.zone}')`);
        }
        // Add tags if missing
        if (!enriched.tags || enriched.tags.length === 0) {
          let tags = [];
          if (venue.tags && Array.isArray(venue.tags)) {
            tags = venue.tags;
          } else if (canonical && Array.isArray(canonical.tags)) {
            tags = canonical.tags;
          } else {
            if (venue.description) {
              tags = venue.description.split(',').map(t => t.trim()).filter(Boolean);
            } else if (venue.type) {
              tags = venue.type.split(',').map(t => t.trim()).filter(Boolean);
            }
          }
          enriched.tags = tags;
        }
        return enriched;
      });
      setAllResults(transformed);
      // Remove: updating busynessMap from search response
      // if (data.busyness) {
      //   const normalizedBusyness = {};
      //   Object.entries(data.busyness).forEach(([k, v]) => {
      //     normalizedBusyness[String(k)] = v;
      //   });
      //   setBusynessMap(normalizedBusyness);
      // }
    } catch (err) {
      console.error("Error fetching search results:", err);
      setAllResults([]);
    } finally {
      setIsLoading(false);
    }
  }, [input, vibe, venueType, cuisine, zoneData, allVenues]);

  // Form submission handler
  const handleFormSubmit = (e) => {
    e.preventDefault();
    performSearch();
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
          {/* Always render the sidebar, even if empty, to reserve space and prevent overlap */}
          <Box sx={{ width: { xs: '100%', md: 320 }, position: { md: 'sticky' }, top: { md: 80 }, alignSelf: 'flex-start', zIndex: 0, minHeight: 200 }}>
            <PlanSummary busynessMap={busynessMap} />
          </Box>

          <Box sx={{ flex: 1, zIndex: 1 }}>
            {allResults.map((venue, index) => (
              <TrendingVenueCard
                key={venue.id || index}
                venue={venue}
                busynessMap={busynessMap}
                rank={index + 1}
                onGetDirections={handleGetDirections}
                tags={venue.tags}
                hidePlanButtons={false}
              />
            ))}
          </Box>
        </Box>
      </Box>
    </PageWrapper>
  );
}