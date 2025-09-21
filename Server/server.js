require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');
const { Pool } = require('pg');
const { ChillMoneySDK } = require('./dist/index.js');

const app = express();
const PORT = process.env.PORT || 3011;

// Middleware
app.use(cors());
app.use(express.json());

// Environment variable validation
const requiredEnvVars = [
  'PRIVATE_KEY',
  'BASE_RPC_URL',
  'ARBITRUM_RPC_URL', 
  'AVALANCHE_RPC_URL',
  'ETHEREUM_RPC_URL',
  'DATABASE_URL',
  'BASE_FACTORY_ADDRESS',
  'ARBITRUM_FACTORY_ADDRESS',
  'AVALANCHE_FACTORY_ADDRESS',
  'AVALANCHE_TRANSFER_FACTORY_ADDRESS'
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`❌ Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

// Fixed destination domain
const DESTINATION_DOMAIN = 1;

// Load from environment
const PRIVATE_KEY = process.env.PRIVATE_KEY;

// Initialize ChillMoney SDK
const sdk = new ChillMoneySDK({
  baseRpcUrl: process.env.BASE_RPC_URL,
  arbitrumRpcUrl: process.env.ARBITRUM_RPC_URL,
  avalancheRpcUrl: process.env.AVALANCHE_RPC_URL,
  retryDelay: parseInt(process.env.RETRY_DELAY) || 3000,
  maxRetries: parseInt(process.env.MAX_RETRIES) || 100
});
const FACTORY_ABI = [
  "function owner() external view returns (address)",
  "function createSingleWallet(uint32 destinationDomain, bytes32 mintRecipient) external returns (address walletAddress)",
  "event WalletCreated(address indexed wallet, uint32 destinationDomain, bytes32 mintRecipient)"
];

// Avalanche Transfer Factory ABI (different from burn factories)
const AVALANCHE_TRANSFER_ABI = [
  "function owner() external view returns (address)",
  "function createSingleWallet(address destination) external returns (address walletAddress)",
  "event WalletCreated(address indexed wallet, address indexed destination)"
];

// Chain configs (testnets as used in existing server)
const CHAIN_CONFIGS = {

    arbitrum: {
        rpc: process.env.ARBITRUM_RPC_URL,
        factory: process.env.ARBITRUM_FACTORY_ADDRESS,
        label: "Arbitrum Sepolia"
    },
  
  
  base: {
    rpc: process.env.BASE_RPC_URL,
    factory: process.env.BASE_FACTORY_ADDRESS,
    label: "Base Sepolia"
  },
  avalanche: {
    rpc: process.env.AVALANCHE_RPC_URL,
    factory: process.env.AVALANCHE_FACTORY_ADDRESS,
    label: "Avalanche Fuji"
  }
};

// Avalanche Transfer Factory config (different from burn factories)
const AVALANCHE_TRANSFER_CONFIG = {
  rpc: process.env.AVALANCHE_RPC_URL,
  factory: process.env.AVALANCHE_TRANSFER_FACTORY_ADDRESS,
  label: "Avalanche Fuji Transfer"
};

// Burn USDC configs
const BURN_CONFIGS = {
  eth: {
    rpc: process.env.ETHEREUM_RPC_URL,
    label: "ETH Sepolia",
    chainId: 0
  },
  base: {
    rpc: process.env.BASE_RPC_URL,
    label: "Base Sepolia",
    chainId: 6
  },
  avalanche: {
    rpc: process.env.AVALANCHE_RPC_URL,
    label: "Avalanche Fuji",
    chainId: 1
  }
};

// Arbitrum mint config
const ARBITRUM_CONFIG = {
  rpc: process.env.ARBITRUM_RPC_URL,
  messageTransmitter: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275"
};

const MESSAGE_TRANSMITTER_ABI = [
  {
    type: 'function',
    name: 'receiveMessage',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'message', type: 'bytes' },
      { name: 'attestation', type: 'bytes' },
    ],
    outputs: [],
  },
];

// --- Generic retry wrapper for any action ---
async function runWithRetries(action, { maxAttempts = 3, baseDelayMs = 1000 } = {}) {
  let attempt = 0;
  let lastErr;
  while (attempt < maxAttempts) {
    try {
      attempt++;
      return await action();
    } catch (err) {
      lastErr = err;
      if (attempt >= maxAttempts) break;
      const delay = baseDelayMs * attempt;
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

// --- Database ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function initDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS monomausers (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        smartwallets JSONB,
        account BOOLEAN DEFAULT false,
        chains TEXT,
        destined_address TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_monomausers_email ON monomausers(email)`);
    // Requests table
    await client.query(`
      CREATE TABLE IF NOT EXISTS monomarequests (
        payid VARCHAR(64) PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        smartwallets JSONB,
        amount DECIMAL(18,8),
        status VARCHAR(50),
        hash VARCHAR(255),
        descriptions TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    // Migrate existing schema if it was created with SERIAL
    await client.query(`DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='monomarequests' AND column_name='payid' AND data_type IN ('integer','bigint')
      ) THEN
        ALTER TABLE monomarequests ALTER COLUMN payid DROP DEFAULT;
        ALTER TABLE monomarequests ALTER COLUMN payid TYPE VARCHAR(64);
      END IF;
    END $$;`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_monomarequests_email ON monomarequests(email)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_monomarequests_payid ON monomarequests(payid)`);
    console.log('✅ monomausers table ready');
    console.log('✅ monomarequests table ready');
  } finally {
    client.release();
  }
}

