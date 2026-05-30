#!/usr/bin/env python3
"""Add realistic Google-style review snippets to venues.csv.

Generates synthetic but plausible review text for each venue based on its
metadata (type, price, zone, tags, name). Each venue gets 2-3 review
snippets with specific, searchable content.

Usage:
    cd BackEnd/llm-service
    .venv/bin/python3 scripts/add_reviews.py

The script overwrites corpus/v1/venues.csv in-place.
"""

import csv
import os
import random
import sys
from pathlib import Path

random.seed(42)

# ---------------------------------------------------------------------------
# Review snippet templates by venue category + price level
# ---------------------------------------------------------------------------

RESTAURANT_REVIEWS = {
    "italian": [
        "Best pasta I've had in NYC — the cacio e pepe is incredibly authentic",
        "Their homemade tiramisu is life-changing, and the wine list is excellent",
        "Lovely family-run spot, the owner came to our table to chat",
        "The pizza here has that perfect charred crust you only get from a real wood-fired oven",
        "Incredible risotto, perfectly cooked, great date night spot",
    ],
    "pizza": [
        "Best slice in Manhattan, no contest — crispy crust and perfect sauce ratio",
        "They do a proper New York fold, the pepperoni cups are crispy on the edges",
        "Massive slices, reasonable prices, quick service — everything you want from a NYC pizzeria",
        "The margherita is simple but flawless — fresh mozzarella and basil straight from the garden",
    ],
    "mexican": [
        "Best tacos al pastor I've found north of the border, seriously authentic",
        "Their guacamole is made tableside and it's worth every penny",
        "Incredible margaritas, strong and well-balanced, not too sweet",
        "The mole sauce here is complex and rich — you can tell it took hours to make",
    ],
    "japanese": [
        "Outstanding omakase experience — each piece was explained by the chef",
        "Best ramen broth I've tasted outside of Tokyo, tonkotsu is incredibly rich",
        "Their matcha desserts are exceptional, delicate and not overly sweet",
        "Fresh uni and fatty tuna that just melts — worth the splurge",
    ],
    "chinese": [
        "The soup dumplings here are incredible — thin skin, lots of broth inside",
        "Best mapo tofu in Chinatown, perfectly numbing and packed with flavor",
        "Hand-pulled noodles made fresh in the window — you can watch them work",
        "Their Peking duck is crispy and succulent, need to order a day ahead",
    ],
    "french": [
        "Flawless execution on every dish, the duck confit is crisp and tender",
        "Their croissants are better than what I had in Paris, no exaggeration",
        "Elegant without being stuffy, perfect for a special anniversary dinner",
    ],
    "american": [
        "Best burger in the neighborhood — perfectly medium-rare, great bun",
        "Their brunch is outstanding — the pancakes are fluffy clouds of joy",
        "Honest, well-made comfort food, generous portions and great value",
    ],
    "seafood": [
        "Incredibly fresh oysters, great happy hour deal at $1.50 each",
        "Their lobster roll is loaded with big chunks of claw meat, buttered perfectly",
    ],
    "steakhouse": [
        "Perfectly dry-aged ribeye, cooked exactly to temperature, fantastic crust",
        "Old-school NYC steakhouse vibe, servers in white jackets, martinis ice cold",
    ],
    "indian": [
        "The chicken tikka masala is creamy and aromatic, best I've had in Manhattan",
        "Their garlic naan is perfectly charred and buttery, great veg options too",
    ],
    "thai": [
        "Pad kee mao with legit heat — they don't tone it down for tourists",
        "Best green curry in the city, the coconut milk base is incredibly fragrant",
    ],
    "korean": [
        "The Korean fried chicken is insanely crispy, and the spicy gochujang sauce is perfect",
        "Great KBBQ, high quality meats, the banchan spread is generous and refilled quickly",
    ],
    "mediterranean": [
        "Fresh, vibrant flavors — the mezze platter is a feast on its own",
        "Their lamb shank falls off the bone and the saffron rice is fragrant",
    ],
    "vietnamese": [
        "The pho broth is deep and aromatic, clearly simmered for hours",
        "Their banh mi has the perfect crunch-to-filling ratio, and the pâté is excellent",
    ],
}

DEFAULT_RESTAURANT_REVIEWS = [
    "Great food and friendly service, will definitely be coming back",
    "One of my favorite spots in the neighborhood, consistently excellent",
    "Surprisingly good — unassuming from the outside but the food speaks for itself",
    "A hidden gem, the menu is creative and the execution is spot on",
    "Solid choice for a casual dinner, the portions are generous and prices fair",
    "The staff here really care about the food, you can taste it in every dish",
    "Been coming here for years and it never disappoints — consistent quality",
]

