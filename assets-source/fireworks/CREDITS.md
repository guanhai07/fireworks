# Firework recordings

- Pack: **25 CC0 bang / firework SFX**
- Author: **rubberduck**
- Original source: https://opengameart.org/node/92774
- Download: https://opengameart.org/sites/default/files/25-CC0-bang-sfx.zip
- License: **CC0 1.0 Universal**, https://creativecommons.org/publicdomain/zero/1.0/
- Retrieved: 2026-09-25

The author describes these as recordings of fireworks, with some processed variants elsewhere in the pack. The simulator uses only `fw_01.ogg` through `fw_06.ogg`; the `bang`, `cannon`, `shot`, and loop variants are not used.

These six files are embedded byte-for-byte into `dist/audio-assets.js` by `node scripts/embed-audio.cjs`. Playback trims leading silence, applies level adjustment, pans by screen position, and fades the last 120 ms. Small daughter sparks use a quieter section of the recording's tail. No synthetic pitched explosion, regularly spaced fake crackles, or artificial echo taps are added.

The zip is retained for reproducibility. Its entry CRCs were validated before extraction. The generated JavaScript includes SHA-256 hashes for each selected original Ogg file. This attribution is voluntary under CC0.
