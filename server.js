import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatUnits, isAddress } from 'ethers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const MAX_CONTRACTS = 20;

const CHAIN_CONFIG = {
  eth: { label: 'Ethereum Mainnet', network: 'eth-mainnet' },
  polygon: { label: 'Polygon Mainnet', network: 'polygon-mainnet' },
  arbitrum: { label: 'Arbitrum One', network: 'arb-mainnet' },
  optimism: { label: 'Optimism Mainnet', network: 'opt-mainnet' },
  base: { label: 'Base Mainnet', network: 'base-mainnet' },
  blast: { label: 'Blast Mainnet', network: 'blast-mainnet' },
  linea: { label: 'Linea Mainnet', network: 'linea-mainnet' },
  scroll: { label: 'Scroll Mainnet', network: 'scroll-mainnet' },
  unichain: { label: 'Unichain Mainnet', network: 'unichain-mainnet' },
  worldchain: { label: 'World Chain Mainnet', network: 'worldchain-mainnet' },
  zksync: { label: 'ZKsync Era Mainnet', network: 'zksync-mainnet' }
};

const CUSTOM_CHAIN_KEY = 'custom';
const ALCHEMY_NETWORK_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MATCH_MODES = new Set(['common', 'uncommon', 'all']);
const NFT_SALE_PAGE_SIZE = 1000;
const OPENSEA_CHAIN_BY_ALCHEMY_KEY = {
  eth: 'ethereum',
  polygon: 'polygon',
  arbitrum: 'arbitrum',
  optimism: 'optimism',
  base: 'base',
  blast: 'blast',
  unichain: 'unichain'
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
      label: typeof item?.label === 'string' ? item.label.trim() : '',
      chain: typeof item?.chain === 'string' ? item.chain.trim() : 'eth',
      customNetwork:
        typeof item?.customNetwork === 'string' ? item.customNetwork.trim().toLowerCase() : '',
      minListingPriceEth: normalizeMinListingPriceEth(item?.minListingPriceEth)
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
    label: contract.label || `Collection ${index + 1}`,
    chain: getChain(contract.chain, contract.customNetwork),
    minListingPriceEth: contract.minListingPriceEth
  }));
}

function normalizeMinListingPriceEth(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    const error = new Error('Minimum listing price must be a positive ETH value.');
    error.status = 400;
    throw error;
  }

  return parsed;
}

function normalizeMatchMode(input) {
  const mode = typeof input === 'string' ? input : 'common';
  if (!MATCH_MODES.has(mode)) {
    const error = new Error('Unsupported holder match mode.');
    error.status = 400;
    throw error;
  }

  return mode;
}

function normalizePurchaseLookup(input) {
  const address = typeof input?.address === 'string' ? input.address.trim() : '';
  const chain = typeof input?.chain === 'string' ? input.chain.trim() : 'eth';
  const customNetwork =
    typeof input?.customNetwork === 'string' ? input.customNetwork.trim().toLowerCase() : '';
  const startTimeInput = typeof input?.startTime === 'string' ? input.startTime.trim() : '';

  if (!address) {
    const error = new Error('Enter an NFT contract address.');
    error.status = 400;
    throw error;
  }

  if (!isAddress(address)) {
    const error = new Error(`Invalid contract address: ${address}`);
    error.status = 400;
    throw error;
  }

  if (!startTimeInput) {
    const error = new Error('Enter a start time.');
    error.status = 400;
    throw error;
  }

  const startDate = new Date(startTimeInput);
  if (Number.isNaN(startDate.getTime())) {
    const error = new Error('Start time must be a valid date and time.');
    error.status = 400;
    throw error;
  }

  if (startDate.getTime() > Date.now()) {
    const error = new Error('Start time cannot be in the future.');
    error.status = 400;
    throw error;
  }

  return {
    address: address.toLowerCase(),
    chain: getChain(chain, customNetwork),
    startTime: startDate
  };
}

