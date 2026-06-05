import L from 'leaflet';

export const getStartIcon = () =>
  L.divIcon({
    html: `<i class="fas fa-map-pin" style="color:#00CC00; font-size: 28px;"></i>`,
    className: 'custom-fa-icon',
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -28],
  });

export const getDestinationIcon = () =>
  L.divIcon({
    html: `<div style="width:20px;height:20px;background-color:#fff;background-image:linear-gradient(45deg, #000 25%, transparent 25%, transparent 75%, #000 75%, #000),linear-gradient(45deg, #000 25%, transparent 25%, transparent 75%, #000 75%, #000);background-size:10px 10px;background-position:0 0, 5px 5px;border:2px solid #333;border-radius:3px;"></div>`,
    className: '',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12],
  });

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
