# Virtuals Sniper

⚠️ IMPORTANT NOTICE — NOT WORKING ANYMORE

This project no longer works as-is. The Virtuals protocol has been updated and the contracts/flows this bot relied on have changed. The README below is retained for historical and reference purposes only. Do not run this code on mainnet without first auditing and updating it to match the current Virtuals protocol contracts and workflows.


A small Web3 "sniper" for the Virtuals protocol (Base network). This project listens for new token launches through the Virtuals buy contract, attempts a quick buy, then monitors the position and can liquidate on configurable conditions.

This repository contains a minimal TypeScript implementation that uses ethers.js to:
- connect to the Base network
- monitor blocks and detect Virtuals buy transactions
- execute a buy via the Virtuals buy contract
- monitor token balances and pair reserves to compute PnL
- sell tokens automatically on stop-loss / take-profit conditions

-- IMPORTANT: This tool interacts with mainnet funds. Using it involves significant financial and technical risks. Read the "Risks & Disclaimer" section before using.

## Contents

- `src/index.ts` — main sniper implementation (buy, approve, monitor, sell)
- `src/launch_abi.json`, `src/approve_abi.json`, `src/reserves_abi.json` — contract ABIs used by the bot

## Quick overview of how it works

1. Connects to the Base RPC (`https://mainnet.base.org`).
2. Ensures the wallet has approved the Virtuals router contract for token transfers.
3. Watches blocks and scans transactions targeting the Virtuals buy contract.
4. When a new token launch is detected, the bot attempts to buy the token (configurable amount).
5. After buying, it monitors the token balance and the token pair's reserves to compute the current price and PnL.
6. On configured thresholds (e.g., heavy loss or target profit), it sells the token (full or partial sell).

## Requirements

- Node.js 18+ (or compatible with the project's TypeScript/Node setup)
- Yarn or npm
- A funded wallet on Base (Mainnet) and the private key in environment variables

## Setup

1. Clone the repo and install dependencies:

```bash
# from the project root
npm install
```

2. Provide environment variables. Create a `.env` file in the project root with:

```
WALLET_PRIVATE_KEY=your_private_key_here
ANKR_KEY=optional_ankr_key
```

The code reads `WALLET_PRIVATE_KEY` from the environment. Keep this secret and never share it.

## Configuration

Some constants are defined in `src/index.ts` (you can change them as needed):

- `VIRTUALS_BUY_ADDRESS` — the Virtuals buy contract address used to perform buys/sells
- `VIRTUALS_TOKEN_ADDRESS` — a default token approval target address
- `VIRTUALS_BUY_INPUT_DATA_ADDRESS` — used for approvals
- `GAS_LIMIT` — used when retrying replacement transactions

Adjust these constants or wire them to a config file if you need runtime configuration.

## Usage

There are three helper functions in `src/index.ts` for manual control besides the automatic `main()` flow:

- `manualBuy(tokenAddress: string, amount: string)` — manually buy a token (amount in ETH-equivalent units)
- `manualMonitor(tokenAddress: string, buyHash: string)` — start monitoring an existing buy by hash
- `manualSell(tokenAddress: string)` — helper to call the sell flow manually

Run the bot:

```bash
npm start:dev
```

Notes:
- The code currently uses `ethers.JsonRpcProvider` pointed at `https://mainnet.base.org`.
- The bot logs operations to stdout, including PnL and sell/buy transaction hashes.

## Risks & Disclaimer

This project is provided for educational purposes. Running any sniper or automated trading bot on mainnet exposes you to:

- Total loss of funds due to smart contract bugs, rug-pulls, or malicious token logic.
- Losses from frontrunning, MEV or transaction reorderings.
- Unintended high gas fees from repeated transaction retries.

Do not run this with a wallet that contains funds you cannot afford to lose. Test thoroughly on a testnet or with a small amount first.

## Security

- Keep your private keys offline and use environment variables or secure secret storage.
- Consider using a hardware wallet or a signing service for larger funds.

## Contributing

If you want to improve the project (tests, better configuration, safer sell/buy logic, typed ABIs), please open a PR.

## License

This repo does not include a license file. Add one if you intend to open-source this project.

---

If you'd like, I can also:

- add a small CONTRIBUTING or SECURITY guide
- add a minimal TypeScript build / test step
- extract constants into a `config` file or add CLI arguments for manual operations

Tell me which of the above you'd like next.

