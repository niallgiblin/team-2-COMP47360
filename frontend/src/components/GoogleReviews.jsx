/**
 * GoogleReviews - Displays real Google Places reviews for a venue.
 * Uses Google's Places API via the backend proxy endpoint.
 *
 * Features:
 * - Shows Google rating with star display
 * - Lists review excerpts with author name, photo, rating, relative time
 * - Google attribution (required by ToS)
 * - Loading skeleton and error states
 * - Collapsible when there are many reviews
 */
import { useState, useMemo } from 'react';
import {
  Box,
  Typography,
  Avatar,
  Rating,
  Chip,
  Collapse,
  Button,
  Skeleton,
  Alert,
  Divider,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Google as GoogleIcon,
} from '@mui/icons-material';
import useGoogleReviews from '../hooks/useGoogleReviews';

export default function GoogleReviews({ venueId, maxPreview = 3 }) {
  const { reviews, loading, error } = useGoogleReviews(venueId);
  const [expanded, setExpanded] = useState(false);

  const reviewList = useMemo(() => {
    if (!reviews?.reviews || reviews.reviews.length === 0) return [];
    return reviews.reviews;
  }, [reviews]);

  const visibleReviews = expanded ? reviewList : reviewList.slice(0, maxPreview);
  const hasMore = reviewList.length > maxPreview;

  // Null venueId — don't render anything
  if (!venueId) return null;

  // Loading skeleton
  if (loading) {
    return (
      <Box sx={{ mt: 2 }}>
        <Skeleton variant="text" width={200} height={28} />
        <Skeleton variant="rounded" height={80} sx={{ mt: 1 }} />
        <Skeleton variant="rounded" height={80} sx={{ mt: 1 }} />
      </Box>
    );
  }

  // Complete error — no data at all
  if (error && !reviews?.googleRating && (!reviewList || reviewList.length === 0)) {
    return (
      <Alert severity="info" sx={{ mt: 2, fontSize: '0.85rem' }}>
        Google reviews unavailable at the moment.
      </Alert>
    );
  }

  // No reviews
  if (!reviews?.googleRating && reviewList.length === 0) {
    return null;
  }

  return (
    <Box sx={{ mt: 2, mb: 1 }}>
      {/* Header with Google attribution */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <GoogleIcon sx={{ color: '#4285F4', fontSize: 20 }} />
        <Typography variant="subtitle2" sx={{ color: '#ccc', fontWeight: 600 }}>
          Google Reviews
        </Typography>
        {reviews?.googleRating != null && (
          <Chip
            icon={
              <Typography sx={{ color: '#FFD700', fontSize: '0.85rem', fontWeight: 700 }}>
                ★
              </Typography>
            }
            label={`${reviews.googleRating.toFixed(1)} (${reviews.totalRatings || 0})`}
            size="small"
            sx={{
              backgroundColor: '#2a2a2a',
              color: '#fff',
              fontWeight: 600,
              fontSize: '0.8rem',
              height: 24,
            }}
          />
        )}
      </Box>

      {/* Soft error — data available but backend flagged an issue */}
      {error && reviews?.googleRating && (
        <Typography variant="caption" sx={{ color: '#888', display: 'block', mb: 1 }}>
          Ratings shown; full reviews temporarily unavailable.
        </Typography>
      )}

      {/* Review list */}
      {visibleReviews.map((review, idx) => (
        <Box
          key={`${review.authorName}-${review.time}-${idx}`}
          sx={{
            backgroundColor: '#1e1e1e',
            borderRadius: 2,
            p: 1.5,
            mb: 1,
            border: '1px solid #333',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <Avatar
              src={review.profilePhotoUrl}
              alt={review.authorName}
              sx={{ width: 24, height: 24 }}
            >
              {review.authorName?.charAt(0) || '?'}
            </Avatar>
            <Typography variant="body2" sx={{ color: '#fff', fontWeight: 500, flex: 1 }}>
              {review.authorName}
            </Typography>
            <Typography variant="caption" sx={{ color: '#888' }}>
              {review.relativeTimeDescription}
            </Typography>
          </Box>

          <Rating
            value={review.rating || 0}
            readOnly
            precision={0.5}
            size="small"
            sx={{ mb: 0.5 }}
          />

          {review.text && (
            <Typography
              variant="body2"
              sx={{
                color: '#bbb',
                fontSize: '0.82rem',
                lineHeight: 1.4,
                display: '-webkit-box',
                WebkitLineClamp: expanded ? 'none' : 3,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {review.text}
            </Typography>
          )}
        </Box>
      ))}

      {/* Expand/collapse button */}
      {hasMore && (
        <Button
          onClick={() => setExpanded(!expanded)}
          size="small"
          endIcon={expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          sx={{
            color: '#3ABEFF',
            textTransform: 'none',
            fontSize: '0.8rem',
            mt: 0.5,
          }}
        >
          {expanded
            ? 'Show fewer'
            : `Show all ${reviewList.length} reviews`}
        </Button>
      )}

      {/* Google attribution (required by ToS) */}
      {reviews?.attribution && (
        <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <GoogleIcon sx={{ color: '#4285F4', fontSize: 14 }} />
          <Typography variant="caption" sx={{ color: '#666' }}>
            {reviews.attribution}
          </Typography>
        </Box>
      )}
    </Box>
  );
}
