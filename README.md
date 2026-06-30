# HolderConnect

HolderConnect is a Node.js webapp for finding wallets that hold NFTs from the collections you enter and for listing wallets that received NFTs from a contract after a selected time. It supports 1 to 20 NFT contract addresses, optional collection labels, per-collection chain selection, common, uncommon, or all holder matching, optional listing floor filters, Alchemy NFT API pagination, CSV export, and clipboard copy.

## Stack

- Node.js and Express backend
- React and Vite frontend
- Alchemy NFT API holder lookup
- Alchemy NFT acquisition lookup through transfer events
- ethers.js contract address validation
- Railway-ready production server

## Local Install

```bash
npm install
```

Create a local environment file:

```bash
cp .env.example .env
```

Set your Alchemy key in `.env`:

```bash
ALCHEMY_API_KEY=your_alchemy_api_key
OPENSEA_API_KEY=your_opensea_api_key
PORT=3000
```

`OPENSEA_API_KEY` is only required when you use the optional minimum listing ETH filter.

PowerShell users can set variables for the current terminal instead:

```powershell
$env:ALCHEMY_API_KEY="your_alchemy_api_key"
$env:OPENSEA_API_KEY="your_opensea_api_key"
$env:PORT="3000"
```

## Run Locally

Start the API and Vite dev server:

```bash
npm run dev
```

Open the Vite URL shown in the terminal, usually:

```text
http://localhost:5173
```

Build and run the production server locally:

```bash
npm run build
npm start
```

Then open:

```text
http://localhost:3000
```

## Railway Deployment

1. Push this repository to GitHub.
2. Create a new Railway project from the GitHub repository.
3. Add the environment variable `ALCHEMY_API_KEY` in Railway.
4. Railway provides `PORT` automatically. Do not hardcode it.
5. Use the default build and start flow:
   - Build command: `npm run build`
   - Start command: `npm start`
6. Open Railway project settings and enable Public Networking.
7. Use the generated Railway Public Networking Domain to access HolderConnect.

The server binds to `process.env.PORT`, which is required for Railway.

## How It Works

### Holder Matching

1. The frontend sends each entered contract, label, and chain to `/api/check-holders`.
2. The backend validates each contract with `ethers.isAddress`.
3. Holder data is fetched from Alchemy's `getOwnersForContract` NFT API endpoint.
4. Pagination continues until Alchemy stops returning a `pageKey`.
5. Owner addresses are normalized to lowercase and deduplicated per contract.
6. If a minimum listing ETH value is entered for a contract, OpenSea listings below that value are used to remove owners with under-floor listed tokens from that contract's eligible holder set. Owners with no listings, or only listings at or above the value, remain eligible.
7. In common mode, wallets are intersected across every eligible contract holder set.
8. In uncommon mode, the app returns each wallet once when it appears in at least two eligible holder sets but not every eligible holder set.
9. In all mode, the app returns every eligible holder from every selected contract. Wallets are deduplicated within each contract by Alchemy owner data, but the same wallet appears again when it holds multiple selected contracts.

### Acquisitions

1. Select Acquisitions in the app.
2. Enter one NFT contract address, chain, and start time.
3. The frontend sends the lookup to `/api/contract-purchases`.
4. The backend converts the start time to a chain block by searching block timestamps through Alchemy JSON-RPC.
5. NFT transfer data is fetched with Alchemy's `alchemy_getAssetTransfers` method for ERC-721 and ERC-1155 activity from that block through the latest block.
6. The result includes one receiving wallet row per NFT transfer. If the same wallet received multiple NFTs, it appears multiple times.
7. CSV export includes wallet, sender, token id, quantity, block number, transaction hash, and transfer type fields.

This lookup is transfer-event based so it works without Alchemy's rejected NFT sales endpoint. It captures acquisitions from the contract, including marketplace purchases, mints, and direct transfers. It does not prove that every row was a paid sale.

## Chain Support

Each contract row has its own chain selector, so a check can compare collections across Ethereum mainnet and L2 networks in the same run.

Built-in options include Ethereum, Polygon, Arbitrum, Optimism, Base, Blast, Linea, Scroll, Unichain, World Chain, and ZKsync Era. The custom option accepts an Alchemy network id such as `zora-mainnet`; it will work when that network supports Alchemy's NFT API.

## Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `ALCHEMY_API_KEY` | Yes | Alchemy API key used for NFT holder requests. |
| `OPENSEA_API_KEY` | Only for listing filters | OpenSea API key used to check active listings below a per-contract ETH threshold. |
| `PORT` | No locally, yes on Railway | Port for the Express server. Railway sets this automatically. |

## Error Handling

HolderConnect returns clear errors for invalid contract addresses, missing API configuration, unsupported chains, failed Alchemy API calls, empty results, unexpected API responses, and rate limits.
