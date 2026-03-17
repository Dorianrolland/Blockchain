// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

import {IFanFuelBank} from "./interfaces/IFanFuelBank.sol";
import {IFanScoreRegistry} from "./interfaces/IFanScoreRegistry.sol";

contract PerkManager is AccessControl {
    struct Perk {
        bytes32 artistKey;
        uint256 minScore;
        uint256 minAttendances;
        uint256 fuelCost;
        bool active;
        string metadataURI;
    }

    IFanScoreRegistry public immutable fanScoreRegistry;
    IFanFuelBank public immutable fanFuelBank;

    mapping(bytes32 perkId => Perk) private _perks;

    event PerkConfigured(
        bytes32 indexed perkId,
        bytes32 indexed artistKey,
        uint256 minScore,
        uint256 minAttendances,
        uint256 fuelCost,
        bool active
    );
    event PerkRedeemed(bytes32 indexed perkId, address indexed fan, uint256 fuelCost);

    constructor(
        address fanScoreRegistry_,
        address fanFuelBank_,
        address initialAdmin_
    ) {
        require(fanScoreRegistry_ != address(0), "Score registry is zero address");
        require(fanFuelBank_ != address(0), "Fuel bank is zero address");
        require(initialAdmin_ != address(0), "Admin is zero address");

        fanScoreRegistry = IFanScoreRegistry(fanScoreRegistry_);
        fanFuelBank = IFanFuelBank(fanFuelBank_);

        _grantRole(DEFAULT_ADMIN_ROLE, initialAdmin_);
    }

    function configurePerk(
        bytes32 perkId,
        bytes32 artistKey,
        uint256 minScore,
        uint256 minAttendances,
        uint256 fuelCost,
        string calldata metadataURI,
        bool active
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _perks[perkId] = Perk({
            artistKey: artistKey,
            minScore: minScore,
            minAttendances: minAttendances,
            fuelCost: fuelCost,
            active: active,
            metadataURI: metadataURI
        });

        emit PerkConfigured(
            perkId,
            artistKey,
            minScore,
            minAttendances,
            fuelCost,
            active
        );
    }

    function perkOf(bytes32 perkId) external view returns (Perk memory) {
        return _perks[perkId];
    }

    function canAccess(address fan, bytes32 perkId) public view returns (bool unlocked) {
        Perk memory perk = _perks[perkId];
        if (!perk.active) {
            return false;
        }

        if (fanScoreRegistry.reputationOf(fan) < perk.minScore) {
            return false;
        }

        if (fanScoreRegistry.artistAttendanceOf(fan, perk.artistKey) < perk.minAttendances) {
            return false;
        }

        return true;
    }

    function redeemPerk(bytes32 perkId) external {
        Perk memory perk = _perks[perkId];
        require(canAccess(msg.sender, perkId), "Perk is locked");

        if (perk.fuelCost > 0) {
            fanFuelBank.spendFrom(msg.sender, perk.fuelCost, keccak256("PERK_REDEMPTION"));
        }

        emit PerkRedeemed(perkId, msg.sender, perk.fuelCost);
    }
}
