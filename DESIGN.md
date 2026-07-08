---
name: Room Booking System
description: University digital media room booking platform
---

<!-- SEED: re-run /impeccable document once there's code to capture the actual tokens and components. -->

# Design System: Room Booking System

## 1. Overview

**Creative North Star: "The Academic Commons"**

A restrained, humanist interface that feels like a well-organized university service desk—clear, efficient, and approachable. The system prioritizes information clarity over visual flair, using a single University Blue accent sparingly to guide attention without overwhelming. Motion is responsive and purposeful, providing feedback on state changes without choreography. This is a tool for getting work done, not a marketing surface.

The design explicitly rejects the saturated, dark-mode-heavy aesthetic of Discord, instead embracing the light, neutral foundations of Microsoft Fluent 2 and the systematic clarity of Material Design 3. GitHub's information-dense but readable patterns inform the data presentation approach.

**Key Characteristics:**
- Restrained color use with University Blue as the sole accent
- Humanist sans-serif typography for approachable readability
- Responsive motion that provides feedback without distraction
- Light, neutral backgrounds with clear information hierarchy
- Professional but not stiff—university-appropriate warmth

## 2. Colors

**The Restrained Rule. The primary accent is used on ≤10% of any given screen. Its rarity is the point.**

### Primary
- **University Blue** ([to be resolved during implementation]): Primary action buttons, active navigation states, and key interactive elements. Used sparingly to guide user attention.

### Secondary
- [Not applicable—restrained strategy uses one accent only]

### Tertiary
- [Not applicable—restrained strategy uses one accent only]

### Neutral
- **Background** ([to be resolved during implementation]): Page backgrounds and card surfaces
- **Surface** ([to be resolved during implementation]): Elevated containers and form inputs
- **Border** ([to be resolved during implementation]): Dividers and input outlines
- **Text Primary** ([to be resolved during implementation]): Headlines and body copy
- **Text Secondary** ([to be resolved during implementation]): Supporting labels and metadata

### Named Rules
**The Restrained Rule.** The primary accent is used on ≤10% of any given screen. Its rarity is the point.

## 3. Typography

**Display Font:** [font pairing to be chosen at implementation]
**Body Font:** [font pairing to be chosen at implementation]
**Label/Mono Font:** [font pairing to be chosen at implementation]

**Character:** Humanist sans-serif pairing that feels approachable and academic—legible at small sizes, warm but professional, avoiding the coldness of geometric sans or the informality of display fonts.

### Hierarchy
- **Display** ([weight], [size/clamp], [line-height]): Page titles and section headers
- **Headline** ([weight], [size], [line-height]): Card titles and form section headers
- **Title** ([weight], [size], [line-height]): Subsection labels and emphasis text
- **Body** ([weight], [size], [line-height]): Primary content and form labels, max line length 65–75ch
- **Label** ([weight], [size], [letter-spacing], [case if uppercase]): Button text, tags, and small metadata

### Named Rules
**The Humanist Rule.** Typography uses a single humanist sans-serif family across all scales. No geometric or display mixing—consistency supports clarity.

## 4. Elevation

The system uses subtle tonal layering with minimal shadows. Depth is conveyed primarily through background tints and border treatments, with shadows reserved for hover states and active elements. This aligns with the responsive motion philosophy—elevation responds to interaction rather than being a permanent fixture.

### Shadow Vocabulary
- **Hover Glow** ([to be resolved during implementation]): Applied on button hover and card elevation
- **Focus Ring** ([to be resolved during implementation]): Keyboard navigation focus state

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at rest. Shadows appear only as a response to state (hover, elevation, focus).

## 5. Components

[Components will be documented once the design system is implemented. Re-run `/impeccable document` to extract actual component patterns from the codebase.]

## 6. Do's and Don'ts

### Do:
- **Do** use University Blue sparingly—only for primary actions and active states
- **Do** maintain light, neutral backgrounds for maximum readability
- **Do** use humanist sans-serif typography for approachable, academic tone
- **Do** provide responsive motion feedback on all interactive elements
- **Do** ensure WCAG 2.1 Level AA contrast ratios (4.5:1 for body text)
- **Do** support keyboard navigation with visible focus states

### Don't:
- **Don't** use Discord-like dark mode with saturated accents and gradients
- **Don't** apply the primary accent to more than 10% of any screen
- **Don't** use geometric or display fonts that feel cold or informal
- **Don't** add choreographed motion or scroll-driven animations
- **Don't** use shadows as a default—reserve them for interaction states
- **Don't** create designs that feel "outdated" or overly complex
- **Don't** use generic SaaS visual patterns that lack university context
