import { Box } from '@mui/material';


// provides consistent spacing/ layout for all top-level pages
export default function PageWrapper({ children, fullWidth = false, fullHeight = false }) {
  return (
    // outer container, acts as a layout bondary
    <Box 
      sx={{ 
        width: '100%',            // take up full horizontal space
        overflowX: 'hidden',     // prevent horizontal scroll hiding
        position: 'relative', 
        display: 'flex',
        flexDirection: 'column',
        minHeight: fullHeight ? '100vh' : 'auto',
      }}
    >
      <Box
        sx={{
          paddingTop: 8,         // space below nav bar
          paddingX: { xs: 1, sm: 2, md: 4, lg: 6 },            // horizontal padding
          ...(fullWidth
            ? {  
                maxWidth: {  xs: '500px', sm: '700px', md: '850px', lg: '1200px'},   // allow wider views
                width: '100%',
                mx: 'auto',           // center the content again
              }  
            : { 
               maxWidth: { xs: '100%', sm: '100%', md: '1200px' }, // responsive max width
                mx: 'auto',
                width: '100%',
              }),
          flexGrow: 1,             // Let the inner content stretch vertically
          overflow: 'hidden',     // prevent overflow from children
        }}
      >
        {children}        {/* injected page content */}
      </Box>
    </Box>
  );
}