function isRetryableNetworkError(err) {
  const message = (err && err.message ? err.message : '').toLowerCase();
  const code = err && err.code ? String(err.code) : '';
  // Common transient/network conditions
  return (
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('network error') ||
    message.includes('getaddrinfo') ||
    message.includes('enotfound') ||
    message.includes('dns') ||
    message.includes('socket hang up') ||
    message.includes('econnreset') ||
    message.includes('etimedout') ||
    message.includes('failed to detect network') ||
    message.includes('cannot start up') ||
    message.includes('503') ||
    message.includes('rate limit') ||
    message.includes('too many requests') ||
    code === 'NETWORK_ERROR' ||
    code === 'ENOTFOUND' ||
    code === 'SERVER_ERROR' ||
    code === 'TIMEOUT'
  );
}

async function createWalletOnChain(chainKey, mintRecipient) {
  const cfg = CHAIN_CONFIGS[chainKey];
  if (!cfg) {
    throw new Error(`Unsupported chain ${chainKey}. Use eth, base, avalanche.`);
  }

  let attempts = 0;
  const maxAttempts = 6;
  while (attempts < maxAttempts) {
    try {
      attempts++;
      console.log(`🔄 ${cfg.label} attempt ${attempts} to create wallet...`);

      // Recreate provider/signer/contract each attempt to recover from provider startup issues
      const provider = new ethers.JsonRpcProvider(cfg.rpc);
      const signer = new ethers.Wallet(PRIVATE_KEY, provider);
      const factory = new ethers.Contract(cfg.factory, FACTORY_ABI, signer);

      // Verify ownership like existing server
      const owner = await factory.owner();
      if (owner.toLowerCase() !== signer.address.toLowerCase()) {
        throw new Error("Not factory owner");
      }

      const tx = await factory.createSingleWallet(DESTINATION_DOMAIN, mintRecipient);
      const receipt = await tx.wait();

      const eventLog = receipt.logs.find(log => {
        try {
          const parsed = factory.interface.parseLog(log);
          return parsed.name === "WalletCreated";
        } catch {
          return false;
        }
      });

      if (!eventLog) throw new Error("Wallet creation failed - no event found");

      const parsed = factory.interface.parseLog(eventLog);
      const walletAddress = parsed.args.wallet;
      console.log(`✅ ${cfg.label} wallet: ${walletAddress}`);
      return walletAddress;
    } catch (err) {
      console.error(`❌ ${cfg.label} attempt ${attempts} failed:`, err.message);
      // Retry on ANY error type
      if (attempts >= maxAttempts) throw err;
      const backoffMs = 1500 * attempts;
      await new Promise(r => setTimeout(r, backoffMs));
    }
  }
}