function getChain(chain, customNetwork = '') {
  const chainKey = typeof chain === 'string' ? chain : 'eth';

  if (chainKey === CUSTOM_CHAIN_KEY) {
    if (!ALCHEMY_NETWORK_PATTERN.test(customNetwork)) {
      const error = new Error(
        'Custom Alchemy network must use a hostname-safe network id, for example zora-mainnet.'
      );
      error.status = 400;
      throw error;
    }

    return {
      key: CUSTOM_CHAIN_KEY,
      label: customNetwork,
      network: customNetwork,
      isCustom: true
    };
  }

  if (!CHAIN_CONFIG[chainKey]) {
    const error = new Error('Unsupported chain selected.');
    error.status = 400;
    throw error;
  }

  return { key: chainKey, ...CHAIN_CONFIG[chainKey] };
}

async function alchemyJsonRpc({ apiKey, network, method, params }) {
  const response = await fetch(`https://${network}.g.alchemy.com/v2/${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params
    })
  });
  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json') ? await response.json() : await response.text();

  if (!response.ok || body?.error) {
    const error = new Error(alchemyErrorMessage(response.status, body));
    error.status = response.status === 429 ? 429 : 502;
    throw error;
  }

  return body.result;
}

function parseBlockNumber(blockNumber) {
  if (typeof blockNumber === 'number' && Number.isInteger(blockNumber)) {
    return blockNumber;
  }

  if (typeof blockNumber === 'string') {
    return Number.parseInt(blockNumber, blockNumber.startsWith('0x') ? 16 : 10);
  }

  return Number.NaN;
}

function numberToHex(value) {
  return `0x${value.toString(16)}`;
}

function parseBlockTimestamp(block) {
  const timestamp = block?.timestamp;
  if (typeof timestamp === 'number' && Number.isInteger(timestamp)) {
    return timestamp;
  }

  if (typeof timestamp === 'string') {
    return Number.parseInt(timestamp, timestamp.startsWith('0x') ? 16 : 10);
  }

  return Number.NaN;
}

async function fetchBlockByNumber({ apiKey, network, blockNumber }) {
  return alchemyJsonRpc({
    apiKey,
    network,
    method: 'eth_getBlockByNumber',
    params: [numberToHex(blockNumber), false]
  });
}

async function fetchBlockNumberByTimestamp({ apiKey, network, timestampSeconds }) {
  const latestBlockHex = await alchemyJsonRpc({
    apiKey,
    network,
    method: 'eth_blockNumber',
    params: []
  });
  const latestBlockNumber = parseBlockNumber(latestBlockHex);

  if (!Number.isInteger(latestBlockNumber) || latestBlockNumber < 0) {
    const error = new Error('Alchemy returned an unexpected latest block response.');
    error.status = 502;
    throw error;
  }

  const latestBlock = await fetchBlockByNumber({ apiKey, network, blockNumber: latestBlockNumber });
  const latestTimestamp = parseBlockTimestamp(latestBlock);
  if (!Number.isInteger(latestTimestamp)) {
    const error = new Error('Alchemy returned an unexpected block response.');
    error.status = 502;
    throw error;
  }

  if (timestampSeconds >= latestTimestamp) {
    return latestBlockNumber;
  }

  let low = 0;
  let high = latestBlockNumber;
  let matchingBlock = latestBlockNumber;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const block = await fetchBlockByNumber({ apiKey, network, blockNumber: mid });
    const blockTimestamp = parseBlockTimestamp(block);

    if (!Number.isInteger(blockTimestamp)) {
      const error = new Error('Alchemy returned an unexpected block response.');
      error.status = 502;
      throw error;
    }

    if (blockTimestamp >= timestampSeconds) {
      matchingBlock = mid;
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  return matchingBlock;
}

async function fetchContractPurchases({ apiKey, network, address, fromBlock }) {
  const purchases = [];
  let pageKey;
  let pageCount = 0;

  do {
    const url = new URL(`https://${network}.g.alchemy.com/nft/v3/${apiKey}/getNFTSales`);
    url.searchParams.set('contractAddress', address);
    url.searchParams.set('fromBlock', String(fromBlock));
    url.searchParams.set('toBlock', 'latest');
    url.searchParams.set('order', 'asc');
    url.searchParams.set('limit', String(NFT_SALE_PAGE_SIZE));
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

    const sales = Array.isArray(body?.nftSales)
      ? body.nftSales
      : Array.isArray(body?.sales)
        ? body.sales
        : [];

    for (const sale of sales) {
      const buyerAddress = sale?.buyerAddress || sale?.buyer || sale?.taker;
      if (!isAddress(buyerAddress)) {
        continue;
      }

      purchases.push({
        wallet: buyerAddress.toLowerCase(),
        tokenId: normalizeTokenId(sale?.tokenId ?? sale?.token?.tokenId ?? sale?.nft?.tokenId),
        quantity: String(sale?.quantity ?? sale?.amount ?? '1'),
        blockNumber: parseBlockNumber(sale?.blockNumber),
        transactionHash: typeof sale?.transactionHash === 'string' ? sale.transactionHash : '',
        marketplace: typeof sale?.marketplace === 'string' ? sale.marketplace : ''
      });
    }

    pageKey = body?.pageKey;
    pageCount += 1;
  } while (pageKey);

  return {
    purchases,
    pageCount
  };
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

async function fetchContractOwners({ apiKey, network, address, includeTokenBalances = false }) {
  const owners = new Set();
  const ownerTokens = new Map();
  let pageKey;
  let pageCount = 0;

  do {
    const url = new URL(`https://${network}.g.alchemy.com/nft/v3/${apiKey}/getOwnersForContract`);
    url.searchParams.set('contractAddress', address);
    url.searchParams.set('withTokenBalances', includeTokenBalances ? 'true' : 'false');
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
        continue;
      }

      const ownerAddress =
        typeof owner?.ownerAddress === 'string'
          ? owner.ownerAddress
          : typeof owner?.owner === 'string'
            ? owner.owner
            : '';

      if (!isAddress(ownerAddress)) {
        continue;
      }

      const normalizedOwner = ownerAddress.toLowerCase();
      owners.add(normalizedOwner);

      if (includeTokenBalances && Array.isArray(owner.tokenBalances)) {
        const tokens = ownerTokens.get(normalizedOwner) || new Set();
        for (const tokenBalance of owner.tokenBalances) {
          const tokenId = normalizeTokenId(tokenBalance?.tokenId);
          if (tokenId && isPositiveTokenBalance(tokenBalance?.balance)) {
            tokens.add(tokenId);
          }
        }
        ownerTokens.set(normalizedOwner, tokens);
      }
    }

    pageKey = body.pageKey;
    pageCount += 1;
  } while (pageKey);

  return {
    owners,
    ownerTokens,
    pageCount
  };
}

