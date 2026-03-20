import { Interface } from "ethers";
import { describe, expect, it } from "vitest";

import { decodeFactoryDeploymentResult } from "./eventCatalog";

const factoryV2Interface = new Interface([
  "function getEventAt(uint256 index) view returns ((string eventId,string name,string symbol,string artistId,string seriesId,uint256 primaryPrice,uint256 maxSupply,uint256 fanPassAllocationBps,uint256 artistRoyaltyBps,address treasury,address admin,address ticketNFT,address marketplace,address checkInRegistry,address collectibleContract,address fanScoreRegistry,address fanFuelBank,address insurancePool,address oracleAdapter,address merchStore,address perkManager,uint256 deploymentBlock,uint256 registeredAt))",
]);

describe("decodeFactoryDeploymentResult", () => {
  it("maps a v2 deployment to the shared frontend event shape", () => {
    const encoded = factoryV2Interface.encodeFunctionResult("getEventAt", [[
      "chainticket-upgrade-demo-20260317",
      "ChainTicket Event",
      "CTK",
      "chainticket-demo-artist",
      "founders-tour-2026",
      100000000000000000n,
      100n,
      3000n,
      500n,
      "0xF5653Efc3BCAC6Bdc83B7F9E0E3d19b54bAA7204",
      "0xF5653Efc3BCAC6Bdc83B7F9E0E3d19b54bAA7204",
      "0xd4213d60832294182A4d5ce82D20538B565efc44",
      "0x1f6EC1Aa94135d2F9B041550258864b4f6EC804d",
      "0x6A36806a87DaE75D4A0523f551686cc3C4c08CAb",
      "0xf66ea1420e5F2f12E99f48442786D46C2501bF87",
      "0x04f94ebaE19311156b03635b0e572035F1f3C1BD",
      "0x2756e4c83135d7B96371E314ca843D9b5aEef06B",
      "0xE5FE07BEC7BDD12c81bE9C29C4AC6E23af016015",
      "0x18CD133d4416C4E3c4E0075e5eB4AD41c2271412",
      "0xD2Bf36dFE39842339f7B9ecb1512f1e9a6d290DF",
      "0x2209B6BDF1d5bAdb5Ae853FFE802ebCe3302F1eA",
      35309527n,
      1773746591n,
    ]]);

    expect(decodeFactoryDeploymentResult(encoded)).toMatchObject({
      ticketEventId: "chainticket-upgrade-demo-20260317",
      name: "ChainTicket Event",
      symbol: "CTK",
      primaryPriceWei: "100000000000000000",
      maxSupply: "100",
      ticketNftAddress: "0xd4213d60832294182A4d5ce82D20538B565efc44",
      marketplaceAddress: "0x1f6EC1Aa94135d2F9B041550258864b4f6EC804d",
      checkInRegistryAddress: "0x6A36806a87DaE75D4A0523f551686cc3C4c08CAb",
      deploymentBlock: 35309527,
      registeredAt: 1773746591,
    });
  });
});