// Separate function for Avalanche transfer wallet creation
async function createAvalancheTransferWallet(destinationAddress) {
  const cfg = AVALANCHE_TRANSFER_CONFIG;
  
  // Check if wallet already exists for this destination
  try {
    const provider = new ethers.JsonRpcProvider(cfg.rpc);
    const factory = new ethers.Contract(cfg.factory, AVALANCHE_TRANSFER_ABI, provider);
    
    // Check recent events to see if wallet was already created for this destination
    const filter = factory.filters.WalletCreated(null, destinationAddress);
    const events = await factory.queryFilter(filter, -50); // Check last 50 blocks
    
    if (events.length > 0) {
      const latestEvent = events[events.length - 1];
      const walletAddress = latestEvent.args.wallet;
      console.log(`✅ ${cfg.label} transfer wallet (already exists): ${walletAddress}`);
      return walletAddress;
    }
  } catch (e) {
    console.log(`Could not check existing wallets, proceeding with creation...`);
  }
  
  let attempts = 0;
  const maxAttempts = 3; // Reduced attempts
  while (attempts < maxAttempts) {
    try {
      attempts++;
      console.log(`🔄 ${cfg.label} attempt ${attempts} to create transfer wallet...`);

      // Recreate provider/signer/contract each attempt
      const provider = new ethers.JsonRpcProvider(cfg.rpc);
      const signer = new ethers.Wallet(PRIVATE_KEY, provider);
      const factory = new ethers.Contract(cfg.factory, AVALANCHE_TRANSFER_ABI, signer);

      // Verify ownership
      const owner = await factory.owner();
      if (owner.toLowerCase() !== signer.address.toLowerCase()) {
        throw new Error("Not factory owner");
      }

      // Create wallet with address destination (not bytes32)
      const tx = await factory.createSingleWallet(destinationAddress);
      const receipt = await tx.wait();

      const eventLog = receipt.logs.find(log => {
        try {
          const parsed = factory.interface.parseLog(log);
          return parsed.name === "WalletCreated";
        } catch {
          return false;
        }
      });

      if (!eventLog) throw new Error("Wallet creation failed - no event found");

      const parsed = factory.interface.parseLog(eventLog);
      const walletAddress = parsed.args.wallet;
      console.log(`✅ ${cfg.label} transfer wallet: ${walletAddress}`);
      return walletAddress;
    } catch (err) {
      console.error(`❌ ${cfg.label} attempt ${attempts} failed:`, err.message);
      
      // Handle "already known" error - transaction was submitted but we need to wait for it
      if (err.message.includes("already known")) {
        console.log(`⏳ Transaction already submitted, waiting for confirmation...`);
        // Wait longer for the transaction to be mined
        await new Promise(r => setTimeout(r, 10000));
        // Try to get the transaction result
        try {
          const provider = new ethers.JsonRpcProvider(cfg.rpc);
          const factory = new ethers.Contract(cfg.factory, AVALANCHE_TRANSFER_ABI, provider);
          
          // Check recent events to see if wallet was created
          const filter = factory.filters.WalletCreated();
          const events = await factory.queryFilter(filter, -20); // Check last 20 blocks
          
          if (events.length > 0) {
            const latestEvent = events[events.length - 1];
            const walletAddress = latestEvent.args.wallet;
            console.log(`✅ ${cfg.label} transfer wallet (from already known tx): ${walletAddress}`);
            return walletAddress;
          }
        } catch (e) {
          console.log(`Could not retrieve wallet from already known transaction`);
        }
        // If we can't retrieve it, continue to next attempt
      }
      
      if (attempts >= maxAttempts) throw err;
      const backoffMs = 3000 * attempts; // Longer backoff
      await new Promise(r => setTimeout(r, backoffMs));
    }
  }
}

// --- Fetch attestation from Circle API ---
async function fetchAttestation(chainId, transactionHash) {
  const url = `https://iris-api-sandbox.circle.com/v2/messages/${chainId}?transactionHash=${transactionHash}`;
  
  let attempts = 0;
  const maxAttempts = 10;
  
  while (attempts < maxAttempts) {
    try {
      attempts++;
      console.log(`🔄 Attempt ${attempts} to fetch attestation for ${transactionHash}...`);
      
      // Wait 10 seconds before first attempt, then 5 seconds between retries
      if (attempts === 1) {
        await new Promise(r => setTimeout(r, 10000));
      } else {
        await new Promise(r => setTimeout(r, 5000));
      }
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.messages && data.messages.length > 0) {
        const message = data.messages[0];
        if (message.attestation && message.status === 'complete') {
          console.log(`✅ Attestation fetched: ${message.attestation.substring(0, 20)}...`);
          return {
            attestation: message.attestation,
            message: message.message,
            status: message.status
          };
        }
      }
      
      console.log(`⏳ Attestation not ready yet (attempt ${attempts}/${maxAttempts})`);
      
    } catch (error) {
      console.error(`❌ Error fetching attestation (attempt ${attempts}):`, error.message);
      if (attempts >= maxAttempts) throw error;
    }
  }
  
  throw new Error('Failed to fetch attestation after maximum attempts');
}

