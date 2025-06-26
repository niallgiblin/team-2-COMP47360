// map description tags to stock images

import defaultImg from '../assets/stock/default.jpg';
import restaurantImg from '../assets/stock/restaurant.jpg';
import barImg from '../assets/stock/bar.jpg';
import cafeImg from '../assets/stock/cafe.jpg';
import galleryImg from '../assets/stock/gallery.jpg';
import museumImg from '../assets/stock/museum.jpg';
import nightlifeImg from '../assets/stock/nightlife.jpg';
import storeImg from '../assets/stock/store.jpg';
import landmarkImg from '../assets/stock/landmark.jpg';
import bakeryImg from '../assets/stock/bakery.jpg';

export const categoryImages = {
  restaurant: restaurantImg,
  bar: barImg,
  cafe: cafeImg,
  gallery: galleryImg,
  museum: museumImg,
  nightlife: nightlifeImg,
  store: storeImg,
  landmark: landmarkImg,
  bakery: bakeryImg,
  default: defaultImg,
};

export function getCategory(description = '') {
  const lowerDesc = description.toLowerCase();
  const mapping = {
    restaurant: ['restaurant', 'deli', 'pizza', 'sushi', 'ramen'],
    bar: ['bar', 'pub', 'wine'],
    cafe: ['cafe', 'coffee'],
    gallery: ['gallery'],
    museum: ['museum'],
    nightlife: ['club', 'karaoke', 'comedy'],
    store: ['store', 'shop'],
    landmark: ['tourist attraction'],
    bakery: ['bakery', 'dessert'],
  };

  for (const [category, keywords] of Object.entries(mapping)) {
    if (keywords.some((word) => lowerDesc.includes(word))) {
      return category;
    }
  }

  return 'default';
}
