# Phase 2 Roadmap

## Purpose

This document captures the next expansion wave after the core Phase 1 platform is stable.

`Phase 2` is where the product moves from internal audit tooling into a richer local growth intelligence platform.

## Phase 2 goals

- deepen Google and local search intelligence
- support richer multi-location analysis
- add operational convenience beyond manual runs
- improve desktop polish and packaging
- introduce stronger client-ready insights, not just audits

## Confirmed Phase 2 item: Google Maps / Places

`Google Maps Platform / Places` is explicitly placed in `Phase 2`.

Reason:

- it is useful
- it adds cost and billing considerations
- it is not required for the core Phase 1 audit workflow
- it should come after Search Console and Business Profile are delivering real value

## Why Places belongs in Phase 2

Places is best used for:

- business location normalization
- `place_id` resolution
- address and geo validation
- competitor discovery by category and radius
- local entity matching between website, GBP, and map presence
- proximity-based local search analysis

This is powerful, but it adds:

- Google Maps Platform billing setup
- usage monitoring
- stronger cache/storage policy decisions
- more complex local data models

## Phase 2 feature ideas

### A. Maps / Places intelligence

Potential capabilities:

- map each client location to a canonical `place_id`
- normalize location names, addresses, coordinates, phone numbers, and websites
- identify nearby competitors for chosen business categories
- compare client location density versus nearby competing businesses
- detect inconsistencies between:
  - website location page
  - Google Business Profile
  - Places record

Potential outputs:

- location confidence score
- nearby competitor panel
- address consistency warnings
- missing-map-entity alerts

### B. Multi-location operating layer

Potential capabilities:

- roll-up reporting by brand and by location cluster
- location comparison views
- outlier detection by unit
- local landing page coverage checks
- location-level export packs

Potential outputs:

- top-performing locations
- weak locations needing action
- inconsistent location assets
- missing landing pages by location

### C. Competitive local search view

Potential capabilities:

- compare local categories and competitors
- identify areas with weak local presence
- attach competitor notes to location records
- create opportunity flags for expansion or optimization

### D. Scheduled sync

Potential capabilities:

- daily refresh of connected integrations
- re-use the existing job table
- snapshot history over time
- diff detection and change summaries

Potential outputs:

- daily health summary
- trend alerts
- regression detection

### E. Export and delivery upgrades

Potential capabilities:

- packaged PowerPoint-style executive export
- branded PDF themes per client or agency
- summary email generation
- export bundles by location

### F. Desktop product polish

Potential capabilities:

- packaged installer
- auto-update flow
- saved workspaces
- first-run setup assistant
- system tray or background sync mode

## Suggested Phase 2 structure additions

### New connectors

- `google_places`
- optional later `google_maps_geocoding`

### New capability groups

- `location_normalization`
- `local_competitor_discovery`
- `place_identity_resolution`
- `geo_consistency`

### New snapshot sections

- `places`
- `competitors`
- `geoCoverage`
- `locationConflicts`

### New rule families

- `local_entity_consistency`
- `map_visibility_opportunity`
- `competitor_pressure`
- `location_data_confidence`

## Cost and risk note

Unlike Search Console and Business Profile, `Google Maps / Places` should be treated as a paid platform integration.

Before activation in Phase 2:

- create separate billing monitoring
- add usage caps or alerts
- define exactly which requests are allowed
- avoid turning Places into an always-on background dependency

## Suggested implementation order for Phase 2

1. Stabilize real Search Console and Business Profile in Phase 1
2. Add location normalization model
3. Add `place_id` resolution workflow
4. Add geocoding and address consistency checks
5. Add nearby competitor discovery
6. Add multi-location comparison reports
7. Add scheduled sync and historical snapshots
8. Add packaged installer and app polish

## Phase 2 success criteria

- the platform can compare locations, not just audit them
- Maps / Places enriches local analysis without becoming the core dependency
- local SEO recommendations become more specific and location-aware
- the product can monitor changes over time, not just run one-off reports
