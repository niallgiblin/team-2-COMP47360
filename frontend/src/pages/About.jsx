// import MUI components for layout and styling
import { Typography, Avatar, Box, Container } from '@mui/material';

// import bio info
import teamMembers from '../assets/teamMembers';

export default function About() {
  return (
    
    // outer container
    <Box sx={{ backgroundColor: '#000', color: '#fff', py: 8 }}>
      
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
              
              {/* Team member bio */}
              <Typography
                variant="body2"
                sx={{
                  color: '#ccc',
                  mt: 1,
                }}
              >
                {member.bio}
              </Typography>
            </Box>
          ))}
        </Box>
      </Container>
    </Box>
  );
}



