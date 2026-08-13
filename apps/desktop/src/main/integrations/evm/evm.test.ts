import assert from "node:assert/strict";
import test from "node:test";
import { EvmVenueProvider, type CrossChainVenueProvider } from "./provider.js";
import { CrossChainExecutionDispatcher } from "./dispatcher.js";

const VALID_EVM_ADDRESS = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"; // vitalik.eth
const INVALID_EVM_ADDRESS = "7LSsEoJGhLeZzGvDofTdNg7M3JttxQqGWNLo6vWMpump"; // Solana address

test("EvmVenueProvider validates 0x addresses and builds EIP-1559 unsigned payloads", () => {
  const provider = new EvmVenueProvider(1); // Ethereum Mainnet

  assert.equal(provider.validateAddress(VALID_EVM_ADDRESS), true);
  assert.equal(provider.validateAddress(INVALID_EVM_ADDRESS), false);

  const unsignedPayload = provider.buildUnsignedTrade({
    to: VALID_EVM_ADDRESS,
    amountWei: "1000000000000000000", // 1 ETH
    nonce: 5,
    maxFeePerGasWei: "30000000000", // 30 Gwei
    maxPriorityFeePerGasWei: "1500000000", // 1.5 Gwei
    gasLimit: "21000",
  });

  assert.equal(unsignedPayload.to, VALID_EVM_ADDRESS);
  assert.equal(unsignedPayload.chainId, 1);
  assert.equal(unsignedPayload.value, "1000000000000000000");
  assert.equal(unsignedPayload.nonce, 5);
});

test("CrossChainExecutionDispatcher registers and routes multi-chain providers", () => {
  const dispatcher = new CrossChainExecutionDispatcher();
  const ethProvider = new EvmVenueProvider(1);
  const arbProvider = new EvmVenueProvider(42161);

  dispatcher.registerProvider("evm:ethereum", ethProvider);
  dispatcher.registerProvider("evm:arbitrum", arbProvider);

  // Solana mock provider
  const mockSolanaProvider: CrossChainVenueProvider = {
    chainType: "solana",
    chainId: "solana-mainnet",
    validateAddress: (addr) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/u.test(addr),
    buildUnsignedTrade: () => {
      throw new Error("Solana uses kit v0 transaction builder");
    },
  };
  dispatcher.registerProvider("solana:mainnet", mockSolanaProvider);

  const registered = dispatcher.listRegisteredChains();
  assert.equal(registered.length, 3);

  // Address validation routing
  assert.equal(dispatcher.validateAddressForChain("evm:ethereum", VALID_EVM_ADDRESS), true);
  assert.equal(dispatcher.validateAddressForChain("evm:ethereum", INVALID_EVM_ADDRESS), false);

  assert.equal(dispatcher.validateAddressForChain("solana:mainnet", INVALID_EVM_ADDRESS), true);
  assert.equal(dispatcher.validateAddressForChain("solana:mainnet", VALID_EVM_ADDRESS), false);
});
