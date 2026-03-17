// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

import {IFanFuelBank} from "./interfaces/IFanFuelBank.sol";
import {MerchTwinNFT} from "./MerchTwinNFT.sol";

contract MerchStore is AccessControl {
    struct Sku {
        string skuId;
        uint256 price;
        uint256 stock;
        bool active;
    }

    IFanFuelBank public immutable fanFuelBank;
    MerchTwinNFT public immutable merchTwinNFT;

    mapping(bytes32 skuKey => Sku) private _skus;

    event SkuConfigured(
        bytes32 indexed skuKey,
        string indexed skuId,
        uint256 price,
        uint256 stock,
        bool active
    );
    event Redeemed(
        bytes32 indexed skuKey,
        string indexed skuId,
        address indexed fan,
        uint256 merchTwinId,
        uint256 fuelCost
    );

    constructor(
        address fanFuelBank_,
        address merchTwinNFT_,
        address initialAdmin_
    ) {
        require(fanFuelBank_ != address(0), "Fuel bank is zero address");
        require(merchTwinNFT_ != address(0), "Merch twin NFT is zero address");
        require(initialAdmin_ != address(0), "Admin is zero address");

        fanFuelBank = IFanFuelBank(fanFuelBank_);
        merchTwinNFT = MerchTwinNFT(merchTwinNFT_);
        _grantRole(DEFAULT_ADMIN_ROLE, initialAdmin_);
    }

    function configureSku(
        string calldata skuId,
        uint256 price,
        uint256 stock,
        bool active
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(bytes(skuId).length > 0, "SKU id required");
        bytes32 skuKey = keccak256(bytes(skuId));
        _skus[skuKey] = Sku({
            skuId: skuId,
            price: price,
            stock: stock,
            active: active
        });

        emit SkuConfigured(skuKey, skuId, price, stock, active);
    }

    function getSku(string calldata skuId) external view returns (Sku memory) {
        return _skus[keccak256(bytes(skuId))];
    }

    function redeem(string calldata skuId) external returns (uint256 merchTwinId) {
        bytes32 skuKey = keccak256(bytes(skuId));
        Sku storage sku = _skus[skuKey];
        require(bytes(sku.skuId).length > 0, "SKU not found");
        require(sku.active, "SKU inactive");
        require(sku.stock > 0, "SKU out of stock");

        sku.stock -= 1;
        fanFuelBank.spendFrom(msg.sender, sku.price, skuKey);
        merchTwinId = merchTwinNFT.mintForRedemption(msg.sender, sku.skuId, sku.price);

        emit Redeemed(skuKey, sku.skuId, msg.sender, merchTwinId, sku.price);
    }
}
