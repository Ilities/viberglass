# Viberglass Project Branding Guidelines

## Brand Colors

### Primary Color Palette
```
Burnt Orange:  #d4520a  (rgb: 212, 82, 10)
Golden Brass:  #e8923e  (rgb: 232, 146, 62)
Warm Gold:     #c9a869  (rgb: 201, 168, 105)
Cream:         #f5e6d3  (rgb: 245, 230, 211)
```

### Neutral Colors
```
Charcoal:      #1a1a1a  (rgb: 26, 26, 26)
Dark Gray:     #282828  (rgb: 40, 40, 40)
Light Gray:    #e8e8e8  (rgb: 232, 232, 232)
```

## Color Usage Guidelines

### When to use each color:

**Burnt Orange (#d4520a)**
- Primary brand color
- Call-to-action buttons
- Important highlights
- Links and interactive elements
- Start of gradients

**Golden Brass (#e8923e)**
- Secondary brand color
- Hover states
- Icons and accents
- End of gradients
- Text highlights

**Warm Gold (#c9a869)**
- Tertiary accent
- Subtle highlights
- Gradient transitions
- Border accents

**Cream (#f5e6d3)**
- Light text on dark backgrounds
- Soft highlights
- Center points of radial gradients

**Charcoal (#1a1a1a)**
- Primary background color
- Dark mode base

**Dark Gray (#282828)**
- Card backgrounds
- Secondary surfaces
- Hover states on dark backgrounds

**Light Gray (#e8e8e8)**
- Light mode text
- Borders and dividers

## Gradient Patterns

### Primary Gradient (Horizontal)
```css
background: linear-gradient(135deg, #d4520a 0%, #e8923e 100%);
```

### Extended Gradient (Text/Wordmarks)
```css
background: linear-gradient(135deg, #d4520a 0%, #e8923e 50%, #c9a869 100%);
```

### Baton Gradient (Diagonal)
```css
background: linear-gradient(135deg, #e8923e 0%, #c9a869 100%);
```

## Typography

**Primary Font:** Space Mono (monospace)
- Use for body text, code, and technical content
- Font weight: 700

**Display Font:** Orbitron
- Use for logos, headers, and brand elements
- Font weight: 900

## Design Principles

1. **Industrial & Warm**: Balance technical precision with warmth through color choice
2. **No AI Slop**: Avoid cyan-magenta gradients, purple themes, and generic tech aesthetics
3. **Grounded**: Use earth tones and warm metals rather than neon or electric colors
4. **Functional**: Colors should serve purpose, not just decoration

## Component Styling Examples

### Buttons
```css
.primary-button {
    background: linear-gradient(135deg, #d4520a, #e8923e);
    color: #1a1a1a;
    border-radius: 50px;
}

.primary-button:hover {
    box-shadow: 0 10px 30px rgba(212, 82, 10, 0.3);
}
```

### Cards
```css
.card {
    background: rgba(40, 40, 40, 0.4);
    border: 1px solid rgba(212, 82, 10, 0.2);
    border-radius: 20px;
}

.card:hover {
    border-color: rgba(212, 82, 10, 0.5);
    box-shadow: 0 20px 40px rgba(212, 82, 10, 0.15);
}
```

### Links
```css
a {
    color: #e8923e;
}

a:hover {
    color: #d4520a;
}
```

## Accessibility

- Ensure text meets WCAG AA contrast ratios (4.5:1 for normal text, 3:1 for large text)
- Burnt Orange (#d4520a) on Charcoal (#1a1a1a): ✅ Pass
- Golden Brass (#e8923e) on Charcoal (#1a1a1a): ✅ Pass
- Light Gray (#e8e8e8) on Charcoal (#1a1a1a): ✅ Pass

## What NOT to Use

❌ Cyan (#00f7ff) or similar electric blues
❌ Magenta (#ff00ff) or hot pinks
❌ Purple gradients
❌ Generic tech colors (Inter font with purple gradients)
❌ Neon colors
❌ Cool-toned palettes

## Brand Concept

Viberglass is an orchestrator platform - the name combines "vibe" (harmony, coordination) with "glass" (transparency, clarity). The logo features sound waves intersecting with a conductor's baton, symbolizing the coordination of multiple services working in harmony with clear visibility into operations.

The color palette reflects this concept:
- Warm tones evoke brass instruments and orchestra aesthetics
- Industrial feel represents technical infrastructure
- Grounded earth tones suggest reliability and stability