// --- Mint on Arbitrum using attestation ---
async function mintOnArbitrum(attestation, message) {
  const provider = new ethers.JsonRpcProvider(ARBITRUM_CONFIG.rpc);
  const signer = new ethers.Wallet(PRIVATE_KEY, provider);
  
  const contract = new ethers.Contract(ARBITRUM_CONFIG.messageTransmitter, MESSAGE_TRANSMITTER_ABI, signer);
  
  console.log(`🪙 Minting on Arbitrum with attestation...`);
  const tx = await contract.receiveMessage(message, attestation);
  const receipt = await tx.wait();
  
  console.log(`✅ Arbitrum mint success: ${tx.hash}`);
  return {
    chain: 'arbitrum',
    transactionHash: tx.hash,
    gasUsed: receipt.gasUsed.toString()
  };
}

// --- Burn USDC function ---
async function burnUSDCOnChain(chainKey, walletAddress, amount) {
  const cfg = BURN_CONFIGS[chainKey];
  if (!cfg) {
    throw new Error(`Unsupported chain ${chainKey}. Use eth, base, avalanche.`);
  }

  const provider = new ethers.JsonRpcProvider(cfg.rpc);
  const signer = new ethers.Wallet(PRIVATE_KEY, provider);

  const abi = [
    {
      name: "burnUSDC",
      type: "function",
      stateMutability: "nonpayable",
      inputs: [{ name: "amount", type: "uint256" }],
      outputs: [],
    },
  ];

  const contract = new ethers.Contract(walletAddress, abi, signer);

  console.log(`🔥 ${cfg.label} burning ${amount} wei from ${walletAddress}`);
  const tx = await contract.burnUSDC(amount);
  const receipt = await tx.wait();

  console.log(`✅ ${cfg.label} burn success: ${tx.hash}`);
  
  // Fetch attestation and mint on Arbitrum
  console.log(`⏳ Waiting for attestation...`);
  const attestationData = await fetchAttestation(cfg.chainId, tx.hash);
  
  console.log(`🪙 Minting on Arbitrum...`);
  const mintResult = await mintOnArbitrum(attestationData.attestation, attestationData.message);
  
  return {
    chain: chainKey,
    transactionHash: tx.hash,
    gasUsed: receipt.gasUsed.toString(),
    walletAddress,
    amountBurned: amount,
    attestation: attestationData.attestation,
    arbitrumMint: mintResult
  };
}

// Health
app.get('/health', (req, res) => {
  res.json({ status: 'OK', service: 'monoma-server', destinationDomain: DESTINATION_DOMAIN });
});

// --- Monoma Users API ---
// Upsert user by email
app.post('/api/monomausers', async (req, res) => {
  try {
    const { email, smartwallets, account, chains, destinedAddress } = req.body || {};
    if (!email) {
      return res.status(400).json({ error: 'email is required' });
    }

    const handler = async () => {
      const existing = await pool.query('SELECT * FROM monomausers WHERE email = $1', [email]);
      if (existing.rows.length > 0) {
        const fields = [];
        const values = [email];
        let n = 1;
        if (smartwallets !== undefined) { fields.push(`smartwallets = $${++n}`); values.push(smartwallets); }
        if (account !== undefined) { fields.push(`account = $${++n}`); values.push(account); }
        if (chains !== undefined) { fields.push(`chains = $${++n}`); values.push(chains); }
        if (destinedAddress !== undefined) { fields.push(`destined_address = $${++n}`); values.push(destinedAddress); }
        if (fields.length === 0) {
          return { status: 400, body: { error: 'no fields to update' } };
        }
        const result = await pool.query(`
          UPDATE monomausers
          SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
          WHERE email = $1
          RETURNING *
        `, values);
        return { status: 200, body: { user: result.rows[0] } };
      } else {
        const result = await pool.query(`
          INSERT INTO monomausers (email, smartwallets, account, chains, destined_address)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING *
        `, [email, smartwallets || null, account === true, chains || null, destinedAddress || null]);
        return { status: 201, body: { user: result.rows[0] } };
      }
    };

    const outcome = await runWithRetries(handler, { maxAttempts: 5, baseDelayMs: 500 });
    if (outcome.status !== 200 && outcome.status !== 201) {
      return res.status(outcome.status).json(outcome.body);
    }
    return res.status(outcome.status).json(outcome.body);
  } catch (err) {
    console.error('Error in POST /api/monomausers:', err);
    res.status(500).json({ error: 'internal error' });
  }
});

