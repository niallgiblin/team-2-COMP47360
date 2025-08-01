import { Typography, Box, Container } from '@mui/material';
import React, { useState } from 'react';
import teamMembers from '../assets/teamMembers';

function ReadMoreBio({ bio }) {
    const [expanded, setExpanded] = useState(false);

    const words = bio.split(' ');
    const limit = 40;
    const isLong = words.length > limit;
    const shortBio = words.slice(0, limit).join(' ') + (isLong ? '...' : '');

    return (
        <>
            <Typography
                variant="body2"
                sx={{
                    color: '#ddd',
                    mt: 1,
                    textAlign: 'justify',
                    fontSize: '0.95rem',
                    lineHeight: 1.6,
                    px: 1,
                    whiteSpace: 'pre-line',
                    letterSpacing: '0.02em',
                    userSelect: 'text',
                }}
            >
                {expanded || !isLong ? bio : shortBio}
            </Typography>

            {isLong && (
                <Typography
                    variant="body2"
                    sx={{
                        color: '#3ABEFF',
                        cursor: 'pointer',
                        fontWeight: '600',
                        mt: 0.5,
                        userSelect: 'none',
                        letterSpacing: '0.05em',
                        transition: 'color 0.3s ease',
                        '&:hover': {
                            color: '#FF4ECD',
                        },
                    }}
                    onClick={() => setExpanded(!expanded)}
                >
                    {expanded ? 'Read less' : 'Read more'}
                </Typography>
            )}
        </>
    );
}

export default function About() {
    return (
        <Box
            data-testid="about-content"
            sx={{
                backgroundColor: '#000',
                color: '#fff',
                pt: 4,
                pb: 8,
                minHeight: '100vh',
            }}
        >
            <Container maxWidth="lg">
                <Typography
                    variant="h4"
                    align="center"
                    gutterBottom
                    sx={{
                        textTransform: 'uppercase',
                        fontWeight: '700',
                        background: 'linear-gradient(to right, #3ABEFF, #FF4ECD)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        mb: 8,
                        letterSpacing: '0.2em',
                        userSelect: 'none',
                    }}
                >
                    About The Urban Gala
                </Typography>

                <Box
                    sx={{
                        maxWidth: 820,
                        mx: 'auto',
                        lineHeight: 1.7,
                        mb: 6,
                        px: { xs: 2, sm: 0 },
                        fontSize: '1.1rem',
                        color: '#e0e0e0',
                        textAlign: 'center',
                        letterSpacing: '0.015em',
                        userSelect: 'text',
                    }}
                >
                    <strong>Based in the Big Apple, named after one.</strong>
                    <br />
                    Urban Gala is your best friend when it comes to finding the perfect
                    hangout spot in New York City. One of the first things that comes to
                    mind when choosing where you want to chill in the city is the
                    overwhelming myriad of choices. Whether you want to relax in a classy
                    jazz bar, enjoy a casual coffee catch-up or hop on a night-time cruise
                    on the Hudson, Urban Gala has you covered.
                    <br />
                    <br />
                    From rooftop nightclubs to local hidden gems, we know how difficult
                    it can be to know what the vibe is, when to go, or if it is even where
                    you actually want to be. Using AI-powered vibe matching and your
                    preferences, Urban Gala provides users with personalised
                    recommendations — making it easier for locals and tourists alike to
                    make smarter, stress-free decisions when choosing a hangout spot.
                    <br />
                    <br />
                    Don’t have the time to give your preferences? No problem. Our live
                    map allows you to explore different venues, their vibes and busyness
                    levels in various regions across Manhattan.
                </Box>

                <Typography
                    variant="h5"
                    align="center"
                    sx={{
                        mt: 6,
                        mb: 3,
                        fontWeight: 'bold',
                        textTransform: 'uppercase',
                        background: 'linear-gradient(to right, #3ABEFF, #FF4ECD)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        letterSpacing: '0.15em',
                        userSelect: 'none',
                    }}
                >
                    Who is Behind Urban Gala?
                </Typography>

                <Typography
                    variant="body1"
                    sx={{
                        color: '#ddd',
                        textAlign: 'center',
                        maxWidth: 800,
                        mx: 'auto',
                        fontSize: '1.1rem',
                        lineHeight: 1.7,
                        mb: 10,
                        px: { xs: 2, sm: 0 },
                        userSelect: 'text',
                    }}
                >
                    Urban Gala was built by a team of Computer Science Master's students
                    who spent some time living in and visiting Manhattan. A common
                    difficulty experienced by all of us was finding the ideal places to
                    hang out that matched our vibe — without spending a bunch of time
                    searching.
                    <br />
                    <br />
                    The frustration we experienced led us to develop the concept behind
                    Urban Gala. We wanted to help others experience the best vibes
                    Manhattan has to offer, without the stress we encountered.
                </Typography>

                <Typography
                    variant="h5"
                    align="center"
                    sx={{
                        fontWeight: 'bold',
                        textTransform: 'uppercase',
                        background: 'linear-gradient(to right, #3ABEFF, #FF4ECD)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        mb: 6,
                        userSelect: 'none',
                        letterSpacing: '0.15em',
                    }}
                >
                    About the Creators
                </Typography>

                <Box
                    sx={{
                        display: 'grid',
                        gridTemplateColumns: {
                            xs: '1fr',
                            sm: '1fr 1fr',
                            md: '1fr 1fr 1fr',
                        },
                        gap: 6,
                        justifyItems: 'center',
                        px: { xs: 2, sm: 0 },
                    }}
                >
                    {teamMembers.map((member, index) => (
                        <Box
                            key={index}
                            sx={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                textAlign: 'center',
                                maxWidth: 320,
                                mx: 'auto',
                                p: 3,
                                borderRadius: 3,
                                boxShadow:
                                    '0 8px 24px rgba(58, 190, 255, 0.15), 0 6px 20px rgba(255, 78, 205, 0.1)',
                                transition: 'transform 0.3s ease, box-shadow 0.3s ease',
                                backgroundColor: '#11161b',
                                cursor: 'default',
                                '&:hover': {
                                    transform: 'translateY(-8px)',
                                    boxShadow:
                                        '0 16px 40px rgba(58, 190, 255, 0.3), 0 12px 30px rgba(255, 78, 205, 0.2)',
                                },
                            }}
                        >
                            <Box
                                component="img"
                                alt={member.name}
                                src={member.image}
                                sx={{
                                    width: 130,
                                    height: 130,
                                    mb: 3,
                                    border: '4px solid #3ABEFF',
                                    borderRadius: '50%',
                                    objectFit: 'cover',
                                    objectPosition: 'center 20%',
                                    boxShadow: '0 4px 15px rgba(58, 190, 255, 0.4)',
                                    transition: 'box-shadow 0.3s ease',
                                    '&:hover': {
                                        boxShadow: '0 8px 30px rgba(255, 78, 205, 0.6)',
                                    },
                                }}
                            />
                            <Typography
                                variant="h6"
                                sx={{
                                    fontWeight: '900',
                                    background: 'linear-gradient(to right, #3ABEFF, #FF4ECD)',
                                    WebkitBackgroundClip: 'text',
                                    WebkitTextFillColor: 'transparent',
                                    mb: 1,
                                    letterSpacing: '0.1em',
                                    userSelect: 'none',
                                }}
                            >
                                {member.name}
                            </Typography>
                            <ReadMoreBio bio={member.bio} />
                        </Box>
                    ))}
                </Box>
            </Container>
        </Box>
    );
}