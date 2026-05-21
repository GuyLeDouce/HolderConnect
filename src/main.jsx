import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const MAX_CONTRACTS = 5;
const CHAINS = [
  { key: 'eth', label: 'Ethereum Mainnet' },
  { key: 'polygon', label: 'Polygon Mainnet' },
  { key: 'arbitrum', label: 'Arbitrum One' },
  { key: 'optimism', label: 'Optimism Mainnet' },
  { key: 'base', label: 'Base Mainnet' },
  { key: 'blast', label: 'Blast Mainnet' },
  { key: 'linea', label: 'Linea Mainnet' },
  { key: 'scroll', label: 'Scroll Mainnet' },
  { key: 'unichain', label: 'Unichain Mainnet' },
  { key: 'worldchain', label: 'World Chain Mainnet' },
  { key: 'zksync', label: 'ZKsync Era Mainnet' },
  { key: 'custom', label: 'Custom Alchemy network' }
];

function emptyContract() {
  return { address: '', label: '', chain: 'eth', customNetwork: '' };
}

function toCsv(wallets) {
  return ['wallet', ...wallets].join('\n');
}

function downloadCsv(wallets) {
  const blob = new Blob([toCsv(wallets)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'holderconnect-shared-wallets.csv';
  anchor.click();
  URL.revokeObjectURL(url);
}

function App() {
  const [contracts, setContracts] = useState([emptyContract()]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');

  const activeContracts = useMemo(
    () => contracts.filter((contract) => contract.address.trim().length > 0),
    [contracts]
  );

  const canSubmit = activeContracts.length > 0 && !isLoading;

  function updateContract(index, field, value) {
    setContracts((current) =>
      current.map((contract, contractIndex) =>
        contractIndex === index ? { ...contract, [field]: value } : contract
      )
    );
  }

  function addContract() {
    setContracts((current) =>
      current.length < MAX_CONTRACTS ? [...current, emptyContract()] : current
    );
  }

  function removeContract(index) {
    setContracts((current) => {
      const next = current.filter((_, contractIndex) => contractIndex !== index);
      return next.length > 0 ? next : [emptyContract()];
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setIsLoading(true);
    setError('');
    setCopyStatus('');
    setResult(null);

    try {
      const response = await fetch('/api/check-holders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contracts: activeContracts
        })
      });

      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || 'Holder check failed.');
      }

      setResult(body);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function copyWallets() {
    if (!result?.wallets?.length) {
      return;
    }

    await navigator.clipboard.writeText(result.wallets.join('\n'));
    setCopyStatus('Copied');
    window.setTimeout(() => setCopyStatus(''), 1800);
  }

  return (
    <main className="app-shell">
      <section className="intro">
        <div>
          <p className="eyebrow">NFT holder intersection</p>
          <h1>HolderConnect</h1>
          <p>Find wallets holding across multiple NFT collections.</p>
        </div>
        <div className="status-panel">
          <span>Max contracts</span>
          <strong>5</strong>
        </div>
      </section>

      <section className="workspace">
        <form className="checker-form" onSubmit={handleSubmit}>
          <div className="form-header">
            <div>
              <h2>Collections</h2>
              <p>Enter contract addresses, labels, and the chain for each collection.</p>
            </div>
          </div>

          <div className="contract-list">
            {contracts.map((contract, index) => (
              <div className="contract-row" key={index}>
                <div className="field address-field">
                  <label htmlFor={`address-${index}`}>Contract address</label>
                  <input
                    id={`address-${index}`}
                    value={contract.address}
                    onChange={(event) => updateContract(index, 'address', event.target.value)}
                    placeholder="0x..."
                    spellCheck="false"
                  />
                </div>
                <div className="field label-field">
                  <label htmlFor={`label-${index}`}>Label</label>
                  <input
                    id={`label-${index}`}
                    value={contract.label}
                    onChange={(event) => updateContract(index, 'label', event.target.value)}
                    placeholder={`Collection ${index + 1}`}
                  />
                </div>
                <div className="field chain-field">
                  <label htmlFor={`chain-${index}`}>Chain</label>
                  <select
                    id={`chain-${index}`}
                    value={contract.chain}
                    onChange={(event) => updateContract(index, 'chain', event.target.value)}
                  >
                    {CHAINS.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                {contract.chain === 'custom' && (
                  <div className="field custom-network-field">
                    <label htmlFor={`custom-network-${index}`}>Alchemy network id</label>
                    <input
                      id={`custom-network-${index}`}
                      value={contract.customNetwork}
                      onChange={(event) =>
                        updateContract(index, 'customNetwork', event.target.value)
                      }
                      placeholder="zora-mainnet"
                      spellCheck="false"
                    />
                  </div>
                )}
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Remove contract"
                  title="Remove contract"
                  onClick={() => removeContract(index)}
                  disabled={contracts.length === 1}
                >
                  -
                </button>
              </div>
            ))}
          </div>

          <div className="actions">
            <button type="button" onClick={addContract} disabled={contracts.length >= MAX_CONTRACTS}>
              Add contract
            </button>
            <button className="primary" type="submit" disabled={!canSubmit}>
              {isLoading ? 'Checking holders...' : 'Find shared holders'}
            </button>
          </div>

          {isLoading && (
            <div className="loading" role="status" aria-live="polite">
              <span />
              Fetching holders from Alchemy. Large collections may take a while.
            </div>
          )}

          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
        </form>

        <section className="results" aria-live="polite">
          <div className="results-header">
            <div>
              <h2>Results</h2>
              <p>{result ? 'Holder overlap across selected chains.' : 'Run a check to see holder overlap.'}</p>
            </div>
            <div className="result-actions">
              <button type="button" onClick={copyWallets} disabled={!result?.wallets?.length}>
                {copyStatus || 'Copy wallets'}
              </button>
              <button
                type="button"
                onClick={() => downloadCsv(result.wallets)}
                disabled={!result?.wallets?.length}
              >
                Download CSV
              </button>
            </div>
          </div>

          {result ? (
            <>
              <div className="metrics">
                {result.contracts.map((contract) => (
                  <div className="metric" key={contract.address}>
                    <span>{contract.label}</span>
                    <strong>{contract.holderCount.toLocaleString()}</strong>
                    <small>{contract.chain.label}</small>
                    <small>{contract.address}</small>
                  </div>
                ))}
                <div className="metric shared">
                  <span>Shared holders</span>
                  <strong>{result.sharedHolderCount.toLocaleString()}</strong>
                  <small>Wallets present in every collection</small>
                </div>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Wallet address</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.wallets.length > 0 ? (
                      result.wallets.map((wallet, index) => (
                        <tr key={wallet}>
                          <td>{index + 1}</td>
                          <td>{wallet}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="2">No shared holders found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="empty-state">Holder counts and matching wallet addresses will appear here.</div>
          )}
        </section>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
