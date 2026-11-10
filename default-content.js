/* Isi awal website Mula Bali Bamboo Villas.
   Dipakai bila database belum berisi atau sedang tidak bisa dihubungi.
   Setelah admin menyimpan pertama kali, isi dari database yang dipakai. */
window.MB_DEFAULT_CONTENT = {
  "version": 1,
  "brand": {
    "name": "Mula Bali Bamboo Villas",
    "location": "Selat · Karangasem · Bali",
    "loaderImage": "img/loader-logo-9x16.jpg"
  },
  "contact": {
    "whatsapp": "6287823085069",
    "whatsappDisplay": "+62 878-2308-5069",
    "email": "",
    "address": "Selat, Karangasem, Bali · Indonesia",
    "mapsUrl": ""
  },
  "social": [
    { "name": "Instagram", "url": "https://instagram.com/mulabali_bamboovilla" },
    { "name": "TikTok", "url": "" },
    { "name": "Facebook", "url": "" }
  ],
  "hero": {
    "image": "img/hero-villa-dusk.jpg",
    "titleLine1": "Mula Bali",
    "titleLine2": "Bamboo Villas",
    "subtitle": "A private luxury bamboo villa in the quiet hills of East Bali – built from the earth, made for slow days.",
    "ctaPrimary": "Check availability",
    "ctaSecondary": "Take the 360° tour"
  },
  "about": {
    "eyebrow": "What is Mula Bali",
    "title": "Rooted in nature, crafted from bamboo",
    "paragraphs": [
      "\"Mula\" means origin – the root of things. Mula Bali is a single luxury villa in Selat, Karangasem, where bamboo architecture, terracotta tones and mountain air come together in one quiet retreat."
    ],
    "stats": [
      { "value": "1", "label": "Private luxury villa" },
      { "value": "2", "label": "Bedrooms, upper & lower" },
      { "value": "4", "label": "Guests maximum" }
    ],
    "slides": [
      { "image": "img/egg-window-hq.jpg", "caption": "The egg window" },
      { "image": "img/walkway-dusk-hq.jpg", "caption": "Sunset walkway" },
      { "image": "img/canopy-bed.jpg", "caption": "Upstairs bedroom" },
      { "image": "img/pool-rice-fields.jpg", "caption": "Morning swim" },
      { "image": "img/copper-bathtub.jpg", "caption": "Copper bathtub" },
      { "image": "img/bamboo-roof-terraces.jpg", "caption": "Bamboo architecture" }
    ]
  },
  "gallery": {
    "eyebrow": "Gallery",
    "title": "Every corner, handcrafted",
    "text": "Sculpted bamboo, a copper bathtub, a private pool and endless rice terraces with Mount Agung on the horizon. Tap any photo to view it full size.",
    "photos": [
      { "image": "img/pool-mountain-view.jpg", "caption": "Pool & Mount Agung", "tall": true },
      { "image": "img/copper-bathtub.jpg", "caption": "Copper bathtub", "tall": false },
      { "image": "img/night-pool-villa.jpg", "caption": "Blue hour by the pool", "tall": false },
      { "image": "img/bamboo-roof-terraces.jpg", "caption": "Bamboo architecture", "tall": true },
      { "image": "img/walkway-dusk-hq.jpg", "caption": "Sunset walkway", "tall": false },
      { "image": "img/night-deck.jpg", "caption": "Evening deck", "tall": false },
      { "image": "img/bamboo-dining.jpg", "caption": "Dining & spiral stair", "tall": true },
      { "image": "img/canopy-bed.jpg", "caption": "Upstairs bedroom", "tall": false },
      { "image": "img/pool-rice-fields.jpg", "caption": "Morning swim", "tall": false }
    ]
  },
  "tour": {
    "show": true,
    "eyebrow": "Virtual Tour 360°",
    "title": "Walk through the villa before you arrive",
    "text": "Drag or swipe to look around the villa, zoom in on the details, or open it full screen.",
    "panorama": "img/tour-360.jpg"
  },
  "rates": {
    "eyebrow": "Rates",
    "title": "Stay longer, pay less",
    "text": "Book 3 nights or more and enjoy our special long-stay rate with added inclusions.",
    "longStayFrom": 3,
    "maxGuests": 4,
    "note": "Rates are per night for the entire villa.",
    "standard": {
      "label": "Standard stay",
      "nights": "1 – 2 nights",
      "price": 20000000,
      "button": "Book standard",
      "image": "img/night-deck.jpg",
      "features": ["Entire villa, up to 4 guests", "2 bedrooms, upper & lower", "Private pool & copper bathtub"]
    },
    "long": {
      "label": "Long stay",
      "nights": "3 nights or more",
      "price": null,
      "badge": "Best value",
      "button": "Book 3+ nights",
      "image": "img/pool-mountain-view.jpg",
      "features": ["Everything in standard stay", "Special long-stay nightly rate"]
    }
  },
  "addons": {
    "show": true,
    "eyebrow": "Plan your stay",
    "title": "Add to your stay",
    "text": "Choose your dates, add the little extras that make it yours, and send us your request in one tap.",
    "items": [
      { "id": "transfer", "name": "Airport transfer", "desc": "Private car between Ngurah Rai Airport and the villa.", "detail": "", "unit": "per trip", "price": null, "mode": "qty", "max": 2, "image": "img/addon-transfer.jpg" },
      { "id": "breakfast", "name": "Floating breakfast", "desc": "A tropical breakfast served in your private pool.", "detail": "", "unit": "per person", "price": null, "mode": "guest", "max": 4, "image": "img/addon-breakfast.jpg" },
      { "id": "massage", "name": "Balinese massage", "desc": "A 60-minute traditional massage in the villa.", "detail": "", "unit": "per person", "price": null, "mode": "guest", "max": 4, "image": "img/addon-massage.jpg" },
      { "id": "dinner", "name": "Candlelight dinner", "desc": "A private candlelit dinner for two under the stars.", "detail": "", "unit": "per stay", "price": null, "mode": "once", "max": 1, "image": "img/addon-dinner.jpg" },
      { "id": "jacuzzi", "name": "Flower jacuzzi", "desc": "Your jacuzzi filled with fresh tropical flowers, overlooking the rice terraces.", "detail": "", "unit": "per stay", "price": null, "mode": "once", "max": 1, "image": "img/addon-flower-jacuzzi.jpg" },
      { "id": "walk", "name": "Rice terrace walk", "desc": "A guided walk through the Sidemen valley, with Mount Agung on the horizon.", "detail": "", "unit": "per person", "price": null, "mode": "guest", "max": 4, "image": "img/addon-walk.jpg" },
      { "id": "photoshoot", "name": "Photo shoot", "desc": "A professional photographer captures your stay at the villa and the rice terraces.", "detail": "", "unit": "per session", "price": null, "mode": "once", "max": 1, "image": "img/addon-photoshoot.jpg" }
    ]
  },
  "booking": {
    "eyebrow": "How to book",
    "title": "Reserve in three simple steps",
    "steps": [
      { "title": "Choose your dates", "text": "Pick your check-in and check-out. Stay 3 nights or more to unlock the long-stay rate." },
      { "title": "Pick your platform", "text": "Book securely through the trusted platform you prefer, or message us directly." },
      { "title": "Get confirmed", "text": "Receive your confirmation and arrival details. We will be ready to welcome you." }
    ],
    "links": [
      { "name": "Booking.com", "url": "" },
      { "name": "Agoda", "url": "" },
      { "name": "Airbnb", "url": "" }
    ]
  },
  "seo": {
    "title": "Mula Bali Bamboo Villas · Luxury bamboo villa in Selat, Bali",
    "description": "A private luxury bamboo villa in Selat, Karangasem, East Bali, with a private pool, copper bathtub and rice-terrace views of Mount Agung."
  }
};
