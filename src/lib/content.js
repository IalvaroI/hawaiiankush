import { useEffect, useState } from 'react'

// Editable copy that lives outside the bundle (plan rule 3a.6). public/content.json is read at runtime, so an edit
// shows on the next page load without a rebuild. DEFAULTS is the same text as that file: the UI renders with it at once,
// and it is what the page keeps when the file is missing or malformed. Keep the two in step.
export const DEFAULTS = {
  "hero": {
    "eyebrow": "Premium cannabis",
    "title": "Island Quality. Higher Living.",
    "subtitle": "Flower, pre-rolls, edibles and more, ordered ahead and ready at our Maui shop.",
    "cta": {
      "label": "Shop the menu",
      "to": "/shop"
    },
    "secondaryCta": {
      "label": "Not sure? Find your match",
      "to": "/picker"
    },
    "image": {
      "desktop": {
        "base": "images/site/hero-desktop-v2",
        "widths": [
          1000,
          1600
        ]
      },
      "mobile": {
        "base": "images/site/hero-mobile-v2",
        "widths": [
          900
        ]
      }
    }
  },
  "trust": [
    {
      "icon": "lab",
      "title": "Lab figures",
      "text": "Total THC, CBD and terpenes from the lab report."
    },
    {
      "icon": "clock",
      "title": "Pickup in 30–60 minutes",
      "text": "Order online, collect in store with your ID."
    },
    {
      "icon": "waves",
      "title": "Local & independent",
      "text": "A small, independent shop on Maui."
    }
  ],
  "promo": {
    "eyebrow": "New Arrivals",
    "title": "Just in at the shop",
    "cta": {
      "label": "See what’s new",
      "to": "/shop?sort=createdDesc"
    },
    "image": {
      "base": "images/site/new-arrivals-v2",
      "widths": [
        720
      ]
    }
  },
  "story": [
    {
      "eyebrow": "Local & independent",
      "title": "Two brothers, one island",
      "text": "Hawaiian Kush is a small, independent Maui shop, proudly serving our community. Come say aloha.",
      "cta": {
        "label": "Find us",
        "to": "/locations"
      },
      "image": {
        "base": "images/site/local-independent-v2",
        "widths": [
          700,
          1200
        ]
      }
    },
    {
      "eyebrow": "Quality & education",
      "title": "Know what you’re choosing",
      "text": "Every product shows its lab figures — Total THC, CBD and terpenes — when the lab reports them. New to cannabis? Start with plain answers.",
      "cta": {
        "label": "Read the guide",
        "to": "/learn"
      },
      "image": {
        "base": "images/site/quality-education-v2",
        "widths": [
          700,
          1200
        ]
      }
    }
  ],
  "pickupReadyText": "Ready in 30–60 mins",
  "sidebarTagline": [],
  "learn": {
    "title": "Learn",
    "intro": "Plain answers to common questions about cannabis, our products and how pickup works. This page is general information, not medical advice. For questions about your health, talk with a healthcare professional.",
    "sections": [
      {
        "title": "Hybrid, Indica and Sativa",
        "body": "Hybrid, indica and sativa are the names growers use for a plant's type. Hybrids mix traits from both parents. Sativa-leaning plants are usually taller with narrow leaves and a longer flowering period. Indica-leaning plants tend to be shorter and bushier.\n\nShoppers often use these names as a rough guide to how a product might feel. The chemistry on the label, especially THC and CBD, and the terpenes that give each strain its aroma, tell you more. Everyone reacts differently, so treat the type as a starting point, not a promise."
      },
      {
        "title": "Reading a label",
        "body": "THC is the cannabinoid most associated with the feeling of being high. CBD is a cannabinoid that does not cause that feeling. Labels show both as a percentage for flower and concentrates, and as milligrams per package or serving for edibles and drinks.\n\nFor edibles, check the serving size and the total milligrams in the package, then work out how much you are taking. Terpenes give cannabis its smell and taste. Some lab reports list them."
      },
      {
        "title": "Start low and go slow",
        "body": "Begin with a small amount: one serving of an edible, or a single puff or short inhale. Wait before you take more. Edibles can take 30 to 120 minutes to take effect and can last much longer than smoked or vaped products. Waiting two hours before a second serving is a common rule of thumb.\n\nAfter using cannabis, do not drive or operate machinery. Keep products in a safe place out of reach of children and pets, and store edibles clearly labelled so no one mistakes them for regular snacks."
      },
      {
        "title": "Lab tested products",
        "body": "Many products come with a certificate of analysis from a licensed testing laboratory. These reports list potency and screening results, such as pesticides, microbes, heavy metals and residual solvents. When a lab report is available for a product, it is linked from that product's page."
      },
      {
        "title": "How pickup works",
        "body": "Choose your products online, pick a pickup time, and we will prepare your order. Most orders are ready in 30 to 60 minutes. Your time window is shown at checkout and in your bag.\n\nHave a valid government-issued photo ID ready when you pick up your order."
      },
      {
        "title": "Age and ID requirements",
        "body": "You must be 21 or older to buy cannabis. Have a valid government-issued photo ID ready at pickup. Medical purchases also need a valid medical cannabis ID."
      },
      {
        "title": "Using cannabis safely",
        "body": "Cannabis can affect coordination, judgement, memory and reaction time. Avoid combining it with alcohol or other sedatives. Check with a healthcare professional before using cannabis if you are pregnant, breastfeeding, or taking other medication."
      }
    ],
    "image": {
      "base": "images/site/quality-education-v2",
      "widths": [
        700,
        1200
      ]
    }
  },
  "locations": {
    "image": {
      "base": "images/site/local-independent-v2",
      "widths": [
        700,
        1200
      ]
    }
  }
};

let resolved = null // the merged content, once the request has settled
let pending = null // the single request for this page load

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

// Objects merge key by key. A null is kept (it hides the element it belongs to). Arrays and text replace the default
// whole, and a value of the wrong type is ignored so one bad field cannot break the page.
function merge(base, override) {
  if (!isPlainObject(override)) return base
  const out = { ...base }
  for (const [key, value] of Object.entries(override)) {
    const current = base[key]
    if (isPlainObject(value) && isPlainObject(current)) out[key] = merge(current, value)
    else if (value === null) out[key] = null
    else if (current === undefined || (typeof value === typeof current && Array.isArray(value) === Array.isArray(current))) out[key] = value
  }
  return out
}

export function loadContent() {
  pending ??= (async () => {
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}content.json`, { cache: 'no-cache' })
      if (!response.ok) throw new Error(`content.json answered ${response.status}`)
      resolved = merge(DEFAULTS, await response.json())
    } catch (error) {
      console.warn('Using the built-in page copy.', error)
      resolved = DEFAULTS
    }
    return resolved
  })()
  return pending
}

// The editable copy for this page load. Starts with DEFAULTS, then swaps in content.json once it arrives.
export function useContent() {
  const [content, setContent] = useState(() => resolved || DEFAULTS)
  useEffect(() => {
    let active = true
    loadContent().then((next) => { if (active) setContent(next) })
    return () => { active = false }
  }, [])
  return content
}
