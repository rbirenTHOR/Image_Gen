# Real-photo backdrop library

The setting step defaults to Photo library. Users can choose one of 30 sourced photographs, filter by environment or visible ground space, search by place or photographer, or switch to Generate a setting. Saved and generated landscapes remain available from the collection selector. Source photos can be saved to campaigns and used as creative-chat references.

## Assets and provenance

All 30 originals have published source dimensions of at least 7,680 × 4,320 pixels. They are public-domain or CC0 photographs; original source and licensing evidence are retained in data/nature-source-evidence.json. The catalog identifies 25 photographs with visible ground space and five scenic references requiring a new foreground. These labels describe composition suitability, not permission to drive or camp at a location.

The application bundles lightweight previews and imports the full original into its object storage on first inspection or use. Reference pickers and campaign thumbnails do not fetch originals. Failed transfers display a retry path; generation never substitutes the thumbnail. Source-host rate limiting can delay the first import. AI compositions still render at the configured model output size, up to 4K, and are not guaranteed to preserve every original pixel.

## Validation

Catalog checks verified 30 unique fixed source URLs, source dimensions, licenses, and bundled previews. Visual contact sheets were reviewed. A real 32.4 MB source image was loaded through the local app and its rendered natural dimensions verified as 8,064 × 6,048.

Six added browser cases cover desktop light/dark and mobile layouts: filtering, search recovery, provenance links, failed-original retry, cached reuse, selecting a backdrop, composition, saving several takes, campaign persistence, and attaching the source to creative chat. Automated provider calls use isolated fixtures and do not assess real generation quality. The broader journey suite includes generation, people/objects, chat, approval, export, interrupted requests, accessibility, and responsive navigation.
