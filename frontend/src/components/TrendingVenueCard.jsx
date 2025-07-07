import { useState, useEffect } from 'react';
import {
    Card,
    CardMedia,
    Typography,
    Box,
    Button,
    Chip,
    IconButton,
} from '@mui/material';

import { usePlan } from '../context/PlanContext';
import { getCategory, categoryImages } from '../utils/tagMapping';
import { Favorite as FavoriteIcon, FavoriteBorder as FavoriteBorderIcon, Whatshot as WhatshotIcon, AttachMoney as AttachMoneyIcon, Launch as LaunchIcon } from '@mui/icons-material';


export default function TrendingVenueCard({ venue, onGetDirections }) {
    const [liked, setLiked] = useState(false);

    const priceLevels = {
        'price level very cheap': 1,
        'price level cheap': 2,
        'price level moderate': 3,
        'price level expensive': 4,
        'price level very expensive': 5,
    };

    let level = 0;
    if (typeof venue.price === 'number') {
        level = venue.price;
    } else if (typeof venue.price === 'string') {
        const normalizedPrice = venue.price.trim().toLowerCase();
        level = priceLevels[normalizedPrice] || 0;
    }

    const { plan, addToPlan, removeFromPlan } = usePlan();
    const isInPlan = plan.some((v) => v.id === venue.id);
    const isPlanFull = plan.length >= 3;

    const category = getCategory(venue.description || '');
    const imageUrl = venue.imageUrl || categoryImages[category] || categoryImages.default;

    const handleWebsiteClick = () => {
        if (venue.uri) {
            window.open(venue.uri, '_blank');
        }
    };

    return (
        <Box sx={{ position: 'relative', display: 'flex', justifyContent: 'center', mt: 4 }}>
            <IconButton
                onClick={() => setLiked(!liked)}
                sx={{
                    position: 'absolute',
                    top: -12,
                    right: 12,
                    zIndex: 2,
                    background: 'linear-gradient(to right, #3ABEFF, #FF4ECD)',
                    color: '#fff',
                    width: 32,
                    height: 32,
                    padding: 0,
                    borderRadius: '50%',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
                    '&:hover': {
                        background: 'linear-gradient(to right, #FF4ECD, #3ABEFF)',
                    },
                }}
            >
                {liked ? <FavoriteIcon sx={{ fontSize: 16 }} /> : <FavoriteBorderIcon sx={{ fontSize: 16 }} />}
            </IconButton>

            <Card
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    p: 2,
                    mb: 3,
                    backgroundColor: '#1a1a1a',
                    borderRadius: 3,
                    color: '#fff',
                    boxShadow: '0 4px 10px rgba(0,0,0,0.3)',
                    width: '100%',
                    maxWidth: 600,
                }}
            >
                <CardMedia
                    component="img"
                    image={imageUrl}
                    alt={venue.name}
                    sx={{
                        width: 80,
                        height: 80,
                        borderRadius: 2,
                        objectFit: 'cover',
                    }}
                />

                <Box
                    sx={{
                        flexGrow: 1,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: 2,
                    }}
                >
                    <Box sx={{ mt: 0.5 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 0.5 }}>
                            {venue.name}
                        </Typography>
                        <Typography variant="body2" sx={{ color: '#aaa', mb: 0.5 }}>
                            {venue.category || 'Bar'} · {venue.neighborhood || 'NYC'}
                        </Typography>

                        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                            <Button
                                variant="text"
                                size="small"
                                onClick={() => onGetDirections(venue)}
                                sx={{
                                    color: '#3ABEFF',
                                    textTransform: 'none',
                                    fontWeight: 600,
                                    px: 0,
                                }}
                            >
                                Get Directions
                            </Button>

                            {venue.uri && (
                                <Button
                                    variant="text"
                                    size="small"
                                    onClick={handleWebsiteClick}
                                    startIcon={<LaunchIcon sx={{ fontSize: 14 }} />}
                                    sx={{
                                        color: '#FF4ECD',
                                        textTransform: 'none',
                                        fontWeight: 600,
                                        px: 0,
                                    }}
                                >
                                    Website
                                </Button>
                            )}
                        </Box>
                    </Box>

                    <Box
                        sx={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'flex-start',
                            gap: 1,
                            mt: 0.5,
                        }}
                    >
                        <Chip
                            icon={<WhatshotIcon sx={{ color: '#fff' }} />}
                            label="Trending"
                            size="small"
                            sx={{
                                background: 'linear-gradient(to right, #3ABEFF, #FF4ECD)',
                                color: '#fff',
                                fontWeight: 600,
                                height: 24,
                            }}
                        />

                        <Box sx={{ display: 'flex', gap: '0.5px' }}>
                            {[1, 2, 3, 4, 5].map((i) => (
                                <AttachMoneyIcon
                                    key={i}
                                    sx={{
                                        fontSize: 16,
                                        color: i <= level ? '#FFD700' : '#555555',
                                    }}
                                />
                            ))}
                        </Box>

                        <Button
                            onClick={() =>
                                isInPlan ? removeFromPlan(venue.id) : addToPlan(venue)
                            }
                            disabled={!isInPlan && isPlanFull}
                            variant="outlined"
                            size="small"
                            sx={{
                                mt: 1,
                                textTransform: 'none',
                                fontWeight: 'bold',
                                borderRadius: 2,
                                borderColor: '#FF4ECD',
                                color: '#FF4ECD',
                                minWidth: 105,
                                minHeight: 22,
                                '&:hover': {
                                    background: 'linear-gradient(to right, #3ABEFF, #FF4ECD)',
                                    color: '#000',
                                },
                            }}
                        >
                            {isInPlan ? 'Remove from Plan' : 'Add to Plan'}
                        </Button>
                    </Box>
                </Box>
            </Card>
        </Box>
    );
}
