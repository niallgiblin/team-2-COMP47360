import L from 'leaflet';

export const getVenueIcon = (type = 'default') => {
  let iconClass = 'fa-map-marker-alt';
  let color = '#3ABEFF';

  switch (type) {
    case 'restaurant':
      iconClass = 'fa-utensils';
      color = '#000';
      break;
    case 'bar':
      iconClass = 'fa-glass-martini-alt';
      color = '#3346FF';
      break;
    case 'club':
      iconClass = 'fa-music';
      color = '#00FFAA';
      break;
    case 'landmark':
      iconClass = 'fa-landmark';
      color = '#AC33FF';
      break;
    default:
      iconClass = 'fa-map-marker-alt';
      color = '#0b3d1c';
  }

  return L.divIcon({
    html: `<i class="fas ${iconClass}" style="color:${color}; font-size: 24px;"></i>`,
    className: 'custom-fa-icon',
    iconSize: [24, 24],
    iconAnchor: [12, 24],
    popupAnchor: [0, -24],
  });
};