function normalizeTokenId(tokenId) {
  if (typeof tokenId !== 'string' && typeof tokenId !== 'number' && typeof tokenId !== 'bigint') {
    return '';
  }

  try {
    return BigInt(tokenId).toString();
  } catch (_error) {
    return String(tokenId);
  }
}

function isPositiveTokenBalance(balance) {
  if (balance === undefined || balance === null) {
    return true;
  }

  try {
    return BigInt(balance) > 0n;
  } catch (_error) {
    return Number(balance) > 0;
  }
}

function intersectOwnerSets(ownerSets) {
  if (ownerSets.length === 0) {
    return [];
  }

  const [smallestSet] = [...ownerSets].sort((a, b) => a.size - b.size);
  return [...smallestSet].filter((wallet) => ownerSets.every((set) => set.has(wallet))).sort();
}

function getMatchingWallets(ownerSets, mode) {
  if (mode === 'all') {
    return allOwnerSets(ownerSets);
  }

  if (mode === 'uncommon') {
    return uncommonOwnerSets(ownerSets);
  }

  return intersectOwnerSets(ownerSets);
}

function allOwnerSets(ownerSets) {
  return ownerSets.flatMap((ownerSet) => [...ownerSet].sort());
}

function uncommonOwnerSets(ownerSets) {
  if (ownerSets.length <= 1) {
    return [];
  }

  const walletContractCounts = new Map();
  for (const ownerSet of ownerSets) {
    for (const wallet of ownerSet) {
      walletContractCounts.set(wallet, (walletContractCounts.get(wallet) || 0) + 1);
    }
  }

  return [...walletContractCounts.entries()]
    .filter(([, contractCount]) => contractCount > 1 && contractCount < ownerSets.length)
    .map(([wallet]) => wallet)
    .sort();
}

