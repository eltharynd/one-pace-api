# One Pace metadata generator and public API

Built for [OnePacerr](https://github.com/eltharynd/OnePacerr).

Open for everyone.

## 🚀 Getting Started

Query the full set at

```console
(GET) https://onepacerr.com/api/v1/metadata
```

Or read the API docs for an updated list of endpoints:

[`https://onepacerr.com/api/v1/docs`](https://onepacerr.com/api/v1/docs)

Or just use the Github Raw url to get the whole data if that works for you

```console
https://raw.githubusercontent.com/eltharynd/one-pace-api/refs/heads/main/output/metadata.json
```

## 🪄 how it works

Scrapes a couple sources every 15 minutes to get the latest information on new releases and metadata:

- One Pace's RSS Feed
- One Pace's Episode Guide [Google Sheet](https://docs.google.com/spreadsheets/d/1HQRMJgu_zArp-sLnvFMDzOyjdsht87eFLECxMK858lA)
- One Pace's Episode Descriptions [Google Sheet](https://docs.google.com/spreadsheets/d/1M0Aa2p5x7NioaH9-u8FyHq6rH3t5s6Sccs8GoC6pHAM/)

In order to generate a single complete JSON with all the metadata you could desire:

- `https://raw.githubusercontent.com/eltharynd/one-pace-api/refs/heads/main/output/metadata.json`

In the near future I will deploy a public Rest API. In short, this means the following will be available to everyone:

- Query the API for the whole dataset
- Query the API to search for something specific (eg find episode by CRC32, find magnetURIs by arc/episode numbers)

and, in my mind most importantly:

### 📥 Connect via WebSocket to get notified in real time about

- New episode releases (and re-releases or alternate cuts)
- Metadata updates (eg added title for an episode that previously missed it, changed a description due to a typo)

## 📅 Roadmap

- [ ] I plan to deploy a public Rest API to query for specific things.

## 🤝 Credits & Acknowledgements

- **[One Pace](https://onepace.net/en):** The incredible team behind the unofficial fan edits.
- **@verywittyname** from One Pace's [Discord](https://discord.gg/onepace), for maintaining the Episode Dscriptions [Google Sheet](https://docs.google.com/spreadsheets/d/1M0Aa2p5x7NioaH9-u8FyHq6rH3t5s6Sccs8GoC6pHAM/).
- From an idea by [LadyIsatis](https://github.com/ladyisatis/one-pace-metadata): Thanks for everything 🙏 but it was time for an update.

## 💗 Support (One Pace, not me!)

If you want to support the project (costs are very low tbh, just a cheap cloud host and the domain) you can use the sponsor button directly on github, but I'd rather you find a way to support **[One Pace](https://onepace.net)**'s team directly instead.