BAR_REVIEWS = [
    "Incredible cocktail program — the bartender knows their craft, every drink is balanced",
    "Best dirty martini in the city, and they're not stingy with the pour",
    "Great speakeasy vibe, the entrance is hidden and the lighting is perfect",
    "Their happy hour is the best deal in the neighborhood, $8 craft cocktails",
    "Intimate space with amazing jazz on Thursday nights — perfect date spot",
    "The rooftop view is stunning, especially at sunset — get there early for a good table",
    "Deep whiskey list, the bartender helped me find a perfect pour in my budget",
    "Lively but not overwhelming — great for a group night out without the chaos",
    "Their mezcal selection is impressive, and the staff really know their agave spirits",
    "Great beer list with lots of local NYC breweries represented",
]

COFFEE_CAFE_REVIEWS = [
    "Best flat white in the neighborhood, the baristas really know what they're doing",
    "Perfect spot to work — fast WiFi, plenty of outlets, and great coffee",
    "Their house-roasted beans are exceptional, you can buy bags to take home",
    "The cortado here is perfection — small, strong, and beautifully presented",
    "Cozy atmosphere, excellent pastries, and the staff remember your order",
    "Their pour-over game is strong — they weigh everything and it shows in the cup",
]

NIGHT_CLUB_REVIEWS = [
    "The sound system here is incredible — crystal clear bass that you feel in your chest",
    "Great lineup of DJs, the dance floor is packed but there's room to breathe on the sides",
    "Cool underground vibe, not pretentious at all — just good music and good people",
    "Bottle service was actually worth it — our host was attentive without hovering",
    "One of the few clubs where the crowd is there for the music, not just to be seen",
]

CULTURE_REVIEWS = [
    "Fascinating exhibits, well-curated with informative plaques — spent 3 hours here easily",
    "A hidden cultural gem — the collection is small but thoughtfully assembled",
    "Beautiful space, the architecture alone is worth the visit",
    "Great rotating exhibitions, every time I visit there's something new to discover",
    "Incredibly knowledgeable staff, the guided tour was the highlight of my visit",
    "Perfect rainy day activity — thought-provoking art in a stunning setting",
    "The current exhibit is absolutely stunning, one of the best I've seen in NYC",
]

MUSEUM_REVIEWS = [
    "One of the most interesting museums in NYC — and far less crowded than the big names",
    "The collection is beautifully presented, excellent lighting and spacing between pieces",
    "Free admission on Thursdays! The permanent collection is well worth multiple visits",
    "Great for kids and adults alike — interactive exhibits that actually teach you something",
]

ART_GALLERY_REVIEWS = [
    "Excellent curation — the current show features some really exciting emerging artists",
    "The gallery space itself is gorgeous, high ceilings and natural light pouring in",
    "Opening nights here are fantastic — great crowd, free drinks, and amazing art",
    "The staff are welcoming and knowledgeable, not stuffy at all like some galleries",
    "Bought a piece here — the gallery made the whole process seamless and transparent",
]

ENTERTAINMENT_REVIEWS = [
    "The show was absolutely incredible — laughed until my face hurt",
    "Great acoustics, intimate setting — there's not a bad seat in the house",
    "The performers are world-class, this place is a true NYC institution",
    "Fantastic venue — clean, well-staffed, and the drinks aren't outrageously priced",
]

# Price-value modifiers
PRICE_MODIFIERS = {
    "price level very cheap": [
        "Incredible value for the quality — one of the best deals in the neighborhood",
        "Way better than you'd expect at this price point, seriously underrated",
        "Cheap eats done right — fresh ingredients and great execution",
    ],
    "price level cheap": [
        "Great bang for your buck, especially compared to other spots nearby",
        "Affordable without cutting corners — quality ingredients at fair prices",
    ],
    "price level moderate": [
        "Prices are fair for the quality and portion sizes — not cheap but worth it",
        "Mid-range pricing but the execution is high-end — excellent value",
    ],
    "price level expensive": [
        "Pricey but absolutely worth it for a special occasion — flawless experience",
        "You get what you pay for — the quality justifies the premium pricing",
    ],
    "price level very expensive": [
        "Splurge-worthy — every detail is considered, from the amuse-bouche to the petit fours",
        "Once-in-a-while kind of place — exceptional quality, unforgettable experience",
    ],
}

# Zone-based local flavor
ZONE_FLAVOR = {
    "East Village": [
        "Quintessential East Village vibe — laid-back, creative, and effortlessly cool",
    ],
    "Lower East Side": [
        "Classic LES energy — unpretentious and full of character",
    ],
    "Chinatown": [
        "Right in the heart of Chinatown — surrounded by great food and vibrant street life",
    ],
    "Alphabet City": [
        "Proper Alphabet City charm — neighborhoody and full of local character",
    ],
    "Midtown South": [
        "Convenient midtown location, surprisingly good for the tourist-heavy area",
    ],
    "Union Sq": [
        "Love the Union Square location — perfect for people-watching before or after",
    ],
    "Gramercy": [
        "Gramercy Park elegance without the pretension — a neighborhood gem",
    ],
    "Greenwich Village": [
        "Classic Village charm — tree-lined streets and a cozy neighborhood feel",
    ],
    "Kips Bay": [
        "Great Kips Bay spot — quiet enough for conversation, lively enough for a good time",
    ],
    "Chelsea": [
        "Perfect Chelsea location — pop in after gallery hopping on a Saturday afternoon",
    ],
    "Stuy Town/Peter Cooper Village": [
        "Convenient for Stuy Town residents — walkable and consistently good",
    ],
}