function getOpenSeaChain(contract) {
  if (contract.chain.isCustom || !OPENSEA_CHAIN_BY_ALCHEMY_KEY[contract.chain.key]) {
    const error = new Error(
      `${contract.label} uses a chain that is not supported by the listing price filter.`
    );
    error.status = 400;
    throw error;
  }

  return OPENSEA_CHAIN_BY_ALCHEMY_KEY[contract.chain.key];
}

async function filterOwnersByListingFloor({ contract, owners, ownerTokens, openSeaApiKey }) {
  if (contract.minListingPriceEth === null) {
    return {
      owners,
      filteredOutCount: 0,
      underFloorListingCount: 0
    };
  }

  if (!openSeaApiKey) {
    const error = new Error(
      'Missing OPENSEA_API_KEY environment variable. It is required for listing price filters.'
    );
    error.status = 500;
    throw error;
  }

  const underFloorTokenIds = await fetchUnderFloorListings({
    apiKey: openSeaApiKey,
    chain: getOpenSeaChain(contract),
    address: contract.address,
    minListingPriceEth: contract.minListingPriceEth
  });

  if (underFloorTokenIds.size === 0) {
    return {
      owners,
      filteredOutCount: 0,
      underFloorListingCount: 0
    };
  }

  const eligibleOwners = new Set();
  let filteredOutCount = 0;

  for (const owner of owners) {
    const tokens = ownerTokens.get(owner) || new Set();
    const hasUnderFloorListing = [...tokens].some((tokenId) => underFloorTokenIds.has(tokenId));
    if (hasUnderFloorListing) {
      filteredOutCount += 1;
    } else {
      eligibleOwners.add(owner);
    }
  }

  return {
    owners: eligibleOwners,
    filteredOutCount,
    underFloorListingCount: underFloorTokenIds.size
  };
}

async function fetchUnderFloorListings({ apiKey, chain, address, minListingPriceEth }) {
  const tokenIds = new Set();
  let cursor;
  let shouldContinue = true;

  while (shouldContinue) {
    const url = new URL(`https://api.opensea.io/api/v2/orders/${chain}/seaport/listings`);
    url.searchParams.set('asset_contract_address', address);
    url.searchParams.set('order_by', 'price');
    url.searchParams.set('order_direction', 'asc');
    url.searchParams.set('limit', '200');
    if (cursor) {
      url.searchParams.set('cursor', cursor);
    }

    const response = await fetch(url, {
      headers: {
        accept: 'application/json',
        'x-api-key': apiKey
      }
    });
    const contentType = response.headers.get('content-type') || '';
    const body = contentType.includes('application/json') ? await response.json() : await response.text();

    if (!response.ok) {
      const error = new Error(openSeaErrorMessage(response.status, body));
      error.status = response.status === 429 ? 429 : 502;
      throw error;
    }

    const orders = Array.isArray(body?.orders)
      ? body.orders
      : Array.isArray(body?.listings)
        ? body.listings
        : [];

    if (orders.length === 0) {
      break;
    }

    for (const order of orders) {
      const priceEth = extractEthPrice(order);
      if (priceEth === null) {
        continue;
      }

      if (priceEth >= minListingPriceEth) {
        shouldContinue = false;
        break;
      }

      const tokenId = extractListingTokenId(order);
      if (tokenId) {
        tokenIds.add(tokenId);
      }
    }

    cursor = body?.next || body?.next_cursor || body?.cursor?.next;
    if (!cursor) {
      break;
    }
  }

  return tokenIds;
}

function openSeaErrorMessage(status, body) {
  if (status === 429) {
    return 'OpenSea rate limit reached while checking listings. Wait a moment and try again.';
  }

  if (body?.errors?.length) {
    return body.errors.join(' ');
  }

  if (body?.detail) {
    return body.detail;
  }

  if (body?.message) {
    return body.message;
  }

  return `OpenSea listing request failed with status ${status}.`;
}

