// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

import {IFanFuelBank} from "./interfaces/IFanFuelBank.sol";

contract FanFuelBank is AccessControl, IFanFuelBank {
    bytes32 public constant REWARDER_ROLE = keccak256("REWARDER_ROLE");
    bytes32 public constant SPENDER_ROLE = keccak256("SPENDER_ROLE");

    mapping(address fan => uint256) private _balances;

    event FuelRewarded(address indexed fan, uint256 amount, bytes32 indexed reason);
    event FuelSpent(address indexed fan, uint256 amount, bytes32 indexed reason);

    constructor(address initialAdmin_) {
        require(initialAdmin_ != address(0), "Admin is zero address");
        _grantRole(DEFAULT_ADMIN_ROLE, initialAdmin_);
    }

    function balanceOf(address fan) external view returns (uint256) {
        return _balances[fan];
    }

    function reward(
        address fan,
        uint256 amount,
        bytes32 reason
    ) external onlyRole(REWARDER_ROLE) {
        require(fan != address(0), "Fan is zero address");
        require(amount > 0, "Amount must be > 0");
        _balances[fan] += amount;
        emit FuelRewarded(fan, amount, reason);
    }

    function spendFrom(
        address fan,
        uint256 amount,
        bytes32 reason
    ) external onlyRole(SPENDER_ROLE) {
        require(fan != address(0), "Fan is zero address");
        require(amount > 0, "Amount must be > 0");
        require(_balances[fan] >= amount, "Insufficient FanFuel");
        _balances[fan] -= amount;
        emit FuelSpent(fan, amount, reason);
    }
}
