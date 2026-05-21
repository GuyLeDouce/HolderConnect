import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isAddress } from 'ethers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const MAX_CONTRACTS = 5;

const CHAIN_CONFIG = {
  eth: { label: 'Ethereum Mainnet', network: 'eth-mainnet' },
  polygon: { label: 'Polygon Mainnet', network: 'polygon-mainnet' },
  arbitrum: { label: 'Arbitrum One', network: 'arb-mainnet' },
  optimism: { label: 'Optimism Mainnet', network: 'opt-mainnet' },
  base: { label: 'Base Mainnet', network: 'base-mainnet' }
};

app.use(
  helmet({
    contentSecurityPolicy: false
  })
);
app.use(morgan('tiny'));
app.use(express.json({ limit: '64kb' }));

function normalizeContracts(input) {
  if (!Array.isArray(input)) {
    const error = new Error('Contracts must be an array.');
    error.status = 400;
    throw error;
  }

  const contracts = input
    .map((item) => ({
      address: typeof item?.address === 'string' ? item.address.trim() : '',
      label: typeof item?.label === 'string' ? item.label.trim() : ''
    }))
    .filter((item) => item.address.length > 0);

  if (contracts.length === 0) {
    const error = new Error('Enter at least one NFT contract address.');
    error.status = 400;
    throw error;
  }

  if (contracts.length > MAX_CONTRACTS) {
    const error = new Error(`Enter no more than ${MAX_CONTRACTS} contract addresses.`);
    error.status = 400;
    throw error;
  }

  for (const contract of contracts) {
    if (!isAddress(contract.address)) {
      const error = new Error(`Invalid contract address: ${contract.address}`);
      error.status = 400;
      throw error;
    }
  }

  return contracts.map((contract, index) => ({
    address: contract.address.toLowerCase(),
    label: contract.label || `Collection ${index + 1}`
  }));
}

function getChain(chain) {
  const chainKey = typeof chain === 'string' ? chain : 'eth';
  if (!CHAIN_CONFIG[chainKey]) {
    const error = new Error('Unsupported chain selected.');
    error.status = 400;
    throw error;
  }

  return { key: chainKey, ...CHAIN_CONFIG[chainKey] };
}

function alchemyErrorMessage(status, body) {
  if (status === 429) {
    return 'Alchemy rate limit reached. Wait a moment and try again.';
  }

  if (body?.message) {
    return body.message;
  }

  if (body?.error?.message) {
    return body.error.message;
  }

  return `Alchemy request failed with status ${status}.`;
}

async function fetchContractOwners({ apiKey, network, address }) {
  const owners = new Set();
  let pageKey;
  let pageCount = 0;

  do {
    const url = new URL(`https://${network}.g.alchemy.com/nft/v3/${apiKey}/getOwnersForContract`);
    url.searchParams.set('contractAddress', address);
    url.searchParams.set('withTokenBalances', 'false');
    if (pageKey) {
      url.searchParams.set('pageKey', pageKey);
    }

    const response = await fetch(url);
    const contentType = response.headers.get('content-type') || '';
    const body = contentType.includes('application/json') ? await response.json() : await response.text();

    if (!response.ok) {
      const error = new Error(alchemyErrorMessage(response.status, body));
      error.status = response.status === 429 ? 429 : 502;
      throw error;
    }

    if (!Array.isArray(body.owners)) {
      const error = new Error('Alchemy returned an unexpected owners response.');
      error.status = 502;
      throw error;
    }

    for (const owner of body.owners) {
      if (typeof owner === 'string' && isAddress(owner)) {
        owners.add(owner.toLowerCase());
      }
    }

    pageKey = body.pageKey;
    pageCount += 1;
  } while (pageKey);

  return {
    owners,
    pageCount
  };
}

function intersectOwnerSets(ownerSets) {
  if (ownerSets.length === 0) {
    return [];
  }

  const [smallestSet] = [...ownerSets].sort((a, b) => a.size - b.size);
  return [...smallestSet].filter((wallet) => ownerSets.every((set) => set.has(wallet))).sort();
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/chains', (_req, res) => {
  res.json({
    defaultChain: 'eth',
    chains: Object.entries(CHAIN_CONFIG).map(([key, value]) => ({
      key,
      label: value.label
    }))
  });
});

app.post('/api/check-holders', async (req, res, next) => {
  try {
    const apiKey = process.env.ALCHEMY_API_KEY;
    if (!apiKey) {
      const error = new Error('Missing ALCHEMY_API_KEY environment variable.');
      error.status = 500;
      throw error;
    }

    const chain = getChain(req.body?.chain);
    const contracts = normalizeContracts(req.body?.contracts);

    const contractResults = [];
    const ownerSets = [];

    for (const contract of contracts) {
      const result = await fetchContractOwners({
        apiKey,
        network: chain.network,
        address: contract.address
      });

      contractResults.push({
        address: contract.address,
        label: contract.label,
        holderCount: result.owners.size,
        pagesFetched: result.pageCount
      });
      ownerSets.push(result.owners);
    }

    const sharedWallets = intersectOwnerSets(ownerSets);

    res.json({
      chain: {
        key: chain.key,
        label: chain.label
      },
      contracts: contractResults,
      sharedHolderCount: sharedWallets.length,
      wallets: sharedWallets,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));
app.get('*', (_req, res, next) => {
  res.sendFile(path.join(distPath, 'index.html'), (error) => {
    if (error) {
      next();
    }
  });
});

app.use((error, _req, res, _next) => {
  const status = Number.isInteger(error.status) ? error.status : 500;
  res.status(status).json({
    error: error.message || 'Unexpected server error.'
  });
});

app.listen(PORT, () => {
  console.log(`HolderConnect listening on port ${PORT}`);
});