function extractEthPrice(order) {
  const token = order?.payment_token_contract || order?.price?.current?.currency || {};
  const symbol = typeof token?.symbol === 'string' ? token.symbol.toUpperCase() : '';
  if (symbol && !['ETH', 'WETH'].includes(symbol)) {
    return null;
  }

  const rawValue =
    order?.current_price ??
    order?.price?.current?.value ??
    order?.price?.value ??
    order?.protocol_data?.parameters?.consideration?.[0]?.startAmount;

  if (rawValue === undefined || rawValue === null) {
    return null;
  }

  const value = String(rawValue);
  if (value.includes('.')) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  const decimals = Number(token?.decimals ?? order?.price?.current?.decimals ?? 18);
  try {
    return Number(formatUnits(BigInt(value), Number.isFinite(decimals) ? decimals : 18));
  } catch (_error) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
}

function extractListingTokenId(order) {
  const candidates = [
    order?.maker_asset_bundle?.assets?.[0]?.token_id,
    order?.asset?.token_id,
    order?.nft?.identifier,
    order?.protocol_data?.parameters?.offer?.[0]?.identifierOrCriteria
  ];

  for (const candidate of candidates) {
    const tokenId = normalizeTokenId(candidate);
    if (tokenId) {
      return tokenId;
    }
  }

  return '';
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

    const contracts = normalizeContracts(req.body?.contracts);
    const matchMode = normalizeMatchMode(req.body?.matchMode);
    const openSeaApiKey = process.env.OPENSEA_API_KEY;

    const contractResults = [];
    const ownerSets = [];

    for (const contract of contracts) {
      const result = await fetchContractOwners({
        apiKey,
        network: contract.chain.network,
        address: contract.address,
        includeTokenBalances: contract.minListingPriceEth !== null
      });

      const filteredResult = await filterOwnersByListingFloor({
        contract,
        owners: result.owners,
        ownerTokens: result.ownerTokens,
        openSeaApiKey
      });

      contractResults.push({
        address: contract.address,
        label: contract.label,
        chain: {
          key: contract.chain.key,
          label: contract.chain.label,
          network: contract.chain.network,
          isCustom: contract.chain.isCustom || false
        },
        holderCount: result.owners.size,
        eligibleHolderCount: filteredResult.owners.size,
        filteredOutListingCount: filteredResult.filteredOutCount,
        underFloorListingCount: filteredResult.underFloorListingCount,
        minListingPriceEth: contract.minListingPriceEth,
        pagesFetched: result.pageCount
      });
      ownerSets.push(filteredResult.owners);
    }

    const matchedWallets = getMatchingWallets(ownerSets, matchMode);

    res.json({
      contracts: contractResults,
      resultMode: matchMode,
      sharedHolderCount: matchedWallets.length,
      matchHolderCount: matchedWallets.length,
      wallets: matchedWallets,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/contract-purchases', async (req, res, next) => {
  try {
    const apiKey = process.env.ALCHEMY_API_KEY;
    if (!apiKey) {
      const error = new Error('Missing ALCHEMY_API_KEY environment variable.');
      error.status = 500;
      throw error;
    }

    const lookup = normalizePurchaseLookup(req.body);
    const timestampSeconds = Math.floor(lookup.startTime.getTime() / 1000);
    const fromBlock = await fetchBlockNumberByTimestamp({
      apiKey,
      network: lookup.chain.network,
      timestampSeconds
    });
    const result = await fetchContractPurchases({
      apiKey,
      network: lookup.chain.network,
      address: lookup.address,
      fromBlock
    });

    res.json({
      contract: {
        address: lookup.address,
        chain: {
          key: lookup.chain.key,
          label: lookup.chain.label,
          network: lookup.chain.network,
          isCustom: lookup.chain.isCustom || false
        }
      },
      startTime: lookup.startTime.toISOString(),
      fromBlock,
      purchaseCount: result.purchases.length,
      pagesFetched: result.pageCount,
      wallets: result.purchases.map((purchase) => purchase.wallet),
      purchases: result.purchases,
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
