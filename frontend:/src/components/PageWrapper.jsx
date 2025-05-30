import { Box } from '@mui/material';

export default function PageWrapper({ children }) {
  return (
    <Box sx={{ width: '100%', overflowX: 'visible', position: 'static' }}>
      <Box
        sx={{
          paddingTop: 10,         // space below nav
          paddingX: 4,            // horizontal padding
          minHeight: '100vh',
          maxWidth: '1200px',     // constrain readable content
          mx: 'auto',             // center the content
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