DEFAULT_ZONE_FLAVOR = [
    "Love this neighborhood spot — it fits right into the local scene",
    "A real neighborhood gem — exactly what this area needed",
]


def classify_venue(name, loc_type, description, tags):
    """Classify a venue into cuisine/type buckets for review selection."""
    text = f"{name} {loc_type} {description} {tags}".lower()

    if "museum" in text:
        return "museum"
    if "art gallery" in text or "gallery" in text:
        return "art_gallery"
    if "night club" in text or "nightclub" in text:
        return "night_club"
    if "bar" in text:
        return "bar"
    if "cafe" in text or "coffee" in text:
        return "coffee_cafe"
    if "bakery" in text:
        return "coffee_cafe"
    if "entertainment" in text or "theater" in text or "theatre" in text or "comedy" in text or "cinema" in text or "movie" in text:
        return "entertainment"
    if "culture" in text or "cultural" in text:
        return "culture"

    # Restaurant cuisine matching
    cuisines = [
        "italian", "pizza", "mexican", "japanese", "chinese", "french",
        "american", "seafood", "steakhouse", "indian", "thai", "korean",
        "mediterranean", "vietnamese",
    ]
    for cuisine in cuisines:
        if cuisine in text:
            return cuisine

    if "restaurant" in text or "food" in text:
        return "restaurant"

    return "general"


def generate_reviews(row):
    """Generate 2-3 realistic review snippets for a given venue row."""
    name = str(row.get("name", ""))
    loc_type = str(row.get("loc_type", ""))
    description = str(row.get("description", ""))
    tags = str(row.get("tags", ""))
    price = str(row.get("price", ""))
    zone = str(row.get("zone", ""))
    rating_str = str(row.get("reviews", ""))
    num_reviews = row.get("num_reviews", 0)

    category = classify_venue(name, loc_type, description, tags)

    # Pick review templates based on category
    if category in RESTAURANT_REVIEWS:
        review_pool = RESTAURANT_REVIEWS[category]
    elif category == "bar":
        review_pool = BAR_REVIEWS
    elif category == "coffee_cafe":
        review_pool = COFFEE_CAFE_REVIEWS
    elif category == "night_club":
        review_pool = NIGHT_CLUB_REVIEWS
    elif category == "museum":
        review_pool = MUSEUM_REVIEWS
    elif category == "art_gallery":
        review_pool = ART_GALLERY_REVIEWS
    elif category == "entertainment":
        review_pool = ENTERTAINMENT_REVIEWS
    elif category == "culture":
        review_pool = CULTURE_REVIEWS
    elif category == "restaurant":
        review_pool = DEFAULT_RESTAURANT_REVIEWS
    else:
        # Mix general reviews
        review_pool = DEFAULT_RESTAURANT_REVIEWS + BAR_REVIEWS[:3] + CULTURE_REVIEWS[:3]

    # Generate 2-4 reviews
    num_snippets = random.randint(2, 4)
    selected = random.sample(review_pool, min(num_snippets, len(review_pool)))

    # Occasionally add a price modifier
    if price in PRICE_MODIFIERS and random.random() < 0.3:
        selected.append(random.choice(PRICE_MODIFIERS[price]))

    # Occasionally add a zone flavor
    zone_pool = ZONE_FLAVOR.get(zone, DEFAULT_ZONE_FLAVOR)
    if random.random() < 0.2:
        selected.append(random.choice(zone_pool))

    # Add rating prefix
    rating_prefix = ""
    if rating_str.startswith("Rating:"):
        rating_prefix = rating_str + " — "
    elif rating_str == "No rating":
        rating_prefix = ""

    snippets = " | ".join(selected)
    return f"{rating_prefix}{snippets}"


def main():
    service_dir = Path(__file__).resolve().parent.parent
    csv_path = service_dir / "corpus" / "v1" / "venues.csv"

    if not csv_path.is_file():
        print(f"Error: venues.csv not found at {csv_path}", file=sys.stderr)
        return 1

    print(f"Reading {csv_path}...")
    rows = []
    with open(csv_path, "r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        for row in reader:
            rows.append(row)

    print(f"Generating review snippets for {len(rows)} venues...")
    for i, row in enumerate(rows):
        row["reviews"] = generate_reviews(row)
        if (i + 1) % 500 == 0:
            print(f"  {i + 1}/{len(rows)} venues processed...")

    print(f"Writing updated venues.csv...")
    with open(csv_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print("Done! Reviews updated for all venues.")

    # Show some samples
    print("\n=== Sample reviews ===")
    for i in [0, 1, 50, 100, 500, 1000, 2000]:
        if i < len(rows):
            print(f"[{i}] {rows[i]['name']}: {rows[i]['reviews'][:150]}...")

    return 0


if __name__ == "__main__":
    sys.exit(main())
