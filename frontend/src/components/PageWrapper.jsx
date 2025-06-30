import { Box } from '@mui/material';


// provides consistent spacing/ layout for all top-level pages
export default function PageWrapper({ children, fullWidth = false, fullHeight = false }) {
  return (
    // outer container, acts as a layout bondary
    <Box 
      sx={{ 
        width: '100%',            // take up full horizontal space
        overflowX: 'hidden',     // prevent horizontal scroll hiding
        position: 'static', 
        display: 'flex',
        flexDirection: 'column',
        minHeight: fullHeight ? '100vh' : 'auto',
      }}
    >
      <Box
        sx={{
          paddingTop: 8,         // space below nav bar
          paddingX: { xs: 2, sm: 4, md: 6 },            // horizontal padding
          ...(fullWidth
            ? {  
                maxWidth: '1300px',   // allow wider views
                width: '100%',
                mx: 'auto',           // center the content again
              }  
            : { 
                maxWidth: '1200px', 
                mx: 'auto' 
              }),
          flexGrow: 1             // Let the inner content stretch vertically
        }}
      >
        {children}        {/* injected page content */}
      </Box>
    </Box>
  );
}