// --- Monoma Requests API ---
// Create a new request
app.post('/api/monomarequests', async (req, res) => {
  try {
    const { payid, email, smartwallets, amount, status, hash, descriptions } = req.body || {};
    if (!email || !amount) {
      return res.status(400).json({ error: 'email and amount are required' });
    }

    const handler = async () => {
      const id = payid || null;
      const result = await pool.query(`
        INSERT INTO monomarequests (payid, email, smartwallets, amount, status, hash, descriptions)
        VALUES (COALESCE($1, CONCAT('REQ', EXTRACT(EPOCH FROM NOW())::bigint::text, '-', floor(random()*1e6)::bigint::text)), $2, $3, $4, $5, $6, $7)
        RETURNING *
      `, [id, email, smartwallets || null, amount, status || null, hash || null, descriptions || null]);
      return { status: 201, body: { request: result.rows[0] } };
    };

    const outcome = await runWithRetries(handler, { maxAttempts: 5, baseDelayMs: 500 });
    return res.status(outcome.status).json(outcome.body);
  } catch (err) {
    console.error('Error in POST /api/monomarequests:', err);
    res.status(500).json({ error: 'internal error' });
  }
});

// Get request by payid
app.get('/api/monomarequests/:payid', async (req, res) => {
  try {
    const { payid } = req.params;
    const handler = async () => {
      const result = await pool.query('SELECT * FROM monomarequests WHERE payid = $1', [payid]);
      if (result.rows.length === 0) return { status: 404, body: { error: 'not found' } };
      return { status: 200, body: { request: result.rows[0] } };
    };
    const outcome = await runWithRetries(handler, { maxAttempts: 5, baseDelayMs: 500 });
    return res.status(outcome.status).json(outcome.body);
  } catch (err) {
    console.error('Error in GET /api/monomarequests/:payid:', err);
    res.status(500).json({ error: 'internal error' });
  }
});

// Get all requests by email
app.get('/api/monomarequests/mail/:email', async (req, res) => {
  try {
    const { email } = req.params;
    const handler = async () => {
      const result = await pool.query('SELECT * FROM monomarequests WHERE email = $1 ORDER BY created_at DESC', [email]);
      return { status: 200, body: { count: result.rows.length, requests: result.rows } };
    };
    const outcome = await runWithRetries(handler, { maxAttempts: 5, baseDelayMs: 500 });
    return res.status(outcome.status).json(outcome.body);
  } catch (err) {
    console.error('Error in GET /api/monomarequests/mail/:email:', err);
    res.status(500).json({ error: 'internal error' });
  }
});

// Update status and/or hash by payid
app.patch('/api/monomarequests/:payid', async (req, res) => {
  try {
    const { payid } = req.params;
    const { status, hash, descriptions } = req.body || {};

    const handler = async () => {
      const exists = await pool.query('SELECT 1 FROM monomarequests WHERE payid = $1', [payid]);
      if (exists.rows.length === 0) return { status: 404, body: { error: 'not found' } };
      const fields = [];
      const values = [payid];
      let n = 1;
      if (status !== undefined) { fields.push(`status = $${++n}`); values.push(status); }
      if (hash !== undefined) { fields.push(`hash = $${++n}`); values.push(hash); }
      if (descriptions !== undefined) { fields.push(`descriptions = $${++n}`); values.push(descriptions); }
      if (fields.length === 0) return { status: 400, body: { error: 'no fields to update' } };
      const result = await pool.query(`
        UPDATE monomarequests
        SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE payid = $1
        RETURNING *
      `, values);
      return { status: 200, body: { request: result.rows[0] } };
    };

    const outcome = await runWithRetries(handler, { maxAttempts: 5, baseDelayMs: 500 });
    return res.status(outcome.status).json(outcome.body);
  } catch (err) {
    console.error('Error in PATCH /api/monomarequests/:payid:', err);
    res.status(500).json({ error: 'internal error' });
  }
});

