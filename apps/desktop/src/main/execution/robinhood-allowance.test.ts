import assert from "node:assert/strict";
import test from "node:test";
import { previewExactRobinhoodAllowance } from "./robinhood-allowance.js";
const token = "0x1111111111111111111111111111111111111111";
const spender = "0x2222222222222222222222222222222222222222";
test("Robinhood allowance preview proposes only the exact shortfall approval", () => {
  const preview = previewExactRobinhoodAllowance({ token, spender, sellAmount: "100", currentAllowance: 99n });
  assert.equal(preview.approvalRequired, true); assert.match(preview.exactApprovalCalldata ?? "", /^0x095ea7b3/u);
});
test("Robinhood allowance preview never creates an approval when sufficient", () => {
  const preview = previewExactRobinhoodAllowance({ token, spender, sellAmount: "100", currentAllowance: 100n });
  assert.equal(preview.approvalRequired, false); assert.equal(preview.exactApprovalCalldata, null);
});
