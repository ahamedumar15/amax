# The Release map's pin shows as a small "+", not one across the map

**Change:** 153-map-pin-icon · **Created:** 2026-11-27 · **Review:** change

## Problem

Hovering the Release map card (all releases and a project's Releases tab) shows the card's pin as a purple "+" about
760 px wide across the map. The rule meant for the map drawing, `.map svg{width:100%;max-width:1000px;min-width:760px}`
in `modules/delivery/ui/delivery.css`, also matches the PinButton's 24-px icon in the card head, which only appears on
hover. Found in the product owner's demo, 2026-11-27 (measured: the icon renders 760×760).

## Mock Delta

What changes on screen, and where to see it: no mock section. The Release map looks as its mock shows (051); on hover
its pin is the same small "+" as every other card's pin. Like 098, this change gets no section of its own.

## Acceptance Criteria

1. **AC-1 The map's size rule sizes only the map.** The rule applies to the map drawing alone (the card's direct `svg`
   child), so the pin icon in the card head keeps the pin's own size, and the map keeps its width, its 760-px minimum
   and its horizontal scroll on narrow screens.
2. **AC-2 Checked on screen and by a test.** Hovering the Release map card shows a pin icon the size of other cards' pins
   (screenshot before and after, light and dark); a test renders the Releases cards and checks the size rule can't
   reach an `svg` outside the map drawing.

## Tasks

## Verify