// Get user by email
app.get('/api/monomausers/:email', async (req, res) => {
  try {
    const { email } = req.params;
    const handler = async () => {
      const result = await pool.query('SELECT * FROM monomausers WHERE email = $1', [email]);
      if (result.rows.length === 0) return { status: 404, body: { error: 'not found' } };
      return { status: 200, body: { user: result.rows[0] } };
    };
    const outcome = await runWithRetries(handler, { maxAttempts: 5, baseDelayMs: 500 });
    return res.status(outcome.status).json(outcome.body);
  } catch (err) {
    console.error('Error in GET /api/monomausers/:email:', err);
    res.status(500).json({ error: 'internal error' });
  }
});

// Update all user fields by email (partial allowed; updates provided fields)
app.patch('/api/monomausers/:email', async (req, res) => {
  try {
    const { email } = req.params;
    const { smartwallets, account, chains, destinedAddress } = req.body || {};

    const handler = async () => {
      const exists = await pool.query('SELECT 1 FROM monomausers WHERE email = $1', [email]);
      if (exists.rows.length === 0) return { status: 404, body: { error: 'not found' } };

      const fields = [];
      const values = [email];
      let n = 1;
      if (smartwallets !== undefined) { fields.push(`smartwallets = $${++n}`); values.push(smartwallets); }
      if (account !== undefined) { fields.push(`account = $${++n}`); values.push(account); }
      if (chains !== undefined) { fields.push(`chains = $${++n}`); values.push(chains); }
      if (destinedAddress !== undefined) { fields.push(`destined_address = $${++n}`); values.push(destinedAddress); }
      if (fields.length === 0) return { status: 400, body: { error: 'no fields to update' } };

      const result = await pool.query(`
        UPDATE monomausers
        SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE email = $1
        RETURNING *
      `, values);
      return { status: 200, body: { user: result.rows[0] } };
    };

    const outcome = await runWithRetries(handler, { maxAttempts: 5, baseDelayMs: 500 });
    return res.status(outcome.status).json(outcome.body);
  } catch (err) {
    console.error('Error in PATCH /api/monomausers/:email:', err);
    res.status(500).json({ error: 'internal error' });
  }
});

// --- Burn USDC API ---
// Burn USDC from wallet on specific chain
app.post('/api/burn-usdc/:chain', async (req, res) => {
  try {
    const chain = (req.params.chain || '').toLowerCase();
    const { walletAddress, amount } = req.body;
    if (!walletAddress || !amount) {
      return res.status(400).json({ error: 'walletAddress and amount are required' });
    }

    const handler = async () => {
      return await burnUSDCOnChain(chain, walletAddress, amount);
    };

    const result = await runWithRetries(handler, { maxAttempts: 5, baseDelayMs: 1000 });
    res.json(result);
  } catch (error) {
    console.error('Error in POST /api/burn-usdc/:chain:', error);
    res.status(500).json({ error: error.message || 'Internal error' });
  }
});

// --- Test Burn Function API ---
// Test just the burn function to debug
app.post('/api/test-burn', async (req, res) => {
  try {
    const { walletAddress, chain, amount } = req.body;
    
    if (!walletAddress || !chain || !amount) {
      return res.status(400).json({ 
        error: 'walletAddress, chain, and amount are required' 
      });
    }

    // Convert amount
    let amountBigInt;
    if (amount.includes('.')) {
      const decimalAmount = parseFloat(amount);
      amountBigInt = BigInt(Math.floor(decimalAmount * 1000000));
    } else {
      amountBigInt = BigInt(amount);
    }

    console.log(`🧪 Testing burn function only:`);
    console.log(`   Wallet: ${walletAddress}`);
    console.log(`   Chain: ${chain}`);
    console.log(`   Amount: ${amountBigInt} wei`);

    const result = await sdk.burnUSDCWithSmartWallet({
      smartWalletAddress: walletAddress,
      amount: amountBigInt,
      sourceChain: chain.toLowerCase(),
      userAddress: walletAddress,
      privateKey: `0x${PRIVATE_KEY}`
    });

    res.json({
      success: true,
      burnTxHash: result.transactionHash,
      gasUsed: result.gasUsed
    });

  } catch (error) {
    console.error('Error in POST /api/test-burn:', error);
    res.status(500).json({ 
      error: error.message,
      details: 'Burn function test failed'
    });
  }
});

