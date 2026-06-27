# One Pace Metadata API

![API Status](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fonepacerr.com%2Fapi%2Fv1%2Fhealthz&query=%24.name&label=API%20Status)
![Currently connected](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fonepacerr.com%2Fapi%2Fv1%2Fhealthz%2Fclients&query=%24.clients&label=Active%20sockets)

This service periodically scrapes various sources for information and metadata about [One Pace](https://onepace.net) releases, and makes them available to the public via Rest API and WebSocket for updates notifications.

Built for [OnePacerr](https://github.com/eltharynd/OnePacerr), Open for everyone.

*I'm not affiliated with One Pace's team.

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

## 📡 Live Updates

You can connect via **WebSocket** to get live updates whenever something changes.

This can be either a new episode is released or metadata is updated.

The easiest way is by installing `socket.io-client`:

```console
npm i -s socket.io-client
```

which you can use the following way:

```typescript
import { io } from 'socket.io-client'

const socket = io('https://onepacerr.com')

socket.on('connect', () => {
  console.log(`Connected with id: '${socket.id}'`)
  socket.emit('subscribe_to_updates')
})

socket.on('disconnect', () => {
  console.log(`Disconnected from server`)
})

socket.on('updates', data => {
  console.log('Update Received', data)
})
```

Alternatively you can use any other WebSocket Library or even do things manually.

## 🪄 Under the hood

Scrapes a couple sources every 15 minutes to get the latest information on new releases and metadata:

- One Pace's RSS Feed
- One Pace's Episode Guide [Google Sheet](https://docs.google.com/spreadsheets/d/1HQRMJgu_zArp-sLnvFMDzOyjdsht87eFLECxMK858lA)
- One Pace's Episode Descriptions [Google Sheet](https://docs.google.com/spreadsheets/d/1M0Aa2p5x7NioaH9-u8FyHq6rH3t5s6Sccs8GoC6pHAM/)

In order to generate a single complete JSON with all the metadata you could desire.

An copy of that JSON is kept up to date on this very repo:

- [https://raw.githubusercontent.com/eltharynd/one-pace-api/refs/heads/main/output/metadata.json](https://raw.githubusercontent.com/eltharynd/one-pace-api/refs/heads/main/output/metadata.json)

This is then used by a public Rest API to serve data.

You can find the full list of endpoints in the [Swagger API Docs](https://onepacerr.com/api/v1/docs).

## 🤝 Credits & Acknowledgements

- **[One Pace](https://onepace.net/en):** The incredible team behind the unofficial fan edits.
- **@verywittyname** from One Pace's [Discord](https://discord.gg/onepace), for maintaining the Episode Dscriptions [Google Sheet](https://docs.google.com/spreadsheets/d/1M0Aa2p5x7NioaH9-u8FyHq6rH3t5s6Sccs8GoC6pHAM/).
- From an idea by [LadyIsatis](https://github.com/ladyisatis/one-pace-metadata): Thanks for everything 🙏 but it was time for an update.

## 💗 Support (One Pace, not me!)

If you want to support the project (costs are very low tbh, just a cheap cloud host and the domain) you can use the sponsor button directly on github, but I'd rather you find a way to support **[One Pace](https://onepace.net)**'s team directly instead.
