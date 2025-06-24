// import MUI components for layout and styling
import { Typography, Avatar, Box, Container } from '@mui/material';
import React, { useState } from 'react';

// import bio info
import teamMembers from '../assets/teamMembers';

// Helper component for truncating and toggling bio text
function ReadMoreBio({ bio }) {
  const [expanded, setExpanded] = useState(false);

  const words = bio.split(' ');
  const limit = 40; // number of words to show initially
  const isLong = words.length > limit;
  const shortBio = words.slice(0, limit).join(' ') + (isLong ? '...' : '');
  return (
    <>
      <Typography
        variant="body2"
        sx={{
          color: '#ccc',
          mt: 1,
          textAlign: 'justify',
          fontSize: '0.9rem',
          lineHeight: 1.5,
          px: 1,
          whiteSpace: 'pre-line',
        }}
      >
        {expanded || !isLong ? bio : shortBio}
      </Typography>

      {isLong && (
        <Typography
          variant="body2"
          sx={{
            color: ' #3ABEFF',
            cursor: 'pointer',
            fontWeight: 'bold',
            mt: 0.5,
            userSelect: 'none',
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
    
    // outer container
    <Box sx={{ backgroundColor: '#000', color: '#fff', pt: 2, py: 4 }}>
      
      {/* Constrains content width to a centred column */}
      <Container maxWidth="lg">
        
        {/* Page title */}
        <Typography
          variant="h4"
          align="center"
          gutterBottom
          sx={{
            textTransform: 'uppercase',
            fontWeight: 'bold',
            background: 'linear-gradient(to right, #3ABEFF, #FF4ECD)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            mb: 6,
          }}
        >
          About The Urban Gala
        </Typography>
        <Box sx={{ 
            mb: 4, 
            mt: -4,
            maxWidth: 800, 
            mx: 'auto', 
            lineHeight: 1.6,}}>
          <Typography 
            variant="body1" 
            sx={{ 
              color: '#fff', 
              mb: 2, 
              textAlign: 'center' }}>
            
            <strong>Based in the Big Apple, named after one.</strong><br />
            Urban Gala is your best friend when it comes to finding the perfect hangout spot in New York City. One of the first things that comes to mind when choosing where you want to chill in the city is the overwhelming myriad of choices.
            Whether you want to relax in a classy jazz bar, enjoy a casual coffee catch-up or hop on a night-time cruise on the Hudson, Urban Gala has you covered.
            <br /><br />
            From rooftop nightclubs to local hidden gems, we know how difficult it can be to know what the vibe is, when to go, or if it is even where you actually want to be. Using AI-powered vibe matching and your preferences, Urban Gala provides users with personalised recommendations — making it easier for locals and tourists alike to make smarter, stress-free decisions when choosing a hangout spot.
            <br /><br />
            Don’t have the time to give your preferences? No problem. Our live map allows you to explore different venues, their vibes and busyness levels in various regions across Manhattan.
          </Typography>

          <Typography 
            variant="h6" 
            align="center" 
            sx={{ 
              mt: 4, 
              mb: 2, 
              fontWeight: 'bold',
              textTransform: 'uppercase',
              background: 'linear-gradient(to right, #3ABEFF, #FF4ECD)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              }}
            >
            Who is Behind Urban Gala?
          </Typography>

          <Typography variant="body1" sx={{ color: '#fff', textAlign: 'center' }}>
            Urban Gala was built by a team of Computer Science Master's students who spent some time living in and visiting Manhattan.
            A common difficulty experienced by all of us was finding the ideal places to hang out that matched our vibe — without spending a bunch of time searching.
            <br /><br />
            The frustration we experienced led us to develop the concept behind Urban Gala.
            We wanted to help others experience the best vibes Manhattan has to offer, without the stress we encountered.
          </Typography>
        </Box>

         <Typography
            variant="h6"
            align="center"
            sx={{
              fontWeight: 'bold',
              textTransform: 'uppercase',
              background: 'linear-gradient(to right, #3ABEFF, #FF4ECD)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              mb: 4,
              mt: 6,
            }}
          >
            About the Creators
          </Typography>  

        {/* Grid layout for team members */}
        {/* 1 column on mobile, 2 on small screen, 3 on medium+ */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              sm: '1fr 1fr',
              md: '1fr 1fr 1fr',
            },
            gap: 4, // space between grid items
            justifyItems: 'center',
          }}
        >

          {/* Display each team member and their profile */}
          {teamMembers.map((member, index) => (
            <Box
              key={index}
              sx={{
                display: 'flex',
                flexDirection: 'column', // vertical layout
                alignItems: 'center', // centre avatar and text
                textAlign: 'center',
                maxWidth: 300,
                mx: 'auto', // horizontal auto margin for consistent centering 
              }}
            >

            
            {/* Circular headshots */}
           <Box
              component="img" // tells it to be an image
              alt={member.name}
              src={member.image}
              sx={{
                width: 120,
                height: 120,
                mb: 2,
                border: '3px solid #3ABEFF',
                borderRadius: '50%', // Makes it a circle
                objectFit: 'cover', // ensures image fills the circle
                objectPosition: 'center 20%', // vertically adjusts crop
              }}
              />
              
            {/* Team member name */}
            <Typography
              variant="h6"
              sx={{
                fontWeight: 'bold',
                background: 'linear-gradient(to right, #3ABEFF, #FF4ECD)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
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