// --- Full SDK Cross-Chain Transfer API ---
// Transfer USDC from any chain to Avalanche using full SDK
app.post('/api/transfer-usdc', async (req, res) => {
  try {
    const { walletAddress, chain, amount } = req.body;
    
    // Validate required fields
    if (!walletAddress || !chain || !amount) {
      return res.status(400).json({ 
        error: 'walletAddress, chain, and amount are required',
        example: {
          walletAddress: '0x5B078e081DA6b8F31b60EED13959f3B6Cf0C8c73',
          chain: 'base', // or 'arbitrum'
          amount: '1000' // in wei (0.001 USDC)
        }
      });
    }

    // Validate chain
    const validChains = ['base', 'arbitrum'];
    if (!validChains.includes(chain.toLowerCase())) {
      return res.status(400).json({ 
        error: 'Invalid chain. Supported chains: base, arbitrum' 
      });
    }

    // Validate and convert amount
    let amountBigInt;
    try {
      // Handle decimal amounts (convert to wei with 6 decimals for USDC)
      if (amount.includes('.')) {
        const decimalAmount = parseFloat(amount);
        if (isNaN(decimalAmount) || decimalAmount <= 0) {
          return res.status(400).json({ 
            error: 'Invalid amount format. Use decimal (e.g., 0.001) or wei (e.g., 1000)' 
          });
        }
        // Convert to wei (6 decimals for USDC)
        amountBigInt = BigInt(Math.floor(decimalAmount * 1000000));
      } else {
        // Handle wei amounts
        amountBigInt = BigInt(amount);
        if (amountBigInt <= 0) {
          return res.status(400).json({ 
            error: 'Amount must be greater than 0' 
          });
        }
      }
    } catch (error) {
      return res.status(400).json({ 
        error: 'Invalid amount format. Use decimal (e.g., 0.001) or wei (e.g., 1000)' 
      });
    }

    console.log(`🚀 Starting full SDK transfer: ${chain} → Avalanche`);
    console.log(`   Wallet: ${walletAddress}`);
    console.log(`   Amount: ${amount} (${amountBigInt} wei)`);

    const handler = async () => {
      console.log(`   🔍 Debug: Starting SDK transfer with params:`);
      console.log(`   - smartWalletAddress: ${walletAddress}`);
      console.log(`   - amount: ${amountBigInt} (${amount})`);
      console.log(`   - sourceChain: ${chain.toLowerCase()}`);
      console.log(`   - userAddress: ${walletAddress}`);
      console.log(`   - privateKey: 0x${PRIVATE_KEY.slice(0, 6)}...${PRIVATE_KEY.slice(-4)}`);

      // Use the EXACT same SDK call as auto-transfer-full-sdk.js
      const result = await sdk.transferUSDCWithSmartWallet({
        smartWalletAddress: walletAddress,
        amount: amountBigInt,
        sourceChain: chain.toLowerCase(),
        userAddress: walletAddress,
        privateKey: `0x${PRIVATE_KEY}`,
        onStep: (step) => {
          console.log(`   📝 Step: ${step}`);
          switch (step) {
            case 'burn':
              console.log(`   🔥 Burning USDC on ${chain} using SDK...`);
              break;
            case 'attestation':
              console.log(`   ⏳ Waiting for Circle attestation using SDK...`);
              break;
            case 'mint':
              console.log(`   ✨ Minting USDC on Avalanche using SDK...`);
              break;
            case 'complete':
              console.log(`   ✅ Transfer completed using SDK!`);
              break;
          }
        }
      });

      console.log(`   🔍 Debug: SDK transfer result:`, result);

      return {
        success: true,
        sourceChain: chain,
        destinationChain: 'avalanche',
        walletAddress: walletAddress,
        amount: amount,
        burnTxHash: result.burnTxHash,
        mintTxHash: result.mintTxHash,
        totalTime: result.totalTime,
        gasUsed: result.gasUsed,
        explorerLinks: {
          burn: `https://${chain === 'base' ? 'sepolia.basescan.org' : 'sepolia.arbiscan.io'}/tx/${result.burnTxHash}`,
          mint: `https://testnet.snowtrace.io/tx/${result.mintTxHash}`
        }
      };
    };

    const result = await runWithRetries(handler, { maxAttempts: 3, baseDelayMs: 2000 });
    res.json(result);
  } catch (error) {
    console.error('Error in POST /api/transfer-usdc:', error);
    res.status(500).json({ 
      error: error.message || 'Internal error',
      details: 'Full SDK cross-chain transfer failed'
    });
  }
});

