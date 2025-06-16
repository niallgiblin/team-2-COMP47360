import { Box } from '@mui/material';


// provides consistent spacing/ layout for all top-level pages
export default function PageWrapper({ children }) {
  return (
    // outer container, acts as a layout bondary
    <Box 
      sx={{ 
        width: '100%',            // take up full horizontal space
        overflowX: 'visible',     // prevent horizontal scroll hiding
        position: 'static' 
      }}
    >
      <Box
        sx={{
          paddingTop: 10,         // space below nav bar
          paddingX: 4,            // horizontal padding
          maxWidth: '1200px',     // constrain readable content
          mx: 'auto',             // center the content
        }}
      >
        {children}        {/* injected page content */}
      </Box>
    </Box>
  );
}
