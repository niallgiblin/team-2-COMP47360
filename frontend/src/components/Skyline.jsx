import { Box } from '@mui/material';
import skyline from '../assets/skyline.svg';

export default function Skyline() {
  return (
    <Box
      component="img"
      src={skyline}
      alt="NYC skyline"
      sx={{
        width: '100%',
        mb: -6,
        display: 'block',
        zIndex: 1,
      }}
    />
  );
}