// Create wallet for a specific chain (fixed destinationDomain=1)
// Body: { mintRecipient: bytes32-string } for burn wallets
// Body: { destination: address-string } for Avalanche transfer wallet
app.post('/api/create-wallet/:chain', async (req, res) => {
  try {
    const chain = (req.params.chain || '').toLowerCase();
    
    if (chain === 'avalanche') {
      // Special handling for Avalanche transfer wallet
      const { destination } = req.body;
      if (!destination) {
        return res.status(400).json({ error: 'destination is required (address) for Avalanche' });
      }
      const address = await createAvalancheTransferWallet(destination);
      res.set('Content-Type', 'text/plain');
      res.send(`${chain.toUpperCase()}: ${address}`);
    } else {
      // Regular burn wallet creation
      const { mintRecipient } = req.body;
      if (!mintRecipient) {
        return res.status(400).json({ error: 'mintRecipient is required (bytes32)' });
      }
      const address = await createWalletOnChain(chain, mintRecipient);
      res.set('Content-Type', 'text/plain');
      res.send(`${chain.toUpperCase()}: ${address}`);
    }
  } catch (error) {
    console.error('Error in POST /api/create-wallet/:chain:', error);
    res.status(500).json({ error: error.message || 'Internal error' });
  }
});

// Create wallets on all chains with Avalanche as destination
// Body: { avalancheDestination: address-string }
app.post('/api/create-wallet-all', async (req, res) => {
  try {
    const { avalancheDestination } = req.body;
    if (!avalancheDestination) {
      return res.status(400).json({ error: 'avalancheDestination is required (address)' });
    }

    const lines = [];
    
    // Step 1: Create Avalanche transfer wallet first
    let avalancheAddress;
    try {
      avalancheAddress = await createAvalancheTransferWallet(avalancheDestination);
      lines.push(`AVALANCHE: ${avalancheAddress}`);
      console.log(`✅ Avalanche transfer wallet created: ${avalancheAddress}`);
    } catch (e) {
      console.error('❌ Failed to create Avalanche transfer wallet:', e.message);
      return res.status(500).json({ error: 'Failed to create Avalanche transfer wallet' });
    }

    // Step 2: Convert Avalanche address to bytes32 for destination
    const avalancheBytes32 = ethers.zeroPadValue(avalancheAddress, 32);
    
    // Step 3: Create other wallets using Avalanche address as destination
    for (const chain of ["arbitrum", "base"]) {
      try {
        const addr = await createWalletOnChain(chain, avalancheBytes32);
        lines.push(`${chain.toUpperCase()}: ${addr}`);
        console.log(`✅ ${chain} wallet created with Avalanche destination: ${addr}`);
      } catch (e) {
        console.error(`❌ Failed to create ${chain} wallet:`, e.message);
        // Continue with other chains even if one fails
      }
    }

    res.set('Content-Type', 'text/plain');
    res.send(lines.join('\n'));
  } catch (error) {
    console.error('Error in POST /api/create-wallet-all:', error);
    res.status(500).json({ error: error.message || 'Internal error' });
  }
});

async function start() {
  await initDatabase();
  app.listen(PORT, () => {
    console.log(`🚀 Monoma server running on port ${PORT}`);
    console.log('📋 Available endpoints:');
    console.log('  GET    /health');
    console.log('  POST   /api/monomausers');
    console.log('  GET    /api/monomausers/:email');
    console.log('  POST   /api/monomarequests');
    console.log('  GET    /api/monomarequests/:payid');
    console.log('  GET    /api/monomarequests/mail/:email');
    console.log('  PATCH  /api/monomarequests/:payid');
    console.log('  POST   /api/burn-usdc/:chain       { walletAddress, amount }');
    console.log('  POST   /api/test-burn              { walletAddress, chain, amount } - TEST BURN ONLY');
    console.log('  POST   /api/transfer-usdc          { walletAddress, chain, amount } - FULL SDK');
    console.log('  POST   /api/create-wallet/:chain   { mintRecipient }');
    console.log('  POST   /api/create-wallet-all      { mintRecipient }');
    console.log('  Fixed destinationDomain = 1');
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

