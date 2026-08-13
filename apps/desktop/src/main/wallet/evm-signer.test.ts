import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { EvmSignerService, privateKeyToEvmAddress, ROBINHOOD_CHAIN_CONFIG } from "./evm-signer.js";

describe("EvmSignerService", () => {
  it("derives valid 0x EVM address from private key", () => {
    const pk = new Uint8Array(32).fill(7);
    const address = privateKeyToEvmAddress(pk);
    assert.match(address, /^0x[0-9a-fA-F]{40}$/);
  });

  it("derives EVM signer from valid BIP-39 mnemonic", () => {
    const mnemonic = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
    const signer = EvmSignerService.fromMnemonic(mnemonic);
    assert.match(signer.getAddress(), /^0x[0-9a-fA-F]{40}$/);
  });

  it("signs message producing 0x hex signature", async () => {
    const pk = new Uint8Array(32).fill(9);
    const signer = new EvmSignerService(pk);
    const res = await signer.signMessage("Hello EVM");
    assert.equal(res.address, signer.getAddress());
    assert.match(res.signature, /^0x[0-9a-fA-F]+$/);
  });

  it("signs EIP-1559 transaction request for Robinhood Chain", async () => {
    const pk = new Uint8Array(32).fill(11);
    const signer = new EvmSignerService(pk);
    const signedTx = await signer.signTransaction({
      to: "0x1111111111111111111111111111111111111111",
      value: 1000000000000000000n, // 1 ETH
      nonce: 0,
      gasLimit: 21000n,
      maxFeePerGas: 20000000000n,
      maxPriorityFeePerGas: 1000000000n,
      chainId: ROBINHOOD_CHAIN_CONFIG.chainId, // 4663
    });

    assert.match(signedTx.rawTransaction, /^0x[0-9a-fA-F]+$/);
    assert.match(signedTx.txHash, /^0x[0-9a-fA-F]{64}$/);
    assert.notEqual(signedTx.txHash, signedTx.rawTransaction.slice(0, 66));
  });
});
