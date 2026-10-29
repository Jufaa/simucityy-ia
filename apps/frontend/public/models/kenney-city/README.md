# Local Kenney city models

Six original models from Kenney's City Kit Suburban 2.0 and City Kit Commercial 2.1, distributed under CC0. No account, paid service or runtime external asset host is required.

- Sources: https://kenney.nl/assets/city-kit-suburban and https://kenney.nl/assets/city-kit-commercial
- Original licenses: `suburban/License.txt`, `commercial/License.txt`.
- `manifest.json` records original archive paths, original ZIP SHA-256, file sizes and file SHA-256. Files are unmodified. Temporary signed download links are deliberately not retained.
- Each GLB references only its pack-local `Textures/colormap.png`. Keep that relative path when moving models.
- The renderer normalizes the entire model to the building footprint and declared height, including roofs, and batches repeated mesh parts. This is presentation only: hazard AABBs and saved scenarios are unchanged.
