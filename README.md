# KAIVO

**One stable balance for every agent call.**

[![Live site](https://img.shields.io/badge/live-kaivo.cc-296040)](https://kaivo.cc)
![Chain](https://img.shields.io/badge/chain-Robinhood%20Chain-14130F)

## Overview

KAIVO keeps a single stable balance, kCASH, matched one-to-one with USDG, and lets agents spend it across hundreds of models. This repository holds the public site: a static page with a live Robinhood Chain market board.

| Field | Value |
| --- | --- |
| Chain | Robinhood Chain (chain ID `0x1237`) |
| Contract address | pending |

## Features

- Live market board: the ten busiest pools by 24h volume, refreshed every minute while the tab is visible
- Contract address slot pinned to the top of the page, with click-to-copy once an address is stated
- A record register: every external fact is stated, absent or unconfirmed, and unconfirmed records render inert
- Responsive layout checked from 360 px to 1440 px, with a reduced-motion fallback for every animation

## Links

- Site: <https://kaivo.cc>
- X: pending
- GitHub: pending

## Build

```bash
npm run build   # writes dist/
npm run gates   # builds both register branches and checks them
```

`dist/` is the deploy folder. The register lives in `register.json`; colour tokens live in `src/tokens.css`.

## License

MIT, see [LICENSE](LICENSE